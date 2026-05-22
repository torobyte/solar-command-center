export const CANONICAL_APP_URL = "https://appsolar.torobyte.com";

export const EMAIL_TEMPLATE_ALIASES: Record<string, string> = {
  invite: "site_invitation",
  site_invitation: "site_invitation",
};

export function canonicalEmailTemplateId(id: string) {
  return EMAIL_TEMPLATE_ALIASES[id] ?? id;
}

export function canonicalAppUrl(_origin?: string | null) {
  return CANONICAL_APP_URL;
}

export function canonicalAppHref(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_APP_URL}${normalizedPath}`;
}

export const EMAIL_TEMPLATE_DEFINITIONS = [
  { id: "signup", name: "Signup / bienvenida" },
  { id: "auth_reset", name: "Auth — reset password" },
  { id: "auth_verify", name: "Auth — verificar email" },
  { id: "site_invitation", name: "Invitación a sitio" },
  { id: "alert", name: "Alertas / notificaciones" },
  { id: "license", name: "Licencia" },
] as const;

export const EMAIL_TEMPLATE_DEFAULTS: Record<string, { subject: string; html: string; text: string; cta?: string }> = {
  signup: {
    subject: "Bienvenido a {{site_name}}",
    html: `<h1>¡Hola {{name}}!</h1><p>Tu cuenta en <strong>{{site_name}}</strong> fue creada con éxito. Ya puedes acceder a tu panel de control y empezar a monitorear tu sistema.</p>`,
    text: "Hola {{name}}, tu cuenta en {{site_name}} fue creada.",
    cta: "Ir al panel|{{link}}",
  },
  auth_reset: {
    subject: "Restablece tu contraseña — {{site_name}}",
    html: `<h1>Restablece tu contraseña</h1><p>Hola {{name}}, recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>{{site_name}}</strong>.</p><p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace caduca en 1 hora.</p><p style="color:#888;font-size:13px;margin-top:24px">Si no fuiste tú, puedes ignorar este correo de forma segura.</p>`,
    text: "Restablece tu contraseña: {{action_link}}",
    cta: "Restablecer contraseña|{{action_link}}",
  },
  auth_verify: {
    subject: "Verifica tu correo — {{site_name}}",
    html: `<h1>Confirma tu correo</h1><p>Hola {{name}}, gracias por registrarte en <strong>{{site_name}}</strong>. Para terminar la configuración de tu cuenta, confirma esta dirección de correo:</p>`,
    text: "Verifica tu correo: {{action_link}}",
    cta: "Verificar correo|{{action_link}}",
  },
  site_invitation: {
    subject: "Te invitaron a {{site_name}} en Solar Torobyte",
    html: `<h1>Tienes una invitación</h1><p><strong>{{inviter}}</strong> te invitó a colaborar en el sitio <strong>{{site_name}}</strong> con el rol de <strong>{{role}}</strong>.</p><p style="color:#888;font-size:13px">El enlace vence el {{expires_at}}.</p>`,
    text: "{{inviter}} te invitó a {{site_name}} ({{role}}). Acepta aquí: {{accept_url}}",
    cta: "Aceptar invitación|{{accept_url}}",
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

export function getEmailTemplateDefault(id: string) {
  return EMAIL_TEMPLATE_DEFAULTS[canonicalEmailTemplateId(id)] ?? EMAIL_TEMPLATE_DEFAULTS.alert;
}

export function normalizeEmailTemplateContent(content: string | null | undefined) {
  if (!content) return content ?? "";
  return content
    .replace(/SolarOps/g, "Solar Torobyte")
    .replace(/https:\/\/[^\s"')>]+/g, (url) => {
      if (url.includes("appsolar.torobyte.com")) return url;
      if (url.includes("/invite/") || url.includes("/auth/confirm") || url.includes("/app") || url.includes("/sites/")) {
        try {
          const parsed = new URL(url);
          return `${CANONICAL_APP_URL}${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
          return url;
        }
      }
      return url;
    });
}