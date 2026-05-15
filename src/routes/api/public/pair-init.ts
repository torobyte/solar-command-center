// Local agent calls this when it boots without an account binding.
// We allocate a fresh 6-character alphanumeric pairing code (avoiding
// ambiguous characters) and return it. The user types the code in the
// "Add site" dialog to bind the device to their account.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
function randomCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export const Route = createFileRoute("/api/public/pair-init")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            hardware_id?: string;
            inverter_model?: string;
            inverter_serial?: string;
            board_model?: string;
            agent_version?: string;
          };
          if (!body.hardware_id) {
            return Response.json({ error: "hardware_id required" }, { status: 400 });
          }

          // Idempotent: if there is already an unclaimed live code for this
          // hardware, return it instead of allocating a new one.
          const { data: live } = await supabaseAdmin
            .from("pairing_codes")
            .select("*")
            .eq("hardware_id", body.hardware_id)
            .is("claimed_by_site", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (live) {
            return Response.json({ ok: true, code: live.code, expires_at: live.expires_at });
          }

          // Try a few times in the (extremely unlikely) event of a collision.
          for (let attempt = 0; attempt < 8; attempt++) {
            const code = randomCode();
            const { data, error } = await supabaseAdmin
              .from("pairing_codes")
              .insert({
                code,
                hardware_id: body.hardware_id,
                inverter_model: body.inverter_model ?? null,
                inverter_serial: body.inverter_serial ?? null,
                board_model: body.board_model ?? null,
                agent_version: body.agent_version ?? null,
              })
              .select()
              .single();
            if (!error && data) {
              return Response.json({ ok: true, code: data.code, expires_at: data.expires_at });
            }
          }
          return Response.json({ error: "could not allocate code" }, { status: 500 });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
