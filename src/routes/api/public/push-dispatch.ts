import { createFileRoute } from "@tanstack/react-router";
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VAPID_PUBLIC_KEY = "BDnuTziPAmV-KNaH_OsP0FIME_bGxE_hciFsAp5G65k_lJfamE-agiLpfjNU6UoonPqEeFNETKGtIehgUViQOlE";

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { event_id?: string };
        try { body = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
        const eventId = body.event_id;
        if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return new Response("bad id", { status: 400 });

        const { data: ev } = await supabaseAdmin
          .from("notification_events")
          .select("id,user_id,site_id,title,body,severity,metric")
          .eq("id", eventId)
          .maybeSingle();
        if (!ev) return new Response("not found", { status: 404 });

        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth")
          .eq("user_id", ev.user_id);
        if (!subs?.length) return Response.json({ sent: 0 });

        const vapid: VapidKeys = {
          subject: process.env.VAPID_SUBJECT || "mailto:admin@solarops.app",
          publicKey: VAPID_PUBLIC_KEY,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        };

        const payloadData = JSON.stringify({
          title: ev.title,
          body: ev.body ?? "",
          severity: ev.severity,
          url: `/sites/${ev.site_id}`,
          tag: `event-${ev.id}`,
        });

        let sent = 0, removed = 0;
        await Promise.all(subs.map(async (s) => {
          const subscription: PushSubscription = {
            endpoint: s.endpoint,
            expirationTime: null,
            keys: { p256dh: s.p256dh, auth: s.auth },
          };
          try {
            const init = await buildPushPayload(
              { data: payloadData, options: { ttl: 3600, urgency: ev.severity === "critical" ? "high" : "normal" } },
              subscription, vapid,
            );
            const res = await fetch(subscription.endpoint, init);
            if (res.status === 404 || res.status === 410) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
              removed++;
            } else if (res.ok || res.status === 201 || res.status === 202) {
              sent++;
            }
          } catch (err) {
            console.warn("push send failed", err);
          }
        }));

        return Response.json({ sent, removed });
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
