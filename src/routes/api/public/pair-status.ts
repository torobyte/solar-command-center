// Local agent polls this every few seconds. Once the user claims the code,
// we return the site_id + device_token so the agent can start pushing
// telemetry as that user.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/pair-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const code = (url.searchParams.get("code") || "").toUpperCase();
          if (!/^[A-Z0-9]{6}$/.test(code)) {
            return Response.json({ error: "invalid code" }, { status: 400 });
          }
          const { data: pc } = await supabaseAdmin
            .from("pairing_codes")
            .select("*")
            .eq("code", code)
            .maybeSingle();
          if (!pc) return Response.json({ status: "unknown" });
          if (!pc.claimed_by_site) {
            const expired = new Date(pc.expires_at).getTime() < Date.now();
            return Response.json({ status: expired ? "expired" : "pending" });
          }
          const { data: site } = await supabaseAdmin
            .from("sites")
            .select("id,name,device_token,plan,license_expires_at")
            .eq("id", pc.claimed_by_site)
            .maybeSingle();
          if (!site) return Response.json({ status: "unknown" });
          return Response.json({
            status: "claimed",
            site_id: site.id,
            site_name: site.name,
            device_token: site.device_token,
            plan: site.plan,
            license_expires_at: site.license_expires_at,
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
