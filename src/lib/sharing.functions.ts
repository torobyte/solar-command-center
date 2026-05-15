import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Accept a site invitation by token. Uses admin client because the user
 * accepting may not have direct write access to site_members yet, but we've
 * verified the token + email match the authenticated user.
 */
export const acceptSiteInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const userEmail = (claims?.email as string | undefined)?.toLowerCase();
    if (!userEmail) throw new Error("Tu cuenta no tiene email");

    const { data: inv, error } = await supabaseAdmin
      .from("site_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();

    if (error || !inv) throw new Error("Invitación no encontrada");
    if (inv.accepted_at) throw new Error("Esta invitación ya fue usada");
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("La invitación expiró");
    if ((inv.email as string).toLowerCase() !== userEmail) {
      throw new Error("Esta invitación es para otro email");
    }

    const { error: insErr } = await supabaseAdmin.from("site_members").upsert(
      {
        site_id: inv.site_id,
        user_id: userId,
        role: inv.role,
        invited_email: inv.email,
      },
      { onConflict: "site_id,user_id" }
    );
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin
      .from("site_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    return { site_id: inv.site_id as string, role: inv.role as string };
  });

/**
 * Get site name for an invitation token (public-ish lookup gated by token).
 */
export const getInvitationInfo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input)
  )
  .handler(async ({ data }) => {
    const { data: inv } = await supabaseAdmin
      .from("site_invitations")
      .select("site_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { found: false as const };
    const { data: site } = await supabaseAdmin
      .from("sites")
      .select("name")
      .eq("id", inv.site_id)
      .maybeSingle();
    return {
      found: true as const,
      site_name: site?.name ?? "sitio",
      email: inv.email as string,
      role: inv.role as string,
      expired: new Date(inv.expires_at as string).getTime() < Date.now(),
      accepted: !!inv.accepted_at,
    };
  });
