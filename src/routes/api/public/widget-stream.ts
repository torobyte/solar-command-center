import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * GET /api/public/widget-stream?token=<device_token>
 *
 * Server-Sent Events stream consumed by the Android widget service and any
 * web embed (EventSource). Pushes a fresh snapshot whenever a newer
 * telemetry_samples row appears for the site bound to the token.
 *
 * Strategy: short server-side poll loop (every ~2s) on supabaseAdmin,
 * comparing `recorded_at`. Pushes deltas as `event: sample` and a periodic
 * `event: ping` heartbeat. Connection auto-closes after MAX_LIFETIME_MS so
 * clients can transparently reconnect (and so the Worker doesn't hold a
 * stale stream forever).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  ...CORS,
} as const;

const POLL_MS = 2000;
const HEARTBEAT_MS = 20000;
const MAX_LIFETIME_MS = 4 * 60 * 1000; // 4 min; clients reconnect

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function loadSnapshot(siteId: string) {
  const [{ data: site }, { data: rows }] = await Promise.all([
    supabaseAdmin
      .from("sites")
      .select("id, name, status, last_seen_at")
      .eq("id", siteId)
      .maybeSingle(),
    supabaseAdmin
      .from("telemetry_samples")
      .select(
        "recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, grid_voltage, inverter_mode",
      )
      .eq("site_id", siteId)
      .order("recorded_at", { ascending: false })
      .limit(1),
  ]);
  const s = rows?.[0] ?? null;
  const ageSec = s
    ? Math.max(0, Math.round((Date.now() - new Date(s.recorded_at).getTime()) / 1000))
    : null;
  return {
    site: site
      ? {
          id: site.id,
          name: site.name,
          status: site.status,
          last_seen_at: site.last_seen_at,
          fresh: ageSec != null && ageSec < 30,
          age_seconds: ageSec,
        }
      : null,
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
    recorded_at: s?.recorded_at ?? null,
  };
}

export const Route = createFileRoute("/api/public/widget-stream")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() ||
          url.searchParams.get("token") ||
          "";
        if (!token) {
          return new Response(JSON.stringify({ error: "missing token" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const { data: site } = await supabaseAdmin
          .from("sites")
          .select("id")
          .eq("device_token", token)
          .maybeSingle();
        if (!site) {
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const siteId = site.id as string;

        const encoder = new TextEncoder();
        let lastRecordedAt: string | null = null;
        let closed = false;

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: string, payload: unknown) => {
              if (closed) return;
              const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
              try {
                controller.enqueue(encoder.encode(chunk));
              } catch {
                closed = true;
              }
            };

            // Initial snapshot
            try {
              const snap = await loadSnapshot(siteId);
              lastRecordedAt = snap.recorded_at;
              send("sample", snap);
            } catch (e) {
              send("error", { message: (e as Error).message });
            }

            const startedAt = Date.now();
            let lastBeat = Date.now();

            // Abort if the client disconnects
            const onAbort = () => {
              closed = true;
              try { controller.close(); } catch { /* noop */ }
            };
            request.signal.addEventListener("abort", onAbort);

            while (!closed && Date.now() - startedAt < MAX_LIFETIME_MS) {
              await new Promise((r) => setTimeout(r, POLL_MS));
              if (closed) break;
              try {
                const { data: latest } = await supabaseAdmin
                  .from("telemetry_samples")
                  .select("recorded_at")
                  .eq("site_id", siteId)
                  .order("recorded_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                const ts = (latest?.recorded_at as string | undefined) ?? null;
                if (ts && ts !== lastRecordedAt) {
                  const snap = await loadSnapshot(siteId);
                  lastRecordedAt = snap.recorded_at;
                  send("sample", snap);
                  lastBeat = Date.now();
                } else if (Date.now() - lastBeat > HEARTBEAT_MS) {
                  send("ping", { t: Date.now() });
                  lastBeat = Date.now();
                }
              } catch (e) {
                send("error", { message: (e as Error).message });
              }
            }
            // Tell client to reconnect cleanly
            send("bye", { reason: "lifetime" });
            try { controller.close(); } catch { /* noop */ }
          },
          cancel() {
            closed = true;
          },
        });

        return new Response(stream, { status: 200, headers: SSE_HEADERS });
      },
    },
  },
});
