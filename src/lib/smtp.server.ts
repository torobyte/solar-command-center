/**
 * SMTP server-side helper.
 * Loads `smtp_settings` (key='global') and `email_templates` from the DB and
 * sends transactional emails via nodemailer. Wraps every HTML body in a
 * branded, responsive template that pulls colors/logo/site_name from
 * `branding_settings`.
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

interface Brand {
  site_name: string;
  tagline: string | null;
  logo_url: string | null;
  primary_color: string;
  primary_foreground: string;
  background_color: string;
  foreground_color: string;
  card_color: string;
  border_color: string;
}

export const DEFAULTS: Record<string, { subject: string; html: string; text: string; cta?: string }> = {
  signup: {
    subject: "Bienvenido a {{site_name}}",
    html: `<h1>¡Hola {{name}}!</h1><p>Tu cuenta en <strong>{{site_name}}</strong> fue creada con éxito. Ya puedes acceder a tu panel de control y empezar a monitorear tu sistema.</p>`,
    text: "Hola {{name}}, tu cuenta en {{site_name}} fue creada.",
    cta: "Ir al panel|{{link}}",
  },
  auth_reset: {
    subject: "Restablece tu contraseña — {{site_name}}",
    html: `<h1>Restablece tu contraseña</h1><p>Hola {{name}}, recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>{{site_name}}</strong>.</p><p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace caduca en 1 hora.</p><p style="color:#888;font-size:13px;margin-top:24px">Si no fuiste tú, puedes ignorar este correo de forma segura.</p>`,
    text: "Restablece tu contraseña: {{link}}",
    cta: "Restablecer contraseña|{{link}}",
  },
  auth_verify: {
    subject: "Verifica tu correo — {{site_name}}",
    html: `<h1>Confirma tu correo</h1><p>Hola {{name}}, gracias por registrarte en <strong>{{site_name}}</strong>. Para terminar la configuración de tu cuenta, confirma esta dirección de correo:</p>`,
    text: "Verifica tu correo: {{link}}",
    cta: "Verificar correo|{{link}}",
  },
  invite: {
    subject: "Te invitaron a {{site_name}}",
    html: `<h1>Tienes una invitación</h1><p><strong>{{inviter}}</strong> te invitó a colaborar en el sitio <strong>{{site_name}}</strong> con el rol de <strong>{{role}}</strong>.</p><p style="color:#888;font-size:13px">El enlace vence el {{expires_at}}.</p>`,
    text: "{{inviter}} te invitó a {{site_name}} ({{role}}). Acepta aquí: {{link}}",
    cta: "Aceptar invitación|{{link}}",
  },
  alert: {
    subject: "[{{severity}}] {{title}} — {{site_name}}",
    html: `<h1>{{title}}</h1><p>Se activó una alerta en <strong>{{site_name}}</strong>:</p><p style="padding:12px 16px;background:#fff7ed;border-left:3px solid #f59e0b;border-radius:4px;color:#7c2d12">{{message}}</p>`,
    text: "{{title}} en {{site_name}}: {{message}} — {{link}}",
    cta: "Ver sitio|{{link}}",
  },
  license: {
    subject: "Licencia actualizada — {{site_name}}",
    html: `<h1>Tu licencia está activa</h1><p>Hola {{name}}, tu sitio <strong>{{site_name}}</strong> está en el plan <strong>{{plan}}</strong> y permanecerá activo hasta el <strong>{{expires_at}}</strong>.</p>`,
    text: "Sitio {{site_name}}: plan {{plan}}, vence {{expires_at}}.",
    cta: "Ver panel|{{link}}",
  },
};

export function render(tpl: string, vars: MailVars): string {
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

export async function loadBrand(): Promise<Brand> {
  const { data } = await supabaseAdmin
    .from("branding_settings")
    .select(
      "site_name,tagline,logo_url,primary_color,primary_foreground,background_color,foreground_color,card_color,border_color",
    )
    .eq("key", "global")
    .maybeSingle();
  const b = (data as Partial<Brand> | null) || {};
  return {
    site_name: (b.site_name || "Mi plataforma").trim(),
    tagline: b.tagline ?? null,
    logo_url: b.logo_url ?? null,
    primary_color: b.primary_color || "#f59e0b",
    primary_foreground: b.primary_foreground || "#ffffff",
    background_color: "#f5f6f8",
    foreground_color: "#0f172a",
    card_color: "#ffffff",
    border_color: "#e5e7eb",
  };
}

export function ctaButton(cta: string | undefined, vars: MailVars, brand: Brand): string {
  if (!cta) return "";
  const [labelTpl, hrefTpl] = cta.split("|");
  const href = render(hrefTpl || "", vars);
  const label = render(labelTpl || "Abrir", vars);
  if (!href) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:32px 0"><tr><td align="center" bgcolor="${brand.primary_color}" style="border-radius:8px"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:${brand.primary_foreground};text-decoration:none;border-radius:8px">${label}</a></td></tr></table><p style="color:#64748b;font-size:13px;line-height:1.5;margin:16px 0 0">O copia este enlace en tu navegador:<br><a href="${href}" style="color:${brand.primary_color};word-break:break-all">${href}</a></p>`;
}

export function wrapHtml(innerHtml: string, brand: Brand, ctaHtml: string): string {
  const logo = brand.logo_url
    ? `<img src="${brand.logo_url}" alt="${brand.site_name}" style="max-height:44px;max-width:200px;display:inline-block">`
    : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;color:${brand.primary_color}">${brand.site_name}</div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brand.site_name}</title></head>
<body style="margin:0;padding:0;background:${brand.background_color};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${brand.foreground_color}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${brand.background_color};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%">
        <tr><td align="center" style="padding:0 0 24px 0">${logo}</td></tr>
        <tr><td style="background:${brand.card_color};border:1px solid ${brand.border_color};border-radius:12px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
          <div style="font-size:15px;line-height:1.6;color:${brand.foreground_color}">
            <style>h1{font-size:22px!important;font-weight:700!important;margin:0 0 16px!important;color:${brand.foreground_color}!important;line-height:1.3!important}p{margin:0 0 14px!important;font-size:15px!important;line-height:1.6!important;color:#334155!important}a{color:${brand.primary_color}}</style>
            ${innerHtml}
            ${ctaHtml}
          </div>
        </td></tr>
        <tr><td align="center" style="padding:24px 16px;color:#94a3b8;font-size:12px;line-height:1.5">
          <p style="margin:0;color:#94a3b8;font-size:12px">© ${new Date().getFullYear()} ${brand.site_name}${brand.tagline ? ` · ${brand.tagline}` : ""}</p>
          <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px">Este es un correo automático. Por favor no respondas a esta dirección.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface SendMailInput {
  to: string;
  templateId: keyof typeof DEFAULTS | string;
  vars?: MailVars;
  /** Override subject/html/text completely (skips template lookup AND branded wrapper). */
  subject?: string;
  html?: string;
  text?: string;
  /** Override CTA (label|href). If template has CTA in DEFAULTS it's used. */
  cta?: string;
}

