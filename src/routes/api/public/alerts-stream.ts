import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * GET /api/public/alerts-stream?token=<device_token>[&since=<iso>]
 *
 * Server-Sent Events stream that pushes new notification_events to native
 * clients (Android APK) so the user gets real lockscreen / heads-up
 * notifications. Web Push (VAPID) does NOT work inside a WebView, so the
 * APK consumes this stream instead.
 *
 * Auth: the caller proves ownership of a site by passing its device_token.
 * We resolve the site's owner_id and stream every notification_event for
 * that user. Multiple sites of the same user share the same alert pool.
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

const POLL_MS = 3000;
const HEARTBEAT_MS = 20000;
const MAX_LIFETIME_MS = 4 * 60 * 1000;

export const Route = createFileRoute("/api/public/alerts-stream")({
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
          .select("id, owner_id, name")
          .eq("device_token", token)
          .maybeSingle();
        if (!site?.owner_id) {
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const userId = site.owner_id as string;

        // Watermark: only push events newer than this. Defaults to "now"
        // so we never replay the entire backlog on first connect.
        const sinceParam = url.searchParams.get("since");
        let lastAt = sinceParam && !isNaN(Date.parse(sinceParam))
          ? new Date(sinceParam).toISOString()
          : new Date().toISOString();

        const encoder = new TextEncoder();
        let closed = false;

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: string, payload: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
                );
              } catch {
                closed = true;
              }
            };

            send("hello", { ok: true, since: lastAt });

            const onAbort = () => {
              closed = true;
              try { controller.close(); } catch { /* noop */ }
            };
            request.signal.addEventListener("abort", onAbort);

            const startedAt = Date.now();
            let lastBeat = Date.now();

            while (!closed && Date.now() - startedAt < MAX_LIFETIME_MS) {
              await new Promise((r) => setTimeout(r, POLL_MS));
              if (closed) break;
              try {
                const { data: rows } = await supabaseAdmin
                  .from("notification_events")
                  .select("id,title,body,severity,site_id,metric,value,value_text,created_at")
                  .eq("user_id", userId)
                  .gt("created_at", lastAt)
                  .order("created_at", { ascending: true })
                  .limit(20);
                if (rows && rows.length) {
                  for (const r of rows) {
                    send("alert", r);
                    lastAt = (r as { created_at: string }).created_at;
                  }
                }
              } catch (e) {
                send("error", { message: (e as Error).message });
              }
              if (Date.now() - lastBeat > HEARTBEAT_MS) {
                send("ping", { t: Date.now() });
                lastBeat = Date.now();
              }
            }

            try { controller.close(); } catch { /* noop */ }
          },
          cancel() { closed = true; },
        });

        return new Response(stream, { status: 200, headers: SSE_HEADERS });
      },
    },
  },
});
