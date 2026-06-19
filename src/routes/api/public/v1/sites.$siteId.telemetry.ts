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
  "bus_voltage",
  "grid_voltage",
  "grid_frequency",
  "load_percent",
  "inverter_temperature",
  "inverter_mode",
  "device_status",
] as const;

// Capacidad nominal del banco (Wh) si está configurada en pv_system_config.
// Permite estimar energía restante y tiempo de respaldo cuando se conoce.
async function getBatteryCapacityWh(siteId: string): Promise<number | null> {
  try {
    const { data } = await supabaseAdmin
      .from("pv_system_config")
      .select("battery_kwh,battery_count,battery_voltage_each,battery_ah_each,battery_usable_dod_pct")
      .eq("site_id", siteId)
      .maybeSingle();
    const d = data as any;
    const kwh = Number(d?.battery_kwh);
    if (Number.isFinite(kwh) && kwh > 0) return kwh * 1000;
    // Fallback: count * V * Ah
    const n = Number(d?.battery_count);
    const v = Number(d?.battery_voltage_each);
    const ah = Number(d?.battery_ah_each);
    if ([n, v, ah].every((x) => Number.isFinite(x) && x > 0)) {
      const dod = Number(d?.battery_usable_dod_pct);
      const dodFactor = Number.isFinite(dod) && dod > 0 ? dod / 100 : 1;
      return n * v * ah * dodFactor;
    }
    return null;
  } catch { return null; }
}

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

        // Derivar corriente AC de entrada (no la entrega QPIGS directamente):
        // si hay red activa (Vgrid > 50 V) y el inversor está en modo línea,
        // asumimos que la carga se alimenta desde red → I≈P/V.
        let enriched: Record<string, unknown> | null = null;
        if (sample) {
          const s = sample as any;
          const vgrid = Number(s.grid_voltage);
          const pload = Number(s.ac_output_active_power);
          const sload = Number(s.ac_output_apparent_power);
          const mode = String(s.inverter_mode ?? "").toUpperCase();
          const onGrid = Number.isFinite(vgrid) && vgrid > 50 &&
            (mode === "" || mode === "L" || mode === "LINE" || mode === "B" || mode === "BYPASS");
          const ac_input_current = onGrid && Number.isFinite(pload) && pload >= 0
            ? Number((pload / vgrid).toFixed(2)) : null;
          const ac_input_apparent_current = onGrid && Number.isFinite(sload) && sload >= 0
            ? Number((sload / vgrid).toFixed(2)) : null;
          const ac_input_active_power = onGrid && Number.isFinite(pload) ? pload : null;
          // ─── Derivados de batería ───
          const vbat = Number(s.battery_voltage);
          const ichg = Number(s.battery_charging_current);
          const idis = Number(s.battery_discharge_current);
          const soc = Number(s.battery_capacity);
          const chargingW = Number.isFinite(vbat) && Number.isFinite(ichg) ? vbat * Math.max(ichg, 0) : null;
          const dischargingW = Number.isFinite(vbat) && Number.isFinite(idis) ? vbat * Math.max(idis, 0) : null;
          // Convención: positivo = cargando, negativo = descargando
          const battery_net_current = Number.isFinite(ichg) || Number.isFinite(idis)
            ? Number(((Number.isFinite(ichg) ? ichg : 0) - (Number.isFinite(idis) ? idis : 0)).toFixed(2))
            : null;
          const battery_power = chargingW !== null && dischargingW !== null
            ? Number((chargingW - dischargingW).toFixed(1)) : null;
          let battery_status: "charging" | "discharging" | "idle" | null = null;
          if (battery_power !== null) {
            if (battery_power > 5) battery_status = "charging";
            else if (battery_power < -5) battery_status = "discharging";
            else battery_status = "idle";
          }
          const capWh = await getBatteryCapacityWh(params.siteId);
          const battery_energy_remaining_wh = capWh !== null && Number.isFinite(soc)
            ? Number(((capWh * soc) / 100).toFixed(0)) : null;
          // Tiempo estimado de respaldo (horas) si está descargando con carga > 0
          let battery_time_remaining_min: number | null = null;
          if (battery_status === "discharging" && battery_energy_remaining_wh !== null && Number.isFinite(pload) && pload > 10) {
            battery_time_remaining_min = Number(((battery_energy_remaining_wh / pload) * 60).toFixed(0));
          }
          let battery_time_to_full_min: number | null = null;
          if (battery_status === "charging" && capWh !== null && Number.isFinite(soc) && battery_power !== null && battery_power > 10) {
            const remainingWh = capWh * (100 - soc) / 100;
            battery_time_to_full_min = Number(((remainingWh / battery_power) * 60).toFixed(0));
          }

          enriched = {
            ...s,
            ac_input_voltage: Number.isFinite(vgrid) ? vgrid : null,
            ac_input_frequency: Number.isFinite(Number(s.grid_frequency)) ? Number(s.grid_frequency) : null,
            ac_input_current,
            ac_input_apparent_current,
            ac_input_active_power,
            ac_input_source: onGrid ? "grid" : "off",
            // Batería (derivados)
            battery_soc: Number.isFinite(soc) ? soc : null,
            battery_charging_power: chargingW !== null ? Number(chargingW.toFixed(1)) : null,
            battery_discharging_power: dischargingW !== null ? Number(dischargingW.toFixed(1)) : null,
            battery_power,
            battery_net_current,
            battery_status,
            battery_capacity_wh: capWh,
            battery_energy_remaining_wh,
            battery_time_remaining_min,
            battery_time_to_full_min,
          };
        }

        return new Response(JSON.stringify({
          site,
          telemetry: enriched,
          ts: new Date().toISOString(),
        }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
        });

      },
    },
  },
});
