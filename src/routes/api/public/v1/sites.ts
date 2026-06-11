import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

function unauthorized(msg = "Unauthorized") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export async function authenticateApiKey(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length < 16 || token.length > 128) return null;
  const { data } = await supabaseAdmin
    .from("user_api_keys")
    .select("id,user_id,revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  supabaseAdmin
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});
  return { userId: data.user_id as string };
}

export const Route = createFileRoute("/api/public/v1/sites")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if (!auth) return unauthorized();

        // Sitios propios + sitios compartidos via site_members
        const [{ data: owned }, { data: shared }] = await Promise.all([
          supabaseAdmin
            .from("sites")
            .select("id,name,status,last_seen_at,timezone,location")
            .eq("owner_id", auth.userId),
          supabaseAdmin
            .from("site_members")
            .select("site:sites(id,name,status,last_seen_at,timezone,location)")
            .eq("user_id", auth.userId),
        ]);

        const map = new Map<string, any>();
        for (const s of owned ?? []) map.set(s.id, s);
        for (const r of shared ?? []) {
          const s = (r as any).site;
          if (s && !map.has(s.id)) map.set(s.id, s);
        }

        return new Response(JSON.stringify({ sites: [...map.values()] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            ...CORS,
          },
        });
      },
    },
  },
});
