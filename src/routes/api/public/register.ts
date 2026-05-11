import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Self-registration endpoint called by the Raspberry agent at install time.
// Creates a new site assigned to the platform's primary superadmin (so it
// shows up in the admin panel for assignment) with a 30-day trial license,
// and inserts a matching trial entry in `license_codes` so the trial is
// visible in the licenses panel from day 1.
export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            hardware_id?: string;
            inverter_model?: string;
            inverter_serial?: string;
            site_name?: string;
          };

          if (!body.hardware_id) {
            return Response.json({ error: "hardware_id is required" }, { status: 400 });
          }

          // Idempotent: if a site already exists for this hardware_id, return it.
          const { data: existing } = await supabaseAdmin
            .from("sites")
            .select("*")
            .eq("hardware_id", body.hardware_id)
            .maybeSingle();
          if (existing) {
            return Response.json({
              ok: true,
              site_id: existing.id,
              device_token: existing.device_token,
              plan: existing.plan,
              expires_at: existing.license_expires_at,
              already_registered: true,
            });
          }

          // Pick a default owner: first available superadmin.
          const { data: adminRole } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "superadmin")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!adminRole?.user_id) {
            return Response.json(
              { error: "no superadmin configured on the platform" },
              { status: 500 },
            );
          }
          const ownerId = adminRole.user_id;

          const TRIAL_DAYS = 30;
          const expires = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
          const name =
            (body.site_name?.trim() || `Pi-${body.hardware_id.slice(-6)}`).slice(0, 120);

          const { data: site, error: siteErr } = await supabaseAdmin
            .from("sites")
            .insert({
              owner_id: ownerId,
              name,
              hardware_id: body.hardware_id,
              inverter_model: body.inverter_model ?? null,
              inverter_serial: body.inverter_serial ?? null,
              status: "online",
              plan: "trial",
              license_expires_at: expires,
            })
            .select()
            .single();
          if (siteErr || !site) {
            return Response.json(
              { error: siteErr?.message ?? "could not create site" },
              { status: 500 },
            );
          }

          // Generate a human-readable trial code so it shows in the licenses panel.
          const trialCode = `TRIAL-${body.hardware_id.slice(-8).toUpperCase()}-${Date.now()
            .toString(36)
            .toUpperCase()}`;
          await supabaseAdmin.from("license_codes").insert({
            code: trialCode,
            plan: "trial",
            duration_days: TRIAL_DAYS,
            owner_id: ownerId,
            created_by: ownerId,
            site_name: name,
            redeemed_at: new Date().toISOString(),
            redeemed_by_site: site.id,
            notes: "Auto-issued on Raspberry install",
          });

          return Response.json({
            ok: true,
            site_id: site.id,
            device_token: site.device_token,
            plan: "trial",
            expires_at: expires,
            trial_code: trialCode,
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
