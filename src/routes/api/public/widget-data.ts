import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const METRIC_FIELDS = [
  "pv_input_power",
  "ac_output_active_power",
  "battery_capacity",
  "battery_voltage",
  "grid_voltage",
  "grid_frequency",
  "load_percent",
  "inverter_mode",
  "device_status",
] as const;

export const Route = createFileRoute("/api/public/widget-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token || token.length < 16 || token.length > 128) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }

        const url = new URL(request.url);
        const configId = url.searchParams.get("config");
        if (!configId) {
          return new Response(JSON.stringify({ error: "missing config" }), {
            status: 400,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }

        const { data: tokenRow } = await supabaseAdmin
          .from("widget_tokens")
          .select("id,user_id,revoked_at")
          .eq("token", token)
          .maybeSingle();

        if (!tokenRow || tokenRow.revoked_at) {
          return new Response(JSON.stringify({ error: "invalid_token" }), {
            status: 401,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }

        const { data: cfg } = await supabaseAdmin
          .from("widget_configs")
          .select("id,user_id,site_id,label,metrics,theme,refresh_minutes")
          .eq("id", configId)
          .maybeSingle();

        if (!cfg || cfg.user_id !== tokenRow.user_id) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }

        const { data: site } = await supabaseAdmin
          .from("sites")
          .select("id,name,status")
          .eq("id", cfg.site_id)
          .maybeSingle();

        const { data: sample } = await supabaseAdmin
          .from("telemetry_samples")
          .select(METRIC_FIELDS.join(","))
          .eq("site_id", cfg.site_id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // update last_used_at without blocking
        supabaseAdmin
          .from("widget_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", tokenRow.id)
          .then(() => {}, () => {});

        return new Response(
          JSON.stringify({
            label: cfg.label,
            theme: cfg.theme,
            refresh_minutes: cfg.refresh_minutes,
            metrics: cfg.metrics,
            site: site ? { name: site.name, status: site.status } : null,
            sample: sample ?? {},
            ts: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "access-control-allow-origin": "*",
            },
          },
        );
      },
    },
  },
});
