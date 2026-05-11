import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/license-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { device_token?: string };
          const token = body.device_token || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (!token) return Response.json({ error: "device_token required" }, { status: 400 });

          const { data: site, error } = await supabaseAdmin
            .from("sites")
            .select("id,name,plan,status,license_expires_at,force_refresh_at,inverter_model")
            .eq("device_token", token)
            .maybeSingle();
          if (error || !site) return Response.json({ error: "invalid device_token" }, { status: 404 });

          const now = Date.now();
          const exp = site.license_expires_at ? new Date(site.license_expires_at).getTime() : null;
          const days_remaining = exp ? Math.max(0, Math.ceil((exp - now) / 86_400_000)) : null;
          const license_active = !!exp && exp > now;

          // Mark site as seen
          await supabaseAdmin.from("sites").update({ last_seen_at: new Date().toISOString() }).eq("id", site.id);

          return Response.json({
            site_id: site.id,
            site_name: site.name,
            inverter_model: site.inverter_model,
            plan: site.plan,
            status: site.status,
            license_active,
            license_expires_at: site.license_expires_at,
            days_remaining,
            force_refresh_at: site.force_refresh_at,
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
