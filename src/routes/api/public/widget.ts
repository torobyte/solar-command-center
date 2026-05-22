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

          const [{ data: rows }, { data: pvCfg }] = await Promise.all([
            supabaseAdmin
              .from("telemetry_samples")
              .select(
                "recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, battery_charging_current, battery_discharge_current, grid_voltage, inverter_mode",
              )
              .eq("site_id", site.id)
              .order("recorded_at", { ascending: false })
              .limit(1),
            supabaseAdmin
              .from("pv_system_config")
              .select("battery_kwh, battery_usable_dod_pct")
              .eq("site_id", site.id)
              .maybeSingle(),
          ]);
          const s = rows?.[0] ?? null;

          const ageSec = s ? Math.max(0, Math.round((Date.now() - new Date(s.recorded_at).getTime()) / 1000)) : null;

          // Usable Wh that the widget can actually deplete/refill (matches web)
          const batteryKwh = Number(pvCfg?.battery_kwh ?? 0);
          const dodPct = Number(pvCfg?.battery_usable_dod_pct ?? 90);
          const usableWh = batteryKwh > 0 ? Math.round(batteryKwh * 1000 * (dodPct / 100)) : 0;

          let derived: { battery_w: number; grid_w: number; charging: boolean; discharging: boolean; eta_minutes: number } | null = null;
          if (s) {
            const pv = Number(s.pv_input_power ?? 0);
            const load = Number(s.ac_output_active_power ?? 0);
            const bV = Number(s.battery_voltage ?? 0);
            const chgA = Number(s.battery_charging_current ?? 0);
            const disA = Number(s.battery_discharge_current ?? 0);
            const chargeW = Math.max(0, chgA * bV);
            const dischargeW = Math.max(0, disA * bV);
            const batteryW = dischargeW - chargeW; // + descarga, - carga
            const gridConnected = Number(s.grid_voltage ?? 0) > 50;
            // Red = (consumo casa + carga batería) - (PV + descarga batería)
            const gridW = gridConnected ? Math.max(0, load + chargeW - pv - dischargeW) : 0;
            const batPct = Number(s.battery_capacity ?? 0);

            // Tiempo restante de respaldo (minutos).
            // - Descargando: cuánto dura la energía útil disponible.
            // - Cargando: cuánto falta para llenar la energía útil.
            let eta = 0;
            if (usableWh > 0) {
              if (dischargeW > 25) {
                eta = Math.round((usableWh * (batPct / 100)) / dischargeW * 60);
              } else if (chargeW > 25) {
                eta = Math.round((usableWh * ((100 - batPct) / 100)) / chargeW * 60);
              }
            }

            derived = {
              battery_w: Math.round(batteryW),
              grid_w: Math.round(gridW),
              charging: chargeW > 25,
              discharging: dischargeW > 25,
              eta_minutes: eta,
            };
          }

          return json({
            site: {
              id: site.id,
              name: site.name,
              status: site.status,
              last_seen_at: site.last_seen_at,
              fresh: ageSec != null && ageSec < 30,
              age_seconds: ageSec,
            },
            online: ageSec != null && ageSec < 120,
            sample: s
              ? {
                  recorded_at: s.recorded_at,
                  pv_w: numOrNull(s.pv_input_power),
                  load_w: numOrNull(s.ac_output_active_power),
                  battery_pct: numOrNull(s.battery_capacity),
                  battery_v: numOrNull(s.battery_voltage),
                  battery_w: derived?.battery_w ?? 0,
                  battery_capacity_wh: usableWh, // <-- usado por el widget para ETA
                  grid_v: numOrNull(s.grid_voltage),
                  grid_w: derived?.grid_w ?? 0,
                  charging: derived?.charging ?? false,
                  discharging: derived?.discharging ?? false,
                  eta_minutes: derived?.eta_minutes ?? 0,
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
