import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMail } from "@/lib/smtp.server";

const signupSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().max(120).optional().default(""),
  origin: z.string().url(),
});

const recoverySchema = z.object({
  email: z.string().email().max(255).transform((v) => v.trim().toLowerCase()),
  origin: z.string().url(),
});

function buildBrandedLink(
  origin: string,
  tokenHash: string,
  type: "signup" | "recovery" | "invite" | "magiclink" | "email_change",
  next: string,
) {
  const base = origin.replace(/\/$/, "");
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next,
  });
  return `${base}/auth/confirm?${params.toString()}`;
}

export const signUpWithCustomEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: generated, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
        redirectTo: `${data.origin.replace(/\/$/, "")}/app`,
      },
    });

    if (error || !generated?.properties?.hashed_token) {
      throw new Error(error?.message || "No se pudo crear la cuenta");
    }

    const link = buildBrandedLink(
      data.origin,
      generated.properties.hashed_token,
      "signup",
      "/app",
    );

    await sendMail({
      to: data.email,
      templateId: "auth_verify",
      vars: {
        name: data.full_name || data.email,
        email: data.email,
        link,
      },
    });

    return { ok: true };
  });

export const sendRecoveryEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => recoverySchema.parse(input))
  .handler(async ({ data }) => {
    const { data: generated, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
      options: {
        redirectTo: `${data.origin.replace(/\/$/, "")}/reset-password`,
      },
    });

    if (error || !generated?.properties?.hashed_token) {
      throw new Error(error?.message || "No se pudo generar el correo de recuperación");
    }

    const link = buildBrandedLink(
      data.origin,
      generated.properties.hashed_token,
      "recovery",
      "/reset-password",
    );

    await sendMail({
      to: data.email,
      templateId: "auth_reset",
      vars: {
        name: data.email,
        email: data.email,
        link,
      },
    });

    return { ok: true };
  });