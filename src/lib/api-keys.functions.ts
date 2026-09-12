import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("id,label,token,created_at,last_used_at,revoked_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { keys: data ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ label: z.string().min(1).max(60).default("API key") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("user_api_keys")
      .insert({ user_id: userId, label: data.label })
      .select("id,label,token,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { key: row };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_api_keys")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Genera un código numérico corto (6 u 8 dígitos) asociado a una clave.
 *  Caduca a los 15 minutos y sólo se puede canjear una vez. */
export const createLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        api_key_id: z.string().uuid(),
        length: z.union([z.literal(6), z.literal(8)]).default(6),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: key, error: keyErr } = await supabase
      .from("user_api_keys")
      .select("id,label,revoked_at")
      .eq("id", data.api_key_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (keyErr) throw new Error(keyErr.message);
    if (!key) throw new Error("Clave no encontrada");
    if (key.revoked_at) throw new Error("La clave está revocada");

    // Invalida códigos vivos anteriores de esta clave.
    await supabase
      .from("api_key_link_codes")
      .delete()
      .eq("api_key_id", data.api_key_id)
      .is("consumed_at", null);

    const digits = () => {
      const bytes = new Uint32Array(data.length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => String(b % 10)).join("");
    };

    for (let attempt = 0; attempt < 8; attempt++) {
      const code = digits();
      const { data: row, error } = await supabase
        .from("api_key_link_codes")
        .insert({ code, api_key_id: data.api_key_id, user_id: userId, label: key.label })
        .select("code,expires_at")
        .single();
      if (!error) return { code: row.code as string, expires_at: row.expires_at as string };
      if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    }
    throw new Error("No se pudo generar un código, intenta de nuevo");
  });

/** Códigos vivos (no canjeados y no expirados) del usuario. */
export const listLinkCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("api_key_link_codes")
      .select("id,code,api_key_id,expires_at,consumed_at,created_at")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { codes: data ?? [] };
  });

export const cancelLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("api_key_link_codes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
