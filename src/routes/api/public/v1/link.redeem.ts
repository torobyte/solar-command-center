// Canje de código de vinculación → devuelve el token de API asociado.
// El código es numérico (6 u 8 dígitos), de un solo uso y caduca en 15 minutos.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/v1/link/redeem")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { code?: string };
          const code = String(body.code ?? "").replace(/\D/g, "");
          if (!/^\d{6}$|^\d{8}$/.test(code)) {
            return json({ error: "invalid_code_format" }, 400);
          }

          const { data: row } = await supabaseAdmin
            .from("api_key_link_codes")
            .select("id,api_key_id,user_id,expires_at,consumed_at,label")
            .eq("code", code)
            .maybeSingle();

          if (!row) return json({ error: "invalid_code" }, 404);
          if (row.consumed_at) return json({ error: "code_already_used" }, 409);
          if (new Date(row.expires_at).getTime() < Date.now()) {
            return json({ error: "code_expired" }, 410);
          }

          const { data: key } = await supabaseAdmin
            .from("user_api_keys")
            .select("id,token,label,revoked_at")
            .eq("id", row.api_key_id)
            .maybeSingle();
          if (!key || key.revoked_at) return json({ error: "key_revoked" }, 403);

          // Un solo uso: marcamos consumido de forma condicional.
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for") ??
            null;
          const { data: claimed } = await supabaseAdmin
            .from("api_key_link_codes")
            .update({ consumed_at: new Date().toISOString(), consumed_by_ip: ip })
            .eq("id", row.id)
            .is("consumed_at", null)
            .select("id")
            .maybeSingle();
          if (!claimed) return json({ error: "code_already_used" }, 409);

          return json({
            token: key.token,
            token_type: "Bearer",
            label: key.label,
            user_id: row.user_id,
          });
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
