import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const numericFields = [
  "grid_voltage", "grid_frequency", "ac_output_voltage", "ac_output_frequency",
  "ac_output_apparent_power", "ac_output_active_power", "load_percent", "bus_voltage",
  "battery_voltage", "battery_charging_current", "battery_capacity", "battery_discharge_current",
  "inverter_temperature", "pv_input_current", "pv_input_voltage", "pv_input_power",
] as const;

const textFields = ["device_status", "inverter_mode"] as const;

function coerceNumeric(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/,/g, ".");
  if (!normalized) return null;

  const matches = normalized.match(/-?\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;

  const parsed = Number(matches[matches.length - 1]);
  return Number.isFinite(parsed) ? parsed : null;
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
              const coerced = coerceNumeric(s[key]);
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
