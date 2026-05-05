import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
          const samples = body.samples ?? (body.sample ? [body.sample] : []);
          if (!samples.length) return Response.json({ error: "no samples" }, { status: 400 });

          const allowed = [
            "grid_voltage","grid_frequency","ac_output_voltage","ac_output_frequency",
            "ac_output_apparent_power","ac_output_active_power","load_percent","bus_voltage",
            "battery_voltage","battery_charging_current","battery_capacity","battery_discharge_current",
            "inverter_temperature","pv_input_current","pv_input_voltage","pv_input_power",
            "device_status","inverter_mode","raw","recorded_at",
          ];
          const rows = samples.map((s) => {
            const row: Record<string, unknown> = { site_id: site.id };
            for (const k of allowed) if (k in s) row[k] = s[k];
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
