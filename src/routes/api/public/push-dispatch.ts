import { createFileRoute } from "@tanstack/react-router";
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMail } from "@/lib/smtp.server";

const VAPID_PUBLIC_KEY = "BDnuTziPAmV-KNaH_OsP0FIME_bGxE_hciFsAp5G65k_lJfamE-agiLpfjNU6UoonPqEeFNETKGtIehgUViQOlE";

const APP_URL = "https://appsolar.torobyte.com";

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
          .select("id,user_id,site_id,title,body,severity,metric,rule_id")
          .eq("id", eventId)
          .maybeSingle();
        if (!ev) return new Response("not found", { status: 404 });

        // Send email if rule has 'email' channel
        try {
          if ((ev as { rule_id?: string }).rule_id) {
            const { data: rule } = await supabaseAdmin
              .from("notification_rules")
              .select("channels")
              .eq("id", (ev as { rule_id: string }).rule_id)
              .maybeSingle();
            const channels = (rule?.channels as string[] | null) || [];
            if (Array.isArray(channels) && channels.includes("email")) {
              const { data: prof } = await supabaseAdmin
                .from("profiles").select("email,full_name").eq("id", ev.user_id).maybeSingle();
              const { data: site } = await supabaseAdmin
                .from("sites").select("name").eq("id", ev.site_id).maybeSingle();
              if (prof?.email) {
                await sendMail({
                  to: prof.email,
                  templateId: "alert",
                  vars: {
                    name: prof.full_name || "",
                    site_name: site?.name || "tu sitio",
                    title: ev.title,
                    message: ev.body || "",
                    severity: (ev.severity || "info").toUpperCase(),
                    link: `${APP_URL}/sites/${ev.site_id}`,
                  },
                });
              }
            }
          }
        } catch (err) {
          console.warn("alert email failed", err);
        }

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
            const res = await fetch(subscription.endpoint, init as unknown as RequestInit);
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
