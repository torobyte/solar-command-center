import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
