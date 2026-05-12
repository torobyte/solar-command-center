import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, RefreshCw, Trash2, ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  adminCreateUser, adminSetUserRole, adminDeleteUser,
  adminCreateSite, adminAssignSite, adminDeleteSite, adminRequestRefresh,
  adminActivateSite, adminRevokeLicense,
} from "@/lib/admin.functions";
import { formatDistanceToNow } from "date-fns";
import { BrandingAdmin } from "@/components/admin/BrandingAdmin";
import { PlansAdmin } from "@/components/admin/PlansAdmin";
import { LicenseAuditLog } from "@/components/admin/LicenseAuditLog";
import { ConfirmDestructiveDialog } from "@/components/ConfirmDestructiveDialog";

export const Route = createFileRoute("/admin")({
  component: () => <ProtectedLayout requireRole="superadmin"><AdminPanel /></ProtectedLayout>,
});

async function getAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new Error("Your session expired. Please sign in again.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function AdminPanel() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.subtitle")}</p>
      </div>
      <Tabs defaultValue="sites">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="sites">{t("admin.tab.sites")}</TabsTrigger>
            <TabsTrigger value="users">{t("admin.tab.users")}</TabsTrigger>
            <TabsTrigger value="licenses">{t("admin.tab.licenses")}</TabsTrigger>
            <TabsTrigger value="audit">Auditoría</TabsTrigger>
            <TabsTrigger value="plans">Planes</TabsTrigger>
            <TabsTrigger value="branding">Branding & PWA</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sites" className="mt-6"><SitesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersAdmin /></TabsContent>
        <TabsContent value="licenses" className="mt-6"><Licenses /></TabsContent>
        <TabsContent value="audit" className="mt-6"><LicenseAuditLog /></TabsContent>
        <TabsContent value="plans" className="mt-6"><PlansAdmin /></TabsContent>
        <TabsContent value="branding" className="mt-6"><BrandingAdmin /></TabsContent>
      </Tabs>
    </>
  );
}

interface UserRow { id: string; email: string; full_name: string | null; isSuperadmin: boolean; }

function useUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  async function load() {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "superadmin").map((r) => r.user_id));
    setUsers((profiles ?? []).map((p) => ({ ...p, isSuperadmin: adminSet.has(p.id) })));
  }
  useEffect(() => { load(); }, []);
  return { users, reload: load };
}

interface SiteRow {
  id: string; name: string; status: string; plan: string;
  inverter_model: string | null; owner_id: string;
  last_seen_at: string | null; force_refresh_at: string | null;
  license_expires_at: string | null;
  device_token: string;
  profiles: { email?: string; full_name?: string | null } | null;
}

function useLicenseInfo() {
  const { t } = useI18n();
  return (plan: string, expires: string | null) => {
    if (!expires) return { label: plan, color: "text-muted-foreground", sub: t("lic.none") };
    const ms = new Date(expires).getTime() - Date.now();
    if (ms <= 0) return { label: plan, color: "text-destructive", sub: t("lic.expired") };
    const days = Math.ceil(ms / 86_400_000);
    return { label: plan, color: "text-success", sub: t("lic.daysLeft", { n: days }) };
  };
}

function useSyncStatus() {
  const { t } = useI18n();
  return (lastSeen: string | null) => {
    if (!lastSeen) return { label: t("sync.never"), color: "text-muted-foreground" };
    const ageMs = Date.now() - new Date(lastSeen).getTime();
    if (ageMs < 2 * 60_000) return { label: t("sync.online"), color: "text-success" };
    if (ageMs < 60 * 60_000) return { label: t("sync.stale"), color: "text-warning" };
    return { label: t("sync.offline"), color: "text-destructive" };
  };
}

