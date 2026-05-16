import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SiteRole = "owner" | "admin" | "operator" | "viewer";

/**
 * Resolve the current authenticated user's effective role on a site.
 *
 * Precedence:
 *   superadmin app role  → "owner"  (full power)
 *   sites.owner_id == me → "owner"
 *   site_members.role    → "admin" | "operator" | "viewer"
 *   otherwise            → null  (no access — RLS would block anyway)
 *
 * Capability matrix (matches RLS policies in the database):
 *
 *   viewer    → read dashboards, charts, totals, alerts (own).
 *               Cannot send commands, cannot edit config, cannot share.
 *   operator  → viewer + send commands to the inverter
 *               (quick actions, inverter wizard).
 *               Cannot edit PV/site config and cannot manage members.
 *   admin     → operator + edit devices, PV config, share site,
 *               manage members and invitations, see install token.
 *   owner     → admin + delete site, transfer, everything.
 */
export function useSiteRole(siteId: string | null | undefined) {
  const [role, setRole] = useState<SiteRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!siteId) { setRole(null); setLoading(false); return; }
    setLoading(true);

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { if (alive) { setRole(null); setLoading(false); } return; }

      // superadmin → treat as owner everywhere
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      if (roles?.some((r) => r.role === "superadmin")) {
        if (alive) { setRole("owner"); setLoading(false); }
        return;
      }

      const [{ data: site }, { data: mem }] = await Promise.all([
        supabase.from("sites").select("owner_id").eq("id", siteId).maybeSingle(),
        supabase.from("site_members").select("role").eq("site_id", siteId).eq("user_id", uid).maybeSingle(),
      ]);

      if (!alive) return;
      if (site?.owner_id === uid) setRole("owner");
      else if (mem?.role === "admin") setRole("admin");
      else if (mem?.role === "operator") setRole("operator");
      else if (mem?.role === "viewer") setRole("viewer");
      else setRole(null);
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [siteId]);

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || isOwner;
  const isOperator = role === "operator" || isAdmin;
  const isViewer = role === "viewer" || isOperator;

  return {
    role,
    loading,
    isOwner,
    isAdmin,
    isOperator,
    isViewer,
    /** can send commands to the inverter (quick actions, wizard) */
    canControl: isOperator,
    /** can edit PV / devices / sharing / install token */
    canConfigure: isAdmin,
    /** can invite / remove members and change their roles */
    canManageMembers: isAdmin,
  };
}

export const ROLE_LABEL: Record<SiteRole, string> = {
  owner:    "Propietario",
  admin:    "Admin",
  operator: "Operador",
  viewer:   "Lector",
};

export const ROLE_DESCRIPTION: Record<SiteRole, string> = {
  owner:    "Control total: ver, controlar, configurar, compartir y eliminar el sitio.",
  admin:    "Ver, controlar el inversor, editar configuración PV y compartir el sitio con otros usuarios.",
  operator: "Ver datos en tiempo real y enviar comandos al inversor (acciones rápidas y asistente).",
  viewer:   "Solo lectura: dashboard, gráficas, totales y alertas. No puede enviar comandos ni configurar.",
};
