import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * GET /api/public/widget
 *
 * Lightweight, CORS-enabled endpoint consumed by the Android home-screen
 * widget (and any other lightweight client). Returns the most recent
 * telemetry sample plus a few derived fields so the widget can render
 * without any further processing.
 *
 * Auth: device_token, accepted as either:
 *   - Authorization: Bearer <token>
 *   - ?token=<token> query string (easier from native HTTP clients)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/widget")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token =
            (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() ||
            url.searchParams.get("token") ||
            "";
          if (!token) return json({ error: "missing token" }, 401);

          const { data: site } = await supabaseAdmin
            .from("sites")
            .select("id, name, status, last_seen_at, license_expires_at")
            .eq("device_token", token)
            .maybeSingle();
          if (!site) return json({ error: "invalid token" }, 401);

          const { data: rows } = await supabaseAdmin
            .from("telemetry_samples")
            .select(
              "recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, grid_voltage, inverter_mode",
            )
            .eq("site_id", site.id)
            .order("recorded_at", { ascending: false })
            .limit(1);
          const s = rows?.[0] ?? null;

          const ageSec = s ? Math.max(0, Math.round((Date.now() - new Date(s.recorded_at).getTime()) / 1000)) : null;

          return json({
            site: {
              id: site.id,
              name: site.name,
              status: site.status,
              last_seen_at: site.last_seen_at,
              fresh: ageSec != null && ageSec < 30,
              age_seconds: ageSec,
            },
            sample: s
              ? {
                  recorded_at: s.recorded_at,
                  pv_w: numOrNull(s.pv_input_power),
                  load_w: numOrNull(s.ac_output_active_power),
                  battery_pct: numOrNull(s.battery_capacity),
                  battery_v: numOrNull(s.battery_voltage),
                  grid_v: numOrNull(s.grid_voltage),
                  inverter_mode: s.inverter_mode ?? null,
                }
              : null,
          });
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
