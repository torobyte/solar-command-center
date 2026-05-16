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
  adminExtendLicense, adminSetExpiration, adminReactivateSite,
} from "@/lib/admin.functions";
import { formatDistanceToNow } from "date-fns";
import { BrandingAdmin } from "@/components/admin/BrandingAdmin";
import { PlansAdmin } from "@/components/admin/PlansAdmin";
import { LicenseAuditLog } from "@/components/admin/LicenseAuditLog";
import { SmtpAdmin } from "@/components/admin/SmtpAdmin";
import { EmailTemplatesAdmin } from "@/components/admin/EmailTemplatesAdmin";
import { ApkAdmin } from "@/components/admin/ApkAdmin";
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
            <TabsTrigger value="devices">Dispositivos</TabsTrigger>
            <TabsTrigger value="users">{t("admin.tab.users")}</TabsTrigger>
            <TabsTrigger value="licenses">{t("admin.tab.licenses")}</TabsTrigger>
            <TabsTrigger value="audit">Auditoría</TabsTrigger>
            <TabsTrigger value="plans">Planes</TabsTrigger>
            <TabsTrigger value="branding">Branding & PWA</TabsTrigger>
            <TabsTrigger value="smtp">SMTP</TabsTrigger>
            <TabsTrigger value="email-templates">Plantillas correo</TabsTrigger>
            <TabsTrigger value="apk">App APK</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sites" className="mt-6"><SitesAdmin /></TabsContent>
        <TabsContent value="devices" className="mt-6"><DevicesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersAdmin /></TabsContent>
        <TabsContent value="licenses" className="mt-6"><Licenses /></TabsContent>
        <TabsContent value="audit" className="mt-6"><LicenseAuditLog /></TabsContent>
        <TabsContent value="plans" className="mt-6"><PlansAdmin /></TabsContent>
        <TabsContent value="branding" className="mt-6"><BrandingAdmin /></TabsContent>
        <TabsContent value="smtp" className="mt-6"><SmtpAdmin /></TabsContent>
        <TabsContent value="email-templates" className="mt-6"><EmailTemplatesAdmin /></TabsContent>
        <TabsContent value="apk" className="mt-6"><ApkAdmin /></TabsContent>
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

// ─────────────────────────────────────────────────────────────────────────────
// Dispositivos: vista por hardware_id con activación, extensión, expiración
// personalizada, reactivación y auditoría por dispositivo.
// ─────────────────────────────────────────────────────────────────────────────
interface DeviceRow {
  site_id: string;
  hardware_id: string;
  name: string;
  owner_email: string | null;
  inverter_model: string | null;
  plan: string;
  license_expires_at: string | null;
  last_seen_at: string | null;
  status: string;
  device_token: string;
  board_model: string | null;
  agent_version: string | null;
  ip_wlan: string | null;
  ip_eth: string | null;
}
interface AuditRow {
  id: string; action: string; reason: string | null;
  performed_by_email: string | null; created_at: string;
  details: Record<string, unknown> | null;
}

