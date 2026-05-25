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
 * Rangos físicamente plausibles para descartar lecturas corruptas
 * (QPIGS con tokens basura, ruido en el bus serial, etc.). Valores
 * fuera de rango → null (no se persisten) para no envenenar el
 * histórico ni los cálculos de ahorro económico.
 */
const NUMERIC_BOUNDS: Record<string, [number, number]> = {
  grid_voltage: [0, 500],
  grid_frequency: [0, 100],
  ac_output_voltage: [0, 500],
  ac_output_frequency: [0, 100],
  ac_output_apparent_power: [0, 50000],
  ac_output_active_power: [0, 50000],
  load_percent: [0, 100],
  bus_voltage: [0, 800],
  battery_voltage: [0, 100],
  battery_charging_current: [0, 500],
  battery_capacity: [0, 100],
  battery_discharge_current: [0, 500],
  inverter_temperature: [-20, 200],
  pv_input_current: [0, 500],
  pv_input_voltage: [0, 800],
  pv_input_power: [0, 50000],
};

function coerceNumeric(value: unknown, field?: string): number | null {
  if (value == null) return null;
  let n: number | null = null;
  if (typeof value === "number") n = Number.isFinite(value) ? value : null;
  else if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, ".");
    const matches = normalized ? normalized.match(/-?\d+(?:\.\d+)?/g) : null;
    if (matches?.length) {
      const parsed = Number(matches[matches.length - 1]);
      n = Number.isFinite(parsed) ? parsed : null;
    }
  }
  if (n == null) return null;
  if (field && NUMERIC_BOUNDS[field]) {
    const [min, max] = NUMERIC_BOUNDS[field];
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

          const body = (await request.json()) as {
            samples?: Array<Record<string, unknown>>;
            sample?: Record<string, unknown>;
          };
          const samples = (body.samples ?? (body.sample ? [body.sample] : []))
            .filter((sample): sample is Record<string, unknown> => !!sample && typeof sample === "object" && !Array.isArray(sample));
          if (!samples.length) return Response.json({ error: "no samples" }, { status: 400 });

          const rows = samples.map((s) => {
            const row: Record<string, unknown> = {
              site_id: site.id,
              recorded_at: coerceRecordedAt(s.recorded_at),
            };
            let mutated = !(typeof s.recorded_at === "string" && !Number.isNaN(Date.parse(s.recorded_at)));

            for (const key of numericFields) {
              if (!(key in s)) continue;
              const coerced = coerceNumeric(s[key], key);
              if (coerced !== null) row[key] = coerced;
              mutated = mutated || coerced === null || s[key] !== coerced;
            }


            for (const key of textFields) {
              if (!(key in s)) continue;
              row[key] = coerceText(s[key]);
            }

            if ("raw" in s && s.raw != null) {
              row.raw = s.raw;
            } else if (mutated) {
              row.raw = s;
            }

            return row;
          });

          const { error } = await supabaseAdmin.from("telemetry_samples").insert(rows as never);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          await supabaseAdmin.from("sites").update({
            status: "online", last_seen_at: new Date().toISOString(),
          }).eq("id", site.id);

          return Response.json({ ok: true, count: rows.length });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
