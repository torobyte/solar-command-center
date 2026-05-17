import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const WidgetConfigInput = z.object({
  id: z.string().uuid().optional(),
  site_id: z.string().uuid(),
  label: z.string().min(1).max(60).default("Mi sitio"),
  metrics: z.array(z.enum(["pv", "battery", "load", "grid", "mode", "alerts"])).min(1).max(6),
  theme: z.enum(["dark", "light"]).default("dark"),
  refresh_minutes: z.number().int().min(5).max(360),
});

export const listWidgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const [{ data: configs }, { data: tokens }, { data: sites }] = await Promise.all([
      supabase.from("widget_configs").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("widget_tokens").select("id,label,token,created_at,last_used_at,revoked_at").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("sites").select("id,name,device_token"),
    ]);
    return { configs: configs ?? [], tokens: tokens ?? [], sites: sites ?? [] };
  });

export const saveWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WidgetConfigInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // ensure a token exists for this user
    let { data: tok } = await supabase
      .from("widget_tokens")
      .select("id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (!tok) {
      const ins = await supabase
        .from("widget_tokens")
        .insert({ user_id: userId, label: "Widgets Android" })
        .select("id")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      tok = ins.data;
    }

    const row = {
      user_id: userId,
      token_id: tok!.id,
      site_id: data.site_id,
      label: data.label,
      metrics: data.metrics,
      theme: data.theme,
      refresh_minutes: data.refresh_minutes,
    };

    if (data.id) {
      const { error } = await supabase.from("widget_configs").update(row).eq("id", data.id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    } else {
      const { data: created, error } = await supabase.from("widget_configs").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true, id: created.id };
    }
  });

export const deleteWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("widget_configs").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeWidgetToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("widget_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ensureWidgetToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: existing } = await supabase
      .from("widget_tokens")
      .select("id,token")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) return { token: existing.token, id: existing.id };
    const { data: created, error } = await supabase
      .from("widget_tokens")
      .insert({ user_id: userId, label: "Widgets Android" })
      .select("id,token")
      .single();
    if (error) throw new Error(error.message);
    return { token: created.token, id: created.id };
  });
