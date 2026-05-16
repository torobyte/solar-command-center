import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Trash2, Copy, Mail, Shield, Eye, Wrench, Crown } from "lucide-react";
import { inviteToSite } from "@/lib/sharing.functions";

type Role = "viewer" | "operator" | "admin";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  invited_email: string | null;
  created_at: string;
  email?: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface Props {
  siteId: string;
  isOwnerOrAdmin: boolean;
}

const ROLE_META: Record<Role, { label: string; desc: string; color: string; icon: typeof Eye }> = {
  viewer:   { label: "Lector",    desc: "Solo ver datos",                  color: "bg-muted text-muted-foreground",        icon: Eye },
  operator: { label: "Operador",  desc: "Ver y enviar comandos rápidos",   color: "bg-accent/15 text-accent",              icon: Wrench },
  admin:    { label: "Admin",     desc: "Configurar e invitar usuarios",   color: "bg-primary/15 text-primary",            icon: Crown },
};

export function SiteSharing({ siteId, isOwnerOrAdmin }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [busy, setBusy] = useState(false);
  const invite$ = useServerFn(inviteToSite);

  async function load() {
    setLoading(true);
    const [{ data: m }, { data: inv }] = await Promise.all([
      supabase.from("site_members").select("*").eq("site_id", siteId).order("created_at"),
      supabase.from("site_invitations").select("*").eq("site_id", siteId).is("accepted_at", null).order("created_at", { ascending: false }),
    ]);
    const memberList = (m ?? []) as Member[];
    if (memberList.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,email")
        .in("id", memberList.map((x) => x.user_id));
      const byId = new Map((profiles ?? []).map((p) => [p.id, p.email] as const));
      memberList.forEach((mm) => { mm.email = byId.get(mm.user_id) ?? null; });
    }
    setMembers(memberList);
    setInvitations((inv ?? []) as Invitation[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [siteId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { toast.error("Email inválido"); return; }
    setBusy(true);
    try {
      const res = await invite$({
        data: { site_id: siteId, email: clean, role, origin: window.location.origin },
      });
      if (res.email_sent) {
        toast.success(`Invitación enviada por correo a ${clean}`);
      } else if (res.email_skipped === "smtp_disabled") {
        toast.success(`Invitación creada. Configura SMTP para enviar el correo automáticamente.`);
      } else {
        toast.success(`Invitación creada para ${clean}`);
      }
      setEmail("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId: string, newRole: Role) {
    const { error } = await supabase.from("site_members").update({ role: newRole }).eq("id", memberId);
    if (error) toast.error(error.message);
    else { toast.success("Rol actualizado"); load(); }
  }

  async function removeMember(memberId: string) {
    if (!confirm("¿Quitar a este usuario del sitio?")) return;
    const { error } = await supabase.from("site_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else { toast.success("Usuario removido"); load(); }
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("site_invitations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Invitación revocada"); load(); }
  }

  function inviteLink(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  return (
    <div className="space-y-4">
      {isOwnerOrAdmin && (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-accent" strokeWidth={2.4} />
            <h4 className="font-semibold">Invitar usuario</h4>
          </div>
          <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@dominio.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-xs">Rol</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="viewer">Lector</option>
                <option value="operator">Operador</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" disabled={busy} className="rounded-full">
              {busy ? "Enviando…" : "Invitar"}
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Se generará un link de invitación. Si la persona ya tiene cuenta y se registra
            con ese email, se vinculará automáticamente al ingresar.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-foreground/70" strokeWidth={2.2} />
          <h4 className="font-semibold">Miembros</h4>
          <Badge variant="outline" className="ml-auto">{members.length}</Badge>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no compartiste este sitio con nadie.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const meta = ROLE_META[m.role];
              const Icon = meta.icon;
              return (
                <div key={m.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.email ?? m.invited_email ?? m.user_id.slice(0, 8)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Desde {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {isOwnerOrAdmin ? (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value as Role)}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="viewer">Lector</option>
                      <option value="operator">Operador</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </span>
                  )}
                  {isOwnerOrAdmin && (
                    <Button size="icon" variant="ghost" onClick={() => removeMember(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isOwnerOrAdmin && invitations.length > 0 && (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Mail className="h-4 w-4 text-foreground/70" strokeWidth={2.2} />
            <h4 className="font-semibold">Invitaciones pendientes</h4>
            <Badge variant="outline" className="ml-auto">{invitations.length}</Badge>
          </div>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{inv.email}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Rol: {ROLE_META[inv.role].label} · Expira {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink(inv.token));
                    toast.success("Link de invitación copiado");
                  }}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copiar link
                </Button>
                <Button size="icon" variant="ghost" onClick={() => revokeInvite(inv.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
