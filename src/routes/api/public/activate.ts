import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            code?: string;
            site_id?: string;
            site_name?: string;
            hardware_id?: string;
            inverter_model?: string;
            inverter_serial?: string;
          };
          if (!body.code) {
            return Response.json({ error: "code is required" }, { status: 400 });
          }

          const { data: lic, error: licErr } = await supabaseAdmin
            .from("license_codes").select("*").eq("code", body.code).maybeSingle();
          if (licErr || !lic) return Response.json({ error: "invalid code" }, { status: 404 });
          if (lic.redeemed_at) return Response.json({ error: "already redeemed" }, { status: 409 });
          if ((lic as { revoked_at?: string | null }).revoked_at) {
            return Response.json({ error: "license revoked" }, { status: 410 });
          }

          // The license is bound to a user via assigned_email. The DB trigger
          // resolves it to assigned_user_id either at license creation (if the
          // user already had an account) or at signup (if they registered later).
          // If neither happened, the user hasn't created an account yet — refuse
          // activation and tell them to sign up with the assigned email first.
          const assignedUserId =
            (lic as { assigned_user_id?: string | null }).assigned_user_id
            ?? lic.owner_id
            ?? lic.created_by;
          const assignedEmail = (lic as { assigned_email?: string | null }).assigned_email ?? null;

          // Resolve / create the target site.
          let siteId = body.site_id ?? null;
          if (!siteId) {
            const ownerId = assignedUserId;
            if (!ownerId) {
              return Response.json(
                {
                  error: assignedEmail
                    ? `this license is reserved for ${assignedEmail} — please create an account with that email first`
                    : "this license is not assigned to a user; ask your administrator to re-issue it",
                },
                { status: 400 },
              );
            }
            const name = (body.site_name?.trim() || lic.site_name || "My site").slice(0, 120);
            const { data: created, error: createErr } = await supabaseAdmin
              .from("sites")
              .insert({
                owner_id: ownerId,
                name,
                hardware_id: body.hardware_id ?? null,
                inverter_model: body.inverter_model ?? null,
                inverter_serial: body.inverter_serial ?? null,
                status: "online",
              })
              .select()
              .single();
            if (createErr || !created) {
              return Response.json({ error: createErr?.message ?? "could not create site" }, { status: 500 });
            }
            siteId = created.id;
          }

          const { data: site, error: siteErr } = await supabaseAdmin
            .from("sites").select("*").eq("id", siteId).maybeSingle();
          if (siteErr || !site) return Response.json({ error: "site not found" }, { status: 404 });

          const expires = new Date(Date.now() + lic.duration_days * 86_400_000).toISOString();
          await supabaseAdmin.from("sites").update({
            plan: lic.plan, license_expires_at: expires, status: "online",
            hardware_id: body.hardware_id ?? site.hardware_id,
            inverter_model: body.inverter_model ?? site.inverter_model,
            inverter_serial: body.inverter_serial ?? site.inverter_serial,
          }).eq("id", site.id);

          await supabaseAdmin.from("license_codes").update({
            redeemed_at: new Date().toISOString(), redeemed_by_site: site.id,
          }).eq("id", lic.id);

          return Response.json({
            ok: true,
            site_id: site.id,
            plan: lic.plan,
            expires_at: expires,
            device_token: site.device_token,
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
