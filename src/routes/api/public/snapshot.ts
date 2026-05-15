import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface SpecPayload {
  driver?: string; model_name?: string; serial_number?: string;
  firmware?: string; topology?: string; machine_type?: string;
  nominal_battery_voltage?: number; expected_ac_input_voltage?: number;
  max_ac_input_current?: number; max_ac_output_current?: number;
  max_ac_output_power?: number; max_ac_output_apparent_power?: number;
  max_ac_charge_current?: number; max_charge_current?: number;
  output_source_priority?: string; charger_source_priority?: string;
  battery_type?: string; input_voltage_range?: string;
  raw?: unknown;
}

interface DevicePayload {
  ssid?: string; ip_eth?: string; ip_wlan?: string; ip_public?: string;
  internet_up?: boolean; cpu_temp_c?: number;
  storage_used_pct?: number; storage_total_gb?: number;
  usb_devices?: number; board_model?: string; agent_version?: string;
  voltage_dips?: number; raw?: unknown;
}

export const Route = createFileRoute("/api/public/snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = (request.headers.get("authorization") ?? "")
            .replace(/^Bearer\s+/i, "").trim();
          if (!token) return Response.json({ error: "missing token" }, { status: 401 });

          const { data: site } = await supabaseAdmin
            .from("sites").select("id").eq("device_token", token).maybeSingle();
          if (!site) return Response.json({ error: "invalid token" }, { status: 401 });

          const body = (await request.json()) as { spec?: SpecPayload; device?: DevicePayload };
          const now = new Date().toISOString();

          if (body.spec && Object.keys(body.spec).length > 0) {
            await supabaseAdmin
              .from("inverter_specs")
              .upsert({ site_id: site.id, ...body.spec, updated_at: now } as never,
                      { onConflict: "site_id" });
          }
          if (body.device && Object.keys(body.device).length > 0) {
            await supabaseAdmin
              .from("device_snapshots")
              .upsert({ site_id: site.id, ...body.device, updated_at: now } as never,
                      { onConflict: "site_id" });
          }
          // Mark the site as online so the cloud UI can show end-to-end
          // sync health (last seen / clock / errors) even when telemetry
          // ingestion is paused (e.g. inverter unplugged but agent alive).
          await supabaseAdmin
            .from("sites")
            .update({ status: "online", last_seen_at: now } as never)
            .eq("id", site.id);
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
