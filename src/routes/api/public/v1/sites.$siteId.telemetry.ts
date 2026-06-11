import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey } from "./sites";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

const FIELDS = [
  "recorded_at",
  "pv_input_power",
  "pv_input_voltage",
  "pv_input_current",
  "ac_output_active_power",
  "ac_output_apparent_power",
  "ac_output_voltage",
  "ac_output_frequency",
  "battery_capacity",
  "battery_voltage",
  "battery_charging_current",
  "battery_discharge_current",
  "grid_voltage",
  "grid_frequency",
  "load_percent",
  "inverter_temperature",
  "inverter_mode",
  "device_status",
] as const;

async function userHasAccess(userId: string, siteId: string): Promise<boolean> {
  const { data: site } = await supabaseAdmin
    .from("sites").select("id,owner_id").eq("id", siteId).maybeSingle();
  if (!site) return false;
  if (site.owner_id === userId) return true;
  const { data: m } = await supabaseAdmin
    .from("site_members").select("user_id").eq("site_id", siteId).eq("user_id", userId).maybeSingle();
  return !!m;
}

export const Route = createFileRoute("/api/public/v1/sites/$siteId/telemetry")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if (!auth) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "content-type": "application/json", ...CORS },
          });
        }
        if (!(await userHasAccess(auth.userId, params.siteId))) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { "content-type": "application/json", ...CORS },
          });
        }

        const { data: site } = await supabaseAdmin
          .from("sites").select("id,name,status,last_seen_at").eq("id", params.siteId).maybeSingle();

        const { data: sample } = await supabaseAdmin
          .from("telemetry_samples")
          .select(FIELDS.join(","))
          .eq("site_id", params.siteId)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return new Response(JSON.stringify({
          site,
          telemetry: sample ?? null,
          ts: new Date().toISOString(),
        }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
        });
      },
    },
  },
});
