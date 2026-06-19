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
  "ac_output_active_power",
  "battery_capacity",
  "battery_voltage",
  "grid_voltage",
  "grid_frequency",
  "load_percent",
  "inverter_mode",
  "device_status",
] as const;

export const Route = createFileRoute("/api/public/v1/sites/$siteId/stream")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if (!auth) return new Response("Unauthorized", { status: 401, headers: CORS });

        const { data: site } = await supabaseAdmin
          .from("sites").select("id,owner_id").eq("id", params.siteId).maybeSingle();
        if (!site) return new Response("Not found", { status: 404, headers: CORS });
        if (site.owner_id !== auth.userId) {
          const { data: m } = await supabaseAdmin
            .from("site_members").select("user_id")
            .eq("site_id", params.siteId).eq("user_id", auth.userId).maybeSingle();
          if (!m) return new Response("Forbidden", { status: 403, headers: CORS });
        }

        const encoder = new TextEncoder();
        let lastTs: string | null = null;
        let closed = false;

        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              if (closed) return;
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };
            send("hello", { site_id: params.siteId, ts: new Date().toISOString() });

            const tick = async () => {
              if (closed) return;
              try {
                const { data: sample } = await supabaseAdmin
                  .from("telemetry_samples")
                  .select(FIELDS.join(","))
                  .eq("site_id", params.siteId)
                  .order("recorded_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (sample && (sample as any).recorded_at !== lastTs) {
                  lastTs = (sample as any).recorded_at;
                  const s = sample as any;
                  const vgrid = Number(s.grid_voltage);
                  const pload = Number(s.ac_output_active_power);
                  const mode = String(s.inverter_mode ?? "").toUpperCase();
                  const onGrid = Number.isFinite(vgrid) && vgrid > 50 &&
                    (mode === "" || mode === "L" || mode === "LINE" || mode === "B" || mode === "BYPASS");
                  const ac_input_current = onGrid && Number.isFinite(pload) && pload >= 0
                    ? Number((pload / vgrid).toFixed(2)) : null;
                  send("telemetry", {
                    ...s,
                    ac_input_voltage: Number.isFinite(vgrid) ? vgrid : null,
                    ac_input_frequency: Number.isFinite(Number(s.grid_frequency)) ? Number(s.grid_frequency) : null,
                    ac_input_current,
                    ac_input_active_power: onGrid && Number.isFinite(pload) ? pload : null,
                    ac_input_source: onGrid ? "grid" : "off",
                  });
                } else {
                  // heartbeat para mantener conexión abierta
                  controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
                }

              } catch {
                /* ignore */
              }
            };

            await tick();
            const interval = setInterval(tick, 5000);
            request.signal.addEventListener("abort", () => {
              closed = true;
              clearInterval(interval);
              try { controller.close(); } catch { /* */ }
            });
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store, no-transform",
            connection: "keep-alive",
            ...CORS,
          },
        });
      },
    },
  },
});
