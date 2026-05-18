/**
 * SMTP server-side helper.
 * Loads `smtp_settings` (key='global') and `email_templates` from the DB and
 * sends transactional emails via nodemailer.
 *
 * NEVER import this file from client code — it relies on the service-role
 * Supabase client and runtime env (`process.env`).
 */
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MailVars = Record<string, string | number | undefined | null>;

interface SmtpRow {
  enabled: boolean | null;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  username: string | null;
  password: string | null;
  from_email: string | null;
  from_name: string | null;
}

interface Tpl {
  id: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  enabled: boolean | null;
}

const DEFAULTS: Record<string, { subject: string; html: string; text: string }> = {
  signup: {
    subject: "Bienvenido a {{site_name}}",
    html: `<p>Hola {{name}},</p><p>Tu cuenta en <b>{{site_name}}</b> fue creada.</p>`,
    text: "Hola {{name}}, tu cuenta en {{site_name}} fue creada.",
  },
  auth_reset: {
    subject: "Restablece tu contraseña",
    html: `<p>Hola {{name}},</p><p>Para restablecer tu contraseña haz clic <a href="{{link}}">aquí</a>.</p><p>Si no fuiste tú, ignora este correo.</p>`,
    text: "Restablece tu contraseña: {{link}}",
  },
  auth_verify: {
    subject: "Verifica tu correo",
    html: `<p>Hola {{name}},</p><p>Verifica tu correo haciendo clic <a href="{{link}}">aquí</a>.</p>`,
    text: "Verifica tu correo: {{link}}",
  },
  invite: {
    subject: "Te invitaron a {{site_name}}",
    html: `<p>Hola,</p><p>{{inviter}} te invitó a colaborar en el sitio <b>{{site_name}}</b> con rol <b>{{role}}</b>.</p><p><a href="{{link}}">Aceptar invitación</a></p><p>El enlace vence el {{expires_at}}.</p>`,
    text: "{{inviter}} te invitó a {{site_name}} ({{role}}). Acepta aquí: {{link}}",
  },
  alert: {
    subject: "[{{severity}}] {{title}} — {{site_name}}",
    html: `<p>Se activó una alerta en <b>{{site_name}}</b>:</p><p><b>{{title}}</b></p><p>{{message}}</p><p><a href="{{link}}">Ver sitio</a></p>`,
    text: "{{title}} en {{site_name}}: {{message}} — {{link}}",
  },
  license: {
    subject: "Licencia actualizada — {{site_name}}",
    html: `<p>Hola {{name}},</p><p>Tu sitio <b>{{site_name}}</b> tiene plan <b>{{plan}}</b> activo hasta <b>{{expires_at}}</b>.</p>`,
    text: "Sitio {{site_name}}: plan {{plan}}, vence {{expires_at}}.",
  },
};

function render(tpl: string, vars: MailVars): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function loadSmtp(): Promise<SmtpRow | null> {
  const { data } = await supabaseAdmin
    .from("smtp_settings")
    .select("*")
    .eq("key", "global")
    .maybeSingle();
  return (data as SmtpRow | null) || null;
}

async function loadTemplate(id: string): Promise<Tpl | null> {
  const { data } = await supabaseAdmin
    .from("email_templates")
    .select("id,subject,html_body,text_body,enabled")
    .eq("id", id)
    .maybeSingle();
  return (data as Tpl | null) || null;
}

async function loadBrandSiteName(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("branding_settings")
    .select("site_name")
    .eq("key", "global")
    .maybeSingle();
  return ((data as { site_name?: string | null } | null)?.site_name || "Mi plataforma").trim();
}

export interface SendMailInput {
  to: string;
  templateId: keyof typeof DEFAULTS | string;
  vars?: MailVars;
  /** Override subject/html/text completely (skips template lookup). */
  subject?: string;
  html?: string;
  text?: string;
}

export interface SendMailResult {
  ok: boolean;
  skipped?: "smtp_disabled" | "template_disabled" | "no_recipient";
  error?: string;
}

/**
 * Send an email. Returns `{ ok: false }` with a reason if SMTP is not
 * configured / disabled — callers should NOT throw, just log.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  try {
    const to = input.to?.trim();
    if (!to) return { ok: false, skipped: "no_recipient" };

    const smtp = await loadSmtp();
    if (!smtp || !smtp.enabled || !smtp.host || !smtp.from_email) {
      return { ok: false, skipped: "smtp_disabled" };
    }

    const brandSiteName = await loadBrandSiteName();
    const vars: MailVars = { site_name: brandSiteName, ...(input.vars || {}) };

    let subject = input.subject;
    let html = input.html;
    let text = input.text;

    if (!subject || !html) {
      const tpl = await loadTemplate(input.templateId);
      if (tpl && tpl.enabled === false) return { ok: false, skipped: "template_disabled" };
      const def = DEFAULTS[input.templateId] || DEFAULTS.alert;
      subject = subject ?? render(tpl?.subject || def.subject, vars);
      html = html ?? render(tpl?.html_body || def.html, vars);
      text = text ?? render(tpl?.text_body || def.text, vars);
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: !!smtp.secure,
      auth: smtp.username ? { user: smtp.username, pass: smtp.password || "" } : undefined,
    });

    await transporter.sendMail({
      from: `"${smtp.from_name || brandSiteName}" <${smtp.from_email}>`,
      to,
      subject,
      text,
      html,
    });

    return { ok: true };
  } catch (e) {
    console.warn("[smtp] send failed", e);
    return { ok: false, error: (e as Error).message };
  }
}
