import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function siteFromToken(token: string) {
  const { data } = await supabaseAdmin
    .from("sites").select("id").eq("device_token", token).maybeSingle();
  return data?.id ?? null;
}

function bearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export const Route = createFileRoute("/api/public/commands")({
  server: {
    handlers: {
      // Agent polls pending commands. Returns up to 20, marks them as `sent`.
      GET: async ({ request }) => {
        const token = bearer(request);
        if (!token) return Response.json({ error: "missing token" }, { status: 401 });
        const siteId = await siteFromToken(token);
        if (!siteId) return Response.json({ error: "invalid token" }, { status: 401 });

        const { data: pending } = await supabaseAdmin
          .from("device_commands")
          .select("id,command,payload,created_at")
          .eq("site_id", siteId)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(20);

        const ids = (pending ?? []).map((c) => c.id);
        if (ids.length) {
          await supabaseAdmin
            .from("device_commands")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .in("id", ids);
        }
        return Response.json({ commands: pending ?? [] });
      },

      // Agent acknowledges a command result.
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return Response.json({ error: "missing token" }, { status: 401 });
        const siteId = await siteFromToken(token);
        if (!siteId) return Response.json({ error: "invalid token" }, { status: 401 });

        const body = (await request.json()) as {
          id?: string; status?: "done" | "failed"; result?: unknown; error?: string;
        };
        if (!body.id || !body.status) {
          return Response.json({ error: "id and status required" }, { status: 400 });
        }
        const { error } = await supabaseAdmin
          .from("device_commands")
          .update({
            status: body.status,
            result: (body.result ?? null) as never,
            error: body.error ?? null,
            acked_at: new Date().toISOString(),
          })
          .eq("id", body.id)
          .eq("site_id", siteId);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
