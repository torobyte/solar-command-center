import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const numericFields = [
  "grid_voltage", "grid_frequency", "ac_output_voltage", "ac_output_frequency",
  "ac_output_apparent_power", "ac_output_active_power", "load_percent", "bus_voltage",
  "battery_voltage", "battery_charging_current", "battery_capacity", "battery_discharge_current",
  "inverter_temperature", "pv_input_current", "pv_input_voltage", "pv_input_power",
] as const;

const textFields = ["device_status", "inverter_mode"] as const;

/**
 * Cotas físicamente plausibles para descartar lecturas corruptas
 * (QPIGS desalineado, tokens basura, ruido en el bus serial, etc.).
 * Se aplican siempre; encima se aplican límites por sitio derivados de
 * inverter_specs / pv_system_config (ver buildSiteBounds).
 *
 * Valores fuera de rango → null (no se persisten) para no envenenar el
 * histórico ni los cálculos de ahorro económico.
 */
const BASE_BOUNDS: Record<string, [number, number]> = {
  grid_voltage: [0, 300],
  grid_frequency: [0, 70],
  ac_output_voltage: [0, 300],
  ac_output_frequency: [0, 70],
  ac_output_apparent_power: [0, 30000],
  ac_output_active_power: [0, 30000],
  load_percent: [0, 100],
  bus_voltage: [0, 600],
  battery_voltage: [0, 80],
  battery_charging_current: [0, 300],
  battery_capacity: [0, 100],
  battery_discharge_current: [0, 300],
  inverter_temperature: [-20, 150],
  pv_input_current: [0, 200],
  pv_input_voltage: [0, 800],
  pv_input_power: [0, 30000],
};

type Bounds = Record<string, [number, number]>;

/**
 * Aprieta las cotas por sitio:
 *   - PV ≤ array_kwp × 1100 W (≈ 10 % de holgura sobre Wp)
 *   - AC (W y VA) ≤ max_ac_output_power × 1.15
 *   - Vbat dentro de ±35 % del nominal
 * Si el spec parece basura (max ridículamente bajo) lo ignoramos y
 * dejamos la cota base.
 */
function buildSiteBounds(
  spec: { max_ac_output_power: number | null; nominal_battery_voltage: number | null } | null,
  pv: { array_kwp: number | null } | null,
): Bounds {
  const bounds: Bounds = { ...BASE_BOUNDS };
  const maxAc = Number(spec?.max_ac_output_power);
  if (Number.isFinite(maxAc) && maxAc >= 500) {
    const cap = Math.round(maxAc * 1.15);
    bounds.ac_output_active_power = [0, cap];
    bounds.ac_output_apparent_power = [0, cap];
  }
  const kwp = Number(pv?.array_kwp);
  if (Number.isFinite(kwp) && kwp > 0.1) {
    bounds.pv_input_power = [0, Math.round(kwp * 1100)];
  }
  const nom = Number(spec?.nominal_battery_voltage);
  if (Number.isFinite(nom) && nom >= 12) {
    bounds.battery_voltage = [Math.round(nom * 0.6), Math.round(nom * 1.35)];
  }
  return bounds;
}

function coerceNumeric(value: unknown, field: string, bounds: Bounds): number | null {
  if (value == null) return null;
  let n: number | null = null;
  if (typeof value === "number") n = Number.isFinite(value) ? value : null;
  else if (typeof value === "string") {
    // Normaliza coma decimal → punto y extrae el ÚLTIMO número de la
    // cadena (defensa contra "230 5000 49.7" del QPIGS desalineado).
    const normalized = value.trim().replace(/,/g, ".");
    const matches = normalized ? normalized.match(/-?\d+(?:\.\d+)?/g) : null;
    if (matches?.length) {
      const parsed = Number(matches[matches.length - 1]);
      n = Number.isFinite(parsed) ? parsed : null;
    }
  }
  if (n == null) return null;
  const range = bounds[field];
  if (range) {
    const [min, max] = range;
    if (n < min || n > max) return null;
  }
  return n;
}

function coerceText(value: unknown): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  return text || null;
}

function coerceRecordedAt(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : new Date().toISOString();
}

/**
 * Si una muestra trae casi todos los campos en null tras la validación
 * (sólo recorded_at + 0-1 numérico), es ruido del agente: la descartamos
 * para no insertar filas inútiles que después distorsionan promedios.
 */
function isUsableRow(row: Record<string, unknown>): boolean {
  let numericCount = 0;
  for (const k of numericFields) if (typeof row[k] === "number") numericCount++;
  return numericCount >= 2;
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!token) return Response.json({ error: "missing device token" }, { status: 401 });

          const { data: site } = await supabaseAdmin
            .from("sites").select("id").eq("device_token", token).maybeSingle();
          if (!site) return Response.json({ error: "invalid token" }, { status: 401 });

          // Cotas por sitio (1 lectura por request)
          const [{ data: spec }, { data: pv }] = await Promise.all([
            supabaseAdmin.from("inverter_specs")
              .select("max_ac_output_power, nominal_battery_voltage")
              .eq("site_id", site.id).maybeSingle(),
            supabaseAdmin.from("pv_system_config")
              .select("array_kwp")
              .eq("site_id", site.id).maybeSingle(),
          ]);
          const bounds = buildSiteBounds(spec, pv);

          const body = (await request.json()) as {
            samples?: Array<Record<string, unknown>>;
            sample?: Record<string, unknown>;
          };
          const samples = (body.samples ?? (body.sample ? [body.sample] : []))
            .filter((sample): sample is Record<string, unknown> => !!sample && typeof sample === "object" && !Array.isArray(sample));
          if (!samples.length) return Response.json({ error: "no samples" }, { status: 400 });

          const rows: Record<string, unknown>[] = [];
          let dropped = 0;
          for (const s of samples) {
            const row: Record<string, unknown> = {
              site_id: site.id,
              recorded_at: coerceRecordedAt(s.recorded_at),
            };
            let mutated = !(typeof s.recorded_at === "string" && !Number.isNaN(Date.parse(s.recorded_at)));

            for (const key of numericFields) {
              if (!(key in s)) continue;
              const coerced = coerceNumeric(s[key], key, bounds);
              if (coerced !== null) row[key] = coerced;
              mutated = mutated || coerced === null || s[key] !== coerced;
            }
            for (const key of textFields) {
              if (!(key in s)) continue;
              row[key] = coerceText(s[key]);
            }

            if (!isUsableRow(row)) { dropped++; continue; }

            if ("raw" in s && s.raw != null) row.raw = s.raw;
            else if (mutated) row.raw = s;

            rows.push(row);
          }

          if (!rows.length) {
            return Response.json({ ok: true, count: 0, dropped }, { status: 200 });
          }

          const { error } = await supabaseAdmin.from("telemetry_samples").insert(rows as never);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          await supabaseAdmin.from("sites").update({
            status: "online", last_seen_at: new Date().toISOString(),
          }).eq("id", site.id);

          return Response.json({ ok: true, count: rows.length, dropped });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
