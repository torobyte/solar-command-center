import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadBrand, wrapHtml, ctaButton, render, DEFAULTS, type MailVars } from "./smtp.server";

const SAMPLE_VARS: MailVars = {
  name: "María González",
  email: "maria@ejemplo.cl",
  link: "https://ejemplo.cl/accion",
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
});

export const renderEmailPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const brand = await loadBrand();
    const vars: MailVars = { site_name: brand.site_name, ...SAMPLE_VARS };
    const def = DEFAULTS[data.templateId] || DEFAULTS.alert;
    const subject = render(data.subject || def.subject, vars);
    const innerHtml = render(data.html || def.html, vars);
    const ctaHtml = ctaButton(data.cta || def.cta, vars, brand);
    const html = wrapHtml(innerHtml, brand, ctaHtml);
    return { subject, html };
  });
