import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadBrand, wrapHtml, ctaButton, render, DEFAULTS, type MailVars } from "./smtp.server";

export const getDefaultEmailHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ templateId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const brand = await loadBrand();
    const def = DEFAULTS[data.templateId] || DEFAULTS.alert;
    // Build the full wrapped HTML using literal {{vars}} so the admin can edit them.
    const passthroughVars = new Proxy({} as MailVars, {
      get: (_t, prop: string) => `{{${prop}}}`,
    });
    const inner = def.html; // already contains {{vars}}
    const ctaHtml = ctaButton(def.cta, passthroughVars, brand);
    const fullHtml = wrapHtml(inner, brand, ctaHtml);
    return { subject: def.subject, html: fullHtml, innerHtml: inner };
  });


const SAMPLE_VARS: MailVars = {
  name: "María González",
  full_name: "María González",
  user_name: "María González",
  first_name: "María",
  email: "maria@ejemplo.cl",
  user_email: "maria@ejemplo.cl",
  link: "https://ejemplo.cl/accion",
  url: "https://ejemplo.cl/accion",
  action_url: "https://ejemplo.cl/accion",
  message: "Batería al 18% — considera reducir cargas no esenciales.",
  inviter: "Juan Pérez",
  role: "admin",
  expires_at: new Date(Date.now() + 7 * 86400_000).toLocaleDateString(),
  plan: "Pro",
  title: "Batería baja",
  severity: "warn",
};

const Schema = z.object({
  templateId: z.string().min(1).max(64),
  subject: z.string().max(300).optional(),
  html: z.string().max(50_000).optional(),
  cta: z.string().max(300).optional(),
  wrapWithBrand: z.boolean().optional(),
});

export const renderEmailPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const brand = await loadBrand();
    const baseVars: MailVars = { site_name: brand.site_name, ...SAMPLE_VARS };
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
    const def = DEFAULTS[data.templateId] || DEFAULTS.alert;
    const subject = render(data.subject || def.subject, vars);
    const innerHtml = render(data.html || def.html, vars);
    const ctaHtml = ctaButton(data.cta || def.cta, vars, brand);
    const wrap = data.wrapWithBrand ?? true;
    const html = wrap ? wrapHtml(innerHtml, brand, ctaHtml) : innerHtml;
    return { subject, html };
  });
