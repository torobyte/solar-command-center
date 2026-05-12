import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperadmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: superadmin only");
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(128),
      full_name: z.string().trim().max(120).optional().default(""),
      role: z.enum(["user", "superadmin"]).default("user"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message || "Failed to create user");
    if (data.role === "superadmin") {
      await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "superadmin" });
    }
    return { id: created.user.id, email: created.user.email };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(["user", "superadmin"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    if (data.role === "superadmin") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "superadmin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "superadmin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreateSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      owner_id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional().nullable(),
      inverter_model: z.string().trim().max(80).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { data: site, error } = await supabaseAdmin
      .from("sites")
      .insert({
        owner_id: data.owner_id,
        name: data.name,
        description: data.description ?? null,
        inverter_model: data.inverter_model ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return site;
  });

export const adminAssignSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      site_id: z.string().uuid(),
      owner_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { error } = await supabaseAdmin
      .from("sites")
      .update({ owner_id: data.owner_id })
      .eq("id", data.site_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ site_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { error } = await supabaseAdmin.from("sites").delete().eq("id", data.site_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRequestRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ site_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { error } = await supabaseAdmin
      .from("sites")
      .update({ force_refresh_at: new Date().toISOString() })
      .eq("id", data.site_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminActivateSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      site_id: z.string().uuid(),
      code: z.string().trim().min(4).max(64),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);

    const { data: lic, error: licErr } = await supabaseAdmin
      .from("license_codes").select("*").eq("code", data.code).maybeSingle();
    if (licErr) throw new Error(licErr.message);
    if (!lic) throw new Error("License code not found");
    if (lic.redeemed_at) throw new Error("License already redeemed");

    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites").select("id,plan,license_expires_at").eq("id", data.site_id).maybeSingle();
    if (siteErr || !site) throw new Error("Site not found");

    const now = Date.now();
    const isLifetime = (lic as { is_lifetime?: boolean }).is_lifetime === true;
    const baseMs = site.license_expires_at && new Date(site.license_expires_at).getTime() > now
      ? new Date(site.license_expires_at).getTime() : now;
    const expires = isLifetime
      ? new Date("9999-12-31T00:00:00Z").toISOString()
      : new Date(baseMs + (lic.duration_days ?? 0) * 86_400_000).toISOString();

    const { error: updErr } = await supabaseAdmin.from("sites").update({
      plan: lic.plan, license_expires_at: expires, status: "online",
    }).eq("id", site.id);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from("license_codes").update({
      redeemed_at: new Date().toISOString(), redeemed_by_site: site.id,
    }).eq("id", lic.id);

    return { plan: lic.plan, expires_at: expires };
  });

export const adminRevokeLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ site_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.userId);
    const { error } = await supabaseAdmin.from("sites").update({
      plan: "trial", license_expires_at: null,
    }).eq("id", data.site_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