function DevicesAdmin() {
  const licenseInfo = useLicenseInfo();
  const syncStatus = useSyncStatus();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "expired" | "active">("all");
  const [activateRow, setActivateRow] = useState<DeviceRow | null>(null);
  const [extendRow, setExtendRow] = useState<DeviceRow | null>(null);
  const [expRow, setExpRow] = useState<DeviceRow | null>(null);
  const [reactRow, setReactRow] = useState<DeviceRow | null>(null);
  const [auditRow, setAuditRow] = useState<DeviceRow | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditRow[]>([]);
  const [code, setCode] = useState("");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [expDate, setExpDate] = useState("");

  const activateFn = useServerFn(adminActivateSite);
  const extendFn = useServerFn(adminExtendLicense);
  const setExpFn = useServerFn(adminSetExpiration);
  const reactFn = useServerFn(adminReactivateSite);
  const revokeFn = useServerFn(adminRevokeLicense);

  async function runAdminAction<TData, TResult>(
    action: (opts: { data: TData; headers?: HeadersInit }) => Promise<TResult>,
    data: TData,
  ) {
    const headers = await getAuthHeaders();
    return action({ data, headers });
  }

  async function load() {
    const { data: sites, error } = await supabase
      .from("sites")
      .select("id,name,status,plan,inverter_model,owner_id,last_seen_at,device_token,license_expires_at,hardware_id")
      .not("hardware_id", "is", null)
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    if (error) { toast.error(error.message); return; }
    const ids = (sites ?? []).map((s) => s.id);
    const ownerIds = Array.from(new Set((sites ?? []).map((s) => s.owner_id).filter(Boolean)));
    const [{ data: snaps }, { data: profs }] = await Promise.all([
      ids.length
        ? supabase.from("device_snapshots").select("site_id,board_model,agent_version,ip_wlan,ip_eth").in("site_id", ids)
        : Promise.resolve({ data: [] as Array<{ site_id: string; board_model: string | null; agent_version: string | null; ip_wlan: string | null; ip_eth: string | null }> }),
      ownerIds.length
        ? supabase.from("profiles").select("id,email").in("id", ownerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; email: string }> }),
    ]);
    const snapMap = new Map((snaps ?? []).map((s) => [s.site_id, s]));
    const profMap = new Map((profs ?? []).map((p) => [p.id, p.email]));
    setRows(
      (sites ?? []).map((s): DeviceRow => {
        const sn = snapMap.get(s.id);
        return {
          site_id: s.id,
          hardware_id: s.hardware_id ?? "",
          name: s.name,
          owner_email: profMap.get(s.owner_id) ?? null,
          inverter_model: s.inverter_model,
          plan: s.plan,
          license_expires_at: s.license_expires_at,
          last_seen_at: s.last_seen_at,
          status: s.status,
          device_token: s.device_token,
          board_model: sn?.board_model ?? null,
          agent_version: sn?.agent_version ?? null,
          ip_wlan: sn?.ip_wlan ?? null,
          ip_eth: sn?.ip_eth ?? null,
        };
      }),
    );
  }
  useEffect(() => { load(); }, []);

  async function loadAudit(row: DeviceRow) {
    const { data } = await supabase
      .from("license_audit_log")
      .select("id,action,reason,performed_by_email,created_at,details")
      .order("created_at", { ascending: false })
      .limit(200);
    setAuditEvents(((data ?? []) as AuditRow[]).filter((e) => {
      const d = e.details as Record<string, unknown> | null;
      return d?.site_id === row.site_id;
    }));
  }

  const filtered = rows.filter((r) => {
    const isExpired = r.license_expires_at && new Date(r.license_expires_at).getTime() < Date.now();
    const ageMs = r.last_seen_at ? Date.now() - new Date(r.last_seen_at).getTime() : Infinity;
    if (filter === "online" && ageMs >= 2 * 60_000) return false;
    if (filter === "offline" && ageMs < 2 * 60_000) return false;
    if (filter === "expired" && !isExpired) return false;
    if (filter === "active" && (isExpired || !r.license_expires_at)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.hardware_id.toLowerCase().includes(q) &&
        !r.name.toLowerCase().includes(q) &&
        !(r.owner_email ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por hardware_id, nombre o email…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-72"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="online">En línea</SelectItem>
            <SelectItem value="offline">Desconectados</SelectItem>
            <SelectItem value="active">Licencia vigente</SelectItem>
            <SelectItem value="expired">Expirados</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Recargar
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} dispositivo(s)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-3 font-medium">Hardware ID</th>
              <th className="px-3 py-3 font-medium">Dispositivo</th>
              <th className="px-3 py-3 font-medium">Propietario</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3 font-medium">Plan / Expira</th>
              <th className="px-3 py-3 font-medium">Última conexión</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const s = syncStatus(r.last_seen_at);
              const li = licenseInfo(r.plan, r.license_expires_at);
              const isExpired = r.license_expires_at && new Date(r.license_expires_at).getTime() < Date.now();
              return (
                <tr key={r.site_id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-mono text-xs">{r.hardware_id.slice(0, 16)}…</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.board_model ?? "—"} {r.agent_version ? `· v${r.agent_version}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.inverter_model ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-xs">{r.owner_email ?? "—"}</td>
                  <td className={`px-3 py-3 font-medium ${s.color}`}>
                    {s.label}
                    {(r.ip_wlan || r.ip_eth) && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {r.ip_eth ?? r.ip_wlan}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className={`font-medium ${li.color}`}>{li.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.license_expires_at
                        ? new Date(r.license_expires_at).toLocaleDateString()
                        : li.sub}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {r.last_seen_at ? formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Activar con código"
                        onClick={() => { setCode(""); setReason(""); setActivateRow(r); }}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Extender N días"
                        onClick={() => { setDays(30); setReason(""); setExtendRow(r); }}>
                        +30d
                      </Button>
                      <Button size="sm" variant="ghost" title="Fijar fecha de expiración"
                        onClick={() => {
                          setExpDate(r.license_expires_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
                          setReason(""); setExpRow(r);
                        }}>
                        📅
                      </Button>
                      {isExpired && (
                        <Button size="sm" variant="ghost" title="Reactivar"
                          onClick={() => { setDays(30); setReason(""); setReactRow(r); }}>
                          <ShieldCheck className="h-3.5 w-3.5 text-success" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Copiar hardware_id"
                        onClick={() => { navigator.clipboard.writeText(r.hardware_id); toast.success("Copiado"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Auditoría del dispositivo"
                        onClick={async () => { await loadAudit(r); setAuditRow(r); }}>
                        🕓
                      </Button>
                      {r.license_expires_at && !isExpired && (
                        <Button size="sm" variant="ghost" title="Revocar"
                          onClick={async () => {
                            if (!confirm(`¿Revocar licencia de ${r.name}?`)) return;
                            try {
                              await runAdminAction(revokeFn, { site_id: r.site_id });
                              toast.success("Licencia revocada"); load();
                            } catch (e) { toast.error((e as Error).message); }
                          }}>
                          <ShieldOff className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Sin dispositivos registrados. Cuando un Raspberry/Orange Pi corra el instalador, aparecerá aquí automáticamente.
          </p>
        )}
      </div>

      {/* Activar */}
      <Dialog open={!!activateRow} onOpenChange={(o) => !o && setActivateRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Activar licencia · {activateRow?.name}</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!activateRow) return;
            try {
              const res = await runAdminAction(activateFn, { site_id: activateRow.site_id, code: code.trim() });
              toast.success(`Activado: ${res.plan} hasta ${new Date(res.expires_at).toLocaleDateString()}`);
              setActivateRow(null); load();
            } catch (e) { toast.error((e as Error).message); }
          }} className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div>Hardware: <span className="font-mono">{activateRow?.hardware_id}</span></div>
              <div>Plan actual: <strong>{activateRow?.plan}</strong></div>
              <div>Expira: {activateRow?.license_expires_at ? new Date(activateRow.license_expires_at).toLocaleString() : "—"}</div>
            </div>
            <div className="space-y-2">
              <Label>Código de licencia</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required />
            </div>
            <DialogFooter><Button type="submit">Activar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Extender */}
      <Dialog open={!!extendRow} onOpenChange={(o) => !o && setExtendRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extender licencia · {extendRow?.name}</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!extendRow) return;
            try {
              const res = await runAdminAction(extendFn, { site_id: extendRow.site_id, days, reason });
              toast.success(`Extendido hasta ${new Date(res.expires_at).toLocaleDateString()}`);
              setExtendRow(null); load();
            } catch (e) { toast.error((e as Error).message); }
          }} className="space-y-4">
            <div className="space-y-2"><Label>Días a sumar</Label>
              <Input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 30)} required />
            </div>
            <div className="space-y-2"><Label>Motivo (auditoría)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="p.ej. cortesía soporte" />
            </div>
            <DialogFooter><Button type="submit">Extender</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fijar fecha */}
      <Dialog open={!!expRow} onOpenChange={(o) => !o && setExpRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fijar expiración · {expRow?.name}</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!expRow) return;
            try {
              const iso = new Date(expDate + "T23:59:59Z").toISOString();
              await runAdminAction(setExpFn, { site_id: expRow.site_id, expires_at: iso, reason });
              toast.success("Expiración actualizada");
              setExpRow(null); load();
            } catch (e) { toast.error((e as Error).message); }
          }} className="space-y-4">
            <div className="space-y-2"><Label>Nueva fecha de expiración</Label>
              <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required />
            </div>
            <div className="space-y-2"><Label>Motivo (auditoría)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <DialogFooter><Button type="submit">Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reactivar */}
      <Dialog open={!!reactRow} onOpenChange={(o) => !o && setReactRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reactivar · {reactRow?.name}</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!reactRow) return;
            try {
              const res = await runAdminAction(reactFn, { site_id: reactRow.site_id, days, plan: "pro", reason });
              toast.success(`Reactivado · ${res.plan} hasta ${new Date(res.expires_at).toLocaleDateString()}`);
              setReactRow(null); load();
            } catch (e) { toast.error((e as Error).message); }
          }} className="space-y-4">
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              Este dispositivo tiene la licencia expirada. Se reactivará desde hoy con plan <strong>pro</strong>.
            </div>
            <div className="space-y-2"><Label>Duración (días)</Label>
              <Input type="number" min={1} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 30)} required />
            </div>
            <div className="space-y-2"><Label>Motivo (auditoría)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <DialogFooter><Button type="submit">Reactivar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Auditoría por dispositivo */}
      <Dialog open={!!auditRow} onOpenChange={(o) => !o && setAuditRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Auditoría · {auditRow?.name}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Cuándo</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Por</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-medium">{e.action}</td>
                    <td className="px-3 py-2">{e.performed_by_email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                  </tr>
                ))}
                {auditEvents.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sin eventos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
