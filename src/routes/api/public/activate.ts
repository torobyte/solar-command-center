import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            code?: string;
            site_id?: string;
            hardware_id?: string;
            inverter_model?: string;
            inverter_serial?: string;
          };
          if (!body.code || !body.site_id) {
            return Response.json({ error: "code and site_id are required" }, { status: 400 });
          }

          const { data: lic, error: licErr } = await supabaseAdmin
            .from("license_codes").select("*").eq("code", body.code).maybeSingle();
          if (licErr || !lic) return Response.json({ error: "invalid code" }, { status: 404 });
          if (lic.redeemed_at) return Response.json({ error: "already redeemed" }, { status: 409 });

          const { data: site, error: siteErr } = await supabaseAdmin
            .from("sites").select("*").eq("id", body.site_id).maybeSingle();
          if (siteErr || !site) return Response.json({ error: "site not found" }, { status: 404 });

          const expires = new Date(Date.now() + lic.duration_days * 86400_000).toISOString();
          await supabaseAdmin.from("sites").update({
            plan: lic.plan, license_expires_at: expires, status: "online",
            hardware_id: body.hardware_id ?? site.hardware_id,
            inverter_model: body.inverter_model ?? site.inverter_model,
            inverter_serial: body.inverter_serial ?? site.inverter_serial,
          }).eq("id", site.id);

          await supabaseAdmin.from("license_codes").update({
            redeemed_at: new Date().toISOString(), redeemed_by_site: site.id,
          }).eq("id", lic.id);

          return Response.json({ ok: true, plan: lic.plan, expires_at: expires, device_token: site.device_token });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
