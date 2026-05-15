// Server function called from the "Add site" dialog. The user types the
// 6-character pairing code their local device is showing; we validate it,
// create a site owned by the current user, and bind the agent's
// hardware_id to it so the agent's next /pair-status poll learns its
// site_id and device_token.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const claimPairingCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      code: z.string().regex(/^[A-Z0-9]{6}$/, "Código inválido (6 letras o números)"),
      site_name: z.string().trim().min(1).max(120).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const code = data.code.toUpperCase();

    const { data: pc, error: pcErr } = await supabaseAdmin
      .from("pairing_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (pcErr) throw new Error(pcErr.message);
    if (!pc) throw new Error("Código no encontrado. Verifica que aparezca en la pantalla de tu dispositivo.");
    if (pc.claimed_by_site) throw new Error("Este código ya fue usado.");
    if (new Date(pc.expires_at).getTime() < Date.now()) {
      throw new Error("Este código expiró. Genera uno nuevo desde el dispositivo.");
    }

    // Reuse an existing site if this hardware was already registered.
    const { data: existing } = await supabaseAdmin
      .from("sites")
      .select("*")
      .eq("hardware_id", pc.hardware_id)
      .maybeSingle();

    let siteId: string;
    if (existing) {
      // Re-bind to the current user, in case ownership transferred.
      await supabaseAdmin
        .from("sites")
        .update({
          owner_id: userId,
          name: data.site_name ?? existing.name,
          inverter_model: pc.inverter_model ?? existing.inverter_model,
          inverter_serial: pc.inverter_serial ?? existing.inverter_serial,
        })
        .eq("id", existing.id);
      siteId = existing.id;
    } else {
      const name = (data.site_name?.trim() || `Pi-${pc.hardware_id.slice(-6)}`).slice(0, 120);
      const TRIAL_DAYS = 30;
      const { data: site, error: sErr } = await supabaseAdmin
        .from("sites")
        .insert({
          owner_id: userId,
          name,
          hardware_id: pc.hardware_id,
          inverter_model: pc.inverter_model,
          inverter_serial: pc.inverter_serial,
          status: "online",
          plan: "trial",
          license_expires_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
        })
        .select()
        .single();
      if (sErr || !site) throw new Error(sErr?.message ?? "no se pudo crear el sitio");
      siteId = site.id;
    }

    await supabaseAdmin
      .from("pairing_codes")
      .update({
        claimed_by_site: siteId,
        claimed_by_user: userId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", pc.id);

    return { ok: true, site_id: siteId };
  });