export interface SendMailResult {
  ok: boolean;
  skipped?: "smtp_disabled" | "template_disabled" | "no_recipient";
  error?: string;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  try {
    const to = input.to?.trim();
    if (!to) return { ok: false, skipped: "no_recipient" };

    const smtp = await loadSmtp();
    if (!smtp || !smtp.enabled || !smtp.host || !smtp.from_email) {
      return { ok: false, skipped: "smtp_disabled" };
    }

    const brand = await loadBrand();
    const baseVars: MailVars = { site_name: brand.site_name, ...(input.vars || {}) };
    const vars: MailVars = {
      ...baseVars,
      full_name: baseVars.full_name ?? baseVars.name,
      user_name: baseVars.user_name ?? baseVars.name,
      first_name:
        baseVars.first_name ??
        (typeof baseVars.name === "string" ? baseVars.name.split(" ")[0] : baseVars.name),
      user_email: baseVars.user_email ?? baseVars.email,
      url: baseVars.url ?? baseVars.link,
      action_url: baseVars.action_url ?? baseVars.link,
    };

    let subject = input.subject;
    let html = input.html;
    let text = input.text;
    const ctaSpec = input.cta;

    if (!subject || !html) {
      const tpl = await loadTemplate(input.templateId);
      if (tpl && tpl.enabled === false) return { ok: false, skipped: "template_disabled" };
      const def = DEFAULTS[input.templateId] || DEFAULTS.alert;
      subject = subject ?? render(tpl?.subject || def.subject, vars);
      const innerHtml = render(tpl?.html_body || def.html, vars);
      const ctaHtml = ctaButton(ctaSpec || def.cta, vars, brand);
      html = html ?? wrapHtml(innerHtml, brand, ctaHtml);
      text = text ?? render(tpl?.text_body || def.text, vars);
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: !!smtp.secure,
      auth: smtp.username ? { user: smtp.username, pass: smtp.password || "" } : undefined,
    });

    await transporter.sendMail({
      from: `"${smtp.from_name || brand.site_name}" <${smtp.from_email}>`,
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
