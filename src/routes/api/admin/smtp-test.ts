import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const Route = createFileRoute("/api/admin/smtp-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") || "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
          if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

          const url = process.env.SUPABASE_URL!;
          const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

          // Verify caller is superadmin
          const userClient = createClient(url, anon, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false },
          });
          const { data: u } = await userClient.auth.getUser();
          if (!u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

          const admin = createClient(url, service, { auth: { persistSession: false } });
          const { data: role } = await admin.from("user_roles").select("role")
            .eq("user_id", u.user.id).eq("role", "superadmin").maybeSingle();
          if (!role) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

          const body = await request.json().catch(() => ({}));
          const to = String(body?.to || "").trim();
          if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
            return new Response(JSON.stringify({ error: "Destino inválido" }), { status: 400 });
          }

          const { data: s } = await admin.from("smtp_settings").select("*").eq("key", "global").maybeSingle();
          if (!s || !s.host || !s.from_email) {
            return new Response(JSON.stringify({ error: "SMTP no configurado" }), { status: 400 });
          }

          const transporter = nodemailer.createTransport({
            host: s.host,
            port: s.port || 587,
            secure: !!s.secure,
            auth: s.username ? { user: s.username, pass: s.password || "" } : undefined,
          });

          await transporter.sendMail({
            from: `"${s.from_name || "SolarOps"}" <${s.from_email}>`,
            to,
            subject: "Prueba SMTP — SolarOps",
            text: "Si recibes este correo, tu configuración SMTP funciona correctamente.",
            html: "<p>Si recibes este correo, tu configuración SMTP funciona correctamente.</p>",
          });

          return new Response(JSON.stringify({ ok: true }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
