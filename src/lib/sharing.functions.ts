import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMail } from "@/lib/smtp.server";
import { canonicalAppHref } from "@/lib/email-template-config";

const ROLE_LABELS: Record<string, string> = {
  viewer: "Lector",
  operator: "Operador",
  admin: "Administrador",
};

/**
 * Invite a user to a site: insert into site_invitations + send email via SMTP.
 * The caller must be owner or admin of the site.
 */
export const inviteToSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      site_id: z.string().uuid(),
      email: z.string().email().max(255).transform((s) => s.trim().toLowerCase()),
      role: z.enum(["viewer", "operator", "admin"]),
      origin: z.string().url().max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Verify caller is owner or admin
    const { data: site } = await supabaseAdmin
      .from("sites").select("id,owner_id,name").eq("id", data.site_id).maybeSingle();
    if (!site) throw new Error("Sitio no encontrado");
    let allowed = site.owner_id === userId;
    if (!allowed) {
      const { data: m } = await supabaseAdmin
        .from("site_members").select("role").eq("site_id", data.site_id).eq("user_id", userId).maybeSingle();
      allowed = m?.role === "admin";
    }
    if (!allowed) throw new Error("No tienes permiso para invitar");

    const { data: inv, error } = await supabaseAdmin
      .from("site_invitations")
      .insert({ site_id: data.site_id, email: data.email, role: data.role, invited_by: userId })
      .select("id,token,expires_at,email,role")
      .single();
    if (error || !inv) throw new Error(error?.message || "No se pudo crear la invitación");

    const { data: inviter } = await supabaseAdmin
      .from("profiles").select("full_name,email").eq("id", userId).maybeSingle();

    const link = canonicalAppHref(`/invite/${inv.token}`);
    const expiresStr = new Date(inv.expires_at as string).toLocaleDateString();

    const mail = await sendMail({
      to: data.email,
      templateId: "site_invitation",
      vars: {
        site_name: site.name || "el sitio",
        inviter: inviter?.full_name || inviter?.email || "Un usuario",
        role: ROLE_LABELS[data.role] || data.role,
        link,
        accept_url: link,
        expires_at: expiresStr,
      },
    });

    return {
      invitation_id: inv.id as string,
      token: inv.token as string,
      email_sent: mail.ok,
      email_skipped: mail.skipped,
    };
  });

/**
 * Accept a site invitation by token. Uses admin client because the user
 * accepting may not have direct write access to site_members yet, but we've
 * verified the token + email match the authenticated user.
 */
export const acceptSiteInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const userEmail = (claims?.email as string | undefined)?.toLowerCase();
    if (!userEmail) throw new Error("Tu cuenta no tiene email");

    const { data: inv, error } = await supabaseAdmin
      .from("site_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();

    if (error || !inv) throw new Error("Invitación no encontrada");
    if (inv.accepted_at) throw new Error("Esta invitación ya fue usada");
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("La invitación expiró");
    if ((inv.email as string).toLowerCase() !== userEmail) {
      throw new Error("Esta invitación es para otro email");
    }

    const { error: insErr } = await supabaseAdmin.from("site_members").upsert(
      {
        site_id: inv.site_id,
        user_id: userId,
        role: inv.role,
        invited_email: inv.email,
      },
      { onConflict: "site_id,user_id" }
    );
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin
      .from("site_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    return { site_id: inv.site_id as string, role: inv.role as string };
  });

/**
 * Get site name for an invitation token (public-ish lookup gated by token).
 */
export const getInvitationInfo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input)
  )
  .handler(async ({ data }) => {
    const { data: inv } = await supabaseAdmin
      .from("site_invitations")
      .select("site_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { found: false as const };
    const { data: site } = await supabaseAdmin
      .from("sites")
      .select("name")
      .eq("id", inv.site_id)
      .maybeSingle();
    return {
      found: true as const,
      site_name: site?.name ?? "sitio",
      email: inv.email as string,
      role: inv.role as string,
      expired: new Date(inv.expires_at as string).getTime() < Date.now(),
      accepted: !!inv.accepted_at,
    };
  });

/**
 * Fetch owner profile info (id, email, full_name) for sites the requester
 * has access to. Uses admin to bypass profiles RLS but verifies access via
 * site membership/ownership first.
 */
export const getSiteOwners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ site_ids: z.array(z.string().uuid()).min(1).max(200) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: sites } = await supabaseAdmin
      .from("sites").select("id,owner_id").in("id", data.site_ids);
    if (!sites?.length) return { owners: [] as Array<{ site_id: string; owner_id: string; email: string | null; full_name: string | null }> };

    // Verify access: owner OR member
    const ownerIds = Array.from(new Set(sites.map(s => s.owner_id)));
    const { data: members } = await supabaseAdmin
      .from("site_members").select("site_id").eq("user_id", userId).in("site_id", data.site_ids);
    const memberSet = new Set((members ?? []).map(m => m.site_id));
    const allowed = sites.filter(s => s.owner_id === userId || memberSet.has(s.id));
    if (!allowed.length) return { owners: [] };

    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id,email,full_name").in("id", ownerIds);
    const byId = new Map((profs ?? []).map(p => [p.id, p]));
    return {
      owners: allowed.map(s => ({
        site_id: s.id,
        owner_id: s.owner_id,
        email: byId.get(s.owner_id)?.email ?? null,
        full_name: byId.get(s.owner_id)?.full_name ?? null,
      })),
    };
  });