function SitesAdmin() {
  const { t } = useI18n();
  const licenseInfo = useLicenseInfo();
  const syncStatus = useSyncStatus();
  const [rows, setRows] = useState<SiteRow[]>([]);
  const { users } = useUsers();
  const createSite = useServerFn(adminCreateSite);
  const assignSite = useServerFn(adminAssignSite);
  const deleteSite = useServerFn(adminDeleteSite);
  const requestRefresh = useServerFn(adminRequestRefresh);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", inverter_model: "", owner_id: "" });

  const activate = useServerFn(adminActivateSite);
  const revoke = useServerFn(adminRevokeLicense);
  const [licDlg, setLicDlg] = useState<SiteRow | null>(null);
  const [licCode, setLicCode] = useState("");

  async function runAdminAction<TData, TResult>(
    action: (opts: { data: TData; headers?: HeadersInit }) => Promise<TResult>,
    data: TData,
  ) {
    const headers = await getAuthHeaders();
    return action({ data, headers });
  }

  async function load() {
    const { data, error } = await supabase
      .from("sites")
      .select("id,name,status,plan,inverter_model,owner_id,last_seen_at,force_refresh_at,device_token,license_expires_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []).map((r) => ({ ...r, profiles: null })) as unknown as SiteRow[]);
  }
  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.owner_id) return toast.error(t("asite.selectOwner"));
    try {
      await runAdminAction(createSite, { ...form, description: form.description || null, inverter_model: form.inverter_model || null });
      toast.success(t("asite.created"));
      setOpen(false); setForm({ name: "", description: "", inverter_model: "", owner_id: "" });
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{t("asite.new")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("asite.register")}</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("asite.owner")}</Label>
                <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("asite.pickUser")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>{t("asite.inverterModel")}</Label>
                <Input value={form.inverter_model} onChange={(e) => setForm({ ...form, inverter_model: e.target.value })} placeholder="e.g. Axpert MKS 5K" />
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <DialogFooter><Button type="submit">{t("common.create")}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">{t("asite.col.site")}</th>
              <th className="px-4 py-3 font-medium">{t("asite.col.owner")}</th>
              <th className="px-4 py-3 font-medium">{t("asite.col.sync")}</th>
              <th className="px-4 py-3 font-medium">{t("asite.col.lastCheck")}</th>
              <th className="px-4 py-3 font-medium">{t("asite.col.plan")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = syncStatus(r.last_seen_at);
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.inverter_model ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={r.owner_id} onValueChange={async (v) => {
                      try { await runAdminAction(assignSite, { site_id: r.id, owner_id: v }); toast.success(t("asite.reassigned")); load(); }
                      catch (e) { toast.error((e as Error).message); }
                    }}>
                      <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className={`px-4 py-3 font-medium ${s.color}`}>{s.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div title={r.last_seen_at ?? ""}>
                      {r.last_seen_at ? formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true }) : "—"}
                    </div>
                    {r.last_seen_at && (
                      <div className="text-xs text-muted-foreground/70">
                        {new Date(r.last_seen_at).toLocaleString()}
                      </div>
                    )}
                    {r.force_refresh_at && (
                      <div className="text-xs text-warning">{t("sync.refreshRequested")}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => { const li = licenseInfo(r.plan, r.license_expires_at);
                      return (<><div className={`font-medium ${li.color}`}>{li.label}</div>
                        <div className="text-xs text-muted-foreground">{li.sub}</div></>); })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title={t("asite.activateTitle")}
                        onClick={() => { setLicCode(""); setLicDlg(r); }}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t("asite.copyToken")}
                        onClick={() => { navigator.clipboard.writeText(r.device_token); toast.success(t("asite.tokenCopied")); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t("asite.forceRefresh")}
                        onClick={async () => {
                          try { await runAdminAction(requestRefresh, { site_id: r.id }); toast.success(t("asite.refreshRequested")); load(); }
                          catch (e) { toast.error((e as Error).message); }
                        }}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t("asite.revoke")}
                        onClick={async () => {
                          if (!r.license_expires_at) return;
                          if (!confirm(t("asite.confirmRevoke", { name: r.name }))) return;
                          try { await runAdminAction(revoke, { site_id: r.id }); toast.success(t("asite.revoked")); load(); }
                          catch (e) { toast.error((e as Error).message); }
                        }}>
                        <ShieldOff className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t("asite.delete")}
                        onClick={async () => {
                          if (!confirm(t("asite.confirmDelete", { name: r.name }))) return;
                          try { await runAdminAction(deleteSite, { site_id: r.id }); toast.success(t("asite.deleted")); load(); }
                          catch (e) { toast.error((e as Error).message); }
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("asite.empty")}</p>}
      </div>

      <Dialog open={!!licDlg} onOpenChange={(o) => !o && setLicDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("asite.lic.title")} — {licDlg?.name}</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!licDlg) return;
            try {
              const res = await runAdminAction(activate, { site_id: licDlg.id, code: licCode.trim() });
              const d = new Date(res.expires_at);
              toast.success(t("asite.lic.success", { plan: res.plan, date: `${d.toLocaleDateString()} ${d.toLocaleTimeString()}` }));
              setLicDlg(null); load();
            } catch (e) { toast.error((e as Error).message); }
          }} className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("asite.lic.currentPlan")}</span>
                <span className="font-medium">{licDlg?.plan ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("asite.lic.currentExp")}</span>
                <span className="font-medium">
                  {licDlg?.license_expires_at
                    ? new Date(licDlg.license_expires_at).toLocaleString()
                    : t("asite.lic.noActive")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("asite.lic.note")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("asite.lic.code")}</Label>
              <Input value={licCode} onChange={(e) => setLicCode(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required />
            </div>
            <DialogFooter><Button type="submit">{t("asite.lic.activate")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UsersAdmin() {
  const { t } = useI18n();
  const { users, reload } = useUsers();
  const createUser = useServerFn(adminCreateUser);
  const setRole = useServerFn(adminSetUserRole);
  const delUser = useServerFn(adminDeleteUser);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "user" as "user" | "superadmin" });

  async function runAdminAction<TData, TResult>(
    action: (opts: { data: TData; headers?: HeadersInit }) => Promise<TResult>,
    data: TData,
  ) {
    const headers = await getAuthHeaders();
    return action({ data, headers });
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await runAdminAction(createUser, form);
      toast.success(t("ausers.created"));
      setOpen(false); setForm({ email: "", password: "", full_name: "", role: "user" });
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{t("ausers.new")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("ausers.create")}</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-2"><Label>{t("login.email")}</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>{t("login.password")}</Label>
                <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="space-y-2"><Label>{t("signup.fullName")}</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>{t("ausers.role")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "user" | "superadmin" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t("ausers.role.user")}</SelectItem>
                    <SelectItem value="superadmin">{t("ausers.role.superadmin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="submit">{t("common.create")}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">{t("ausers.col.email")}</th>
              <th className="px-4 py-3 font-medium">{t("ausers.col.name")}</th>
              <th className="px-4 py-3 font-medium">{t("ausers.col.role")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.full_name ?? "—"}</td>
                <td className="px-4 py-3">{u.isSuperadmin ? t("ausers.role.superadmin") : t("ausers.role.user")}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost"
                      title={u.isSuperadmin ? t("ausers.demote") : t("ausers.promote")}
                      onClick={async () => {
                        try {
                          await runAdminAction(setRole, { user_id: u.id, role: u.isSuperadmin ? "user" : "superadmin" });
                          toast.success(t("ausers.roleUpdated"));
                          reload();
                        } catch (e) { toast.error((e as Error).message); }
                      }}>
                      {u.isSuperadmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" title={t("ausers.deleteUser")}
                      onClick={async () => {
                        if (!confirm(t("ausers.confirmDelete", { email: u.email }))) return;
                        try { await runAdminAction(delUser, { user_id: u.id }); toast.success(t("ausers.deleted")); reload(); }
                        catch (e) { toast.error((e as Error).message); }
                      }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("ausers.empty")}</p>}
      </div>
    </>
  );
}

interface License {
  id: string; code: string; plan: string; duration_days: number | null;
  is_lifetime?: boolean;
  redeemed_at: string | null; revoked_at: string | null;
  notes: string | null; assigned_email: string | null;
  assigned_user_id: string | null; site_name: string | null;
  redeemed_by_site: string | null; created_at: string;
}

function Licenses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<License[]>([]);
  const [plans, setPlans] = useState<Array<{ slug: string; name: string; duration_days: number | null; is_lifetime: boolean }>>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "redeemed" | "revoked">("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ email: "", planSlug: "pro", days: 365, isLifetime: false, siteName: "", notes: "" });
  const [confirmDel, setConfirmDel] = useState<License | null>(null);
  const [confirmRev, setConfirmRev] = useState<License | null>(null);

  async function load() {
    const [{ data, error }, { data: pl }] = await Promise.all([
      supabase.from("license_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("plans").select("slug,name,duration_days,is_lifetime,active").eq("active", true).order("sort_order"),
    ]);
    if (error) toast.error(error.message);
    setRows((data ?? []) as License[]);
    setPlans((pl ?? []) as typeof plans);
  }
  useEffect(() => { load(); }, []);

  function pickPlan(slug: string) {
    const p = plans.find((x) => x.slug === slug);
    setForm((f) => ({
      ...f,
      planSlug: slug,
      isLifetime: !!p?.is_lifetime,
      days: p?.duration_days ?? f.days,
    }));
  }

  async function logAudit(action: string, lic: Pick<License, "id" | "code" | "plan">, reason: string, extra: Record<string, unknown> = {}) {
    if (!user) return;
    await supabase.from("license_audit_log").insert({
      license_id: lic.id,
      license_code: lic.code,
      plan: lic.plan,
      action,
      performed_by: user.id,
      performed_by_email: user.email ?? null,
      reason: reason || null,
      details: extra as never,
    });
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const code = generateCode();
    const { data: inserted, error } = await supabase.from("license_codes").insert({
      code,
      plan: form.planSlug,
      duration_days: form.isLifetime ? null : form.days,
      is_lifetime: form.isLifetime,
      assigned_email: form.email.trim().toLowerCase(),
      site_name: form.siteName.trim() || null,
      notes: form.notes.trim() || null,
      created_by: user.id,
    }).select("id,code,plan").maybeSingle();
    if (error) return toast.error(error.message);
    toast.success(`Licencia creada para ${form.email}`);
    if (inserted) await logAudit("created", inserted as License, "", { assigned_email: form.email, is_lifetime: form.isLifetime });
    setOpen(false);
    setForm({ email: "", planSlug: "pro", days: 365, isLifetime: false, siteName: "", notes: "" });
    load();
  }

  async function doRevoke(lic: License, reason: string) {
    const { error } = await supabase.from("license_codes")
      .update({ revoked_at: new Date().toISOString() }).eq("id", lic.id);
    if (error) return toast.error(error.message);
    await logAudit("revoked", lic, reason);
    toast.success("Licencia revocada");
    load();
  }

  async function doDelete(lic: License, reason: string) {
    // Audit FIRST so the record survives even if the row is gone.
    await logAudit("deleted", lic, reason, {
      assigned_email: lic.assigned_email,
      redeemed_at: lic.redeemed_at,
      revoked_at: lic.revoked_at,
    });
    const { error } = await supabase.from("license_codes").delete().eq("id", lic.id);
    if (error) return toast.error(error.message);
    toast.success("Licencia eliminada");
    load();
  }

  function statusOf(r: License): { label: string; cls: string; key: typeof filter } {
    if (r.revoked_at) return { label: "Revocada", cls: "text-destructive", key: "revoked" };
    if (r.redeemed_at) return { label: "Canjeada", cls: "text-muted-foreground", key: "redeemed" };
    return { label: "Pendiente", cls: "text-success", key: "pending" };
  }

  const filtered = rows.filter((r) => {
    if (filter !== "all" && statusOf(r).key !== filter) return false;
    if (search && !r.assigned_email?.toLowerCase().includes(search.toLowerCase()) &&
        !r.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por email o código…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64"
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="redeemed">Canjeadas</SelectItem>
              <SelectItem value="revoked">Revocadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nueva licencia</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generar licencia para un usuario</DialogTitle></DialogHeader>
            <form onSubmit={generate} className="space-y-4">
              <div className="space-y-2">
                <Label>Email del cliente</Label>
                <Input type="email" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="cliente@ejemplo.com" />
                <p className="text-xs text-muted-foreground">
                  La licencia queda reservada para este email. Si ya tiene cuenta, se vincula al instante;
                  si no, se vinculará automáticamente cuando se registre.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.planSlug} onValueChange={pickPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name} {p.is_lifetime ? "(de por vida)" : `(${p.duration_days}d)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!form.isLifetime && (
                <div className="space-y-2">
                  <Label>Duración (días)</Label>
                  <Input type="number" min={1} value={form.days}
                    onChange={(e) => setForm({ ...form, days: parseInt(e.target.value) || 365 })} />
                </div>
              )}
              {form.isLifetime && (
                <div className="rounded-md border border-success/40 bg-success/10 p-3 text-xs text-success">
                  Licencia <strong>de por vida</strong> — sin fecha de expiración.
                </div>
              )}
              <div className="space-y-2">
                <Label>Nombre del sitio (opcional)</Label>
                <Input value={form.siteName}
                  onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                  placeholder="Casa Brian" />
              </div>
              <div className="space-y-2">
                <Label>Notas internas</Label>
                <Input value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter><Button type="submit">Generar código</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Email asignado</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Duración</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Vínculo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const st = statusOf(r);
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-3">
                    <div>{r.assigned_email ?? "—"}</div>
                    {r.site_name && <div className="text-xs text-muted-foreground">{r.site_name}</div>}
                  </td>
                  <td className="px-4 py-3">{r.plan}</td>
                  <td className="px-4 py-3">
                    {(r as License & { is_lifetime?: boolean }).is_lifetime
                      ? <span className="text-success">De por vida</span>
                      : `${r.duration_days ?? 0} días`}
                  </td>
                  <td className={`px-4 py-3 font-medium ${st.cls}`}>{st.label}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.assigned_user_id
                      ? <span className="text-success">✓ Cuenta vinculada</span>
                      : <span>Esperando registro</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Copiar código"
                        onClick={() => { navigator.clipboard.writeText(r.code); toast.success("Copiado"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {!r.redeemed_at && !r.revoked_at && (
                        <Button size="sm" variant="ghost" title="Revocar"
                          onClick={() => setConfirmRev(r)}>
                          <ShieldOff className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Eliminar licencia"
                        onClick={() => setConfirmDel(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">Sin licencias.</p>
        )}
      </div>

      <ConfirmDestructiveDialog
        open={!!confirmRev}
        onOpenChange={(o) => !o && setConfirmRev(null)}
        title="Revocar licencia"
        description={`Esta acción inhabilita el código ${confirmRev?.code ?? ""} de forma inmediata. Queda registrada en auditoría.`}
        expectedText="REVOCAR"
        confirmLabel="Revocar licencia"
        destructive={false}
        requireReason
        onConfirm={async (reason) => { if (confirmRev) await doRevoke(confirmRev, reason); }}
      />

      <ConfirmDestructiveDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="Eliminar licencia permanentemente"
        description="Vas a eliminar definitivamente la licencia. El historial de auditoría se conserva. Para confirmar, escribe el código completo."
        expectedText={confirmDel?.code ?? ""}
        expectedLabel={`el código (${confirmDel?.code ?? ""})`}
        confirmLabel="Eliminar definitivamente"
        destructive
        requireReason
        onConfirm={async (reason) => { if (confirmDel) await doDelete(confirmDel, reason); }}
      />
    </>
  );
}

function generateCode() {
  const seg = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

