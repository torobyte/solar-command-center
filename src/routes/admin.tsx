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
import { Plus, Copy, RefreshCw, Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  adminCreateUser, adminSetUserRole, adminDeleteUser,
  adminCreateSite, adminAssignSite, adminDeleteSite, adminRequestRefresh,
} from "@/lib/admin.functions";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin")({
  component: () => <ProtectedLayout requireRole="superadmin"><AdminPanel /></ProtectedLayout>,
});

function AdminPanel() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Superadmin</h1>
        <p className="text-sm text-muted-foreground">Manage all users, sites, and licenses.</p>
      </div>
      <Tabs defaultValue="sites">
        <TabsList>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
        </TabsList>
        <TabsContent value="sites" className="mt-6"><SitesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersAdmin /></TabsContent>
        <TabsContent value="licenses" className="mt-6"><Licenses /></TabsContent>
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

/* ----------------------------- Sites Admin ----------------------------- */

interface SiteRow {
  id: string; name: string; status: string; plan: string;
  inverter_model: string | null; owner_id: string;
  last_seen_at: string | null; force_refresh_at: string | null;
  device_token: string;
  profiles: { email?: string; full_name?: string | null } | null;
}

function syncStatus(lastSeen: string | null) {
  if (!lastSeen) return { label: "never", color: "text-muted-foreground" };
  const ageMs = Date.now() - new Date(lastSeen).getTime();
  if (ageMs < 2 * 60_000) return { label: "online", color: "text-success" };
  if (ageMs < 60 * 60_000) return { label: "stale", color: "text-warning" };
  return { label: "offline", color: "text-destructive" };
}

function SitesAdmin() {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const { users } = useUsers();
  const createSite = useServerFn(adminCreateSite);
  const assignSite = useServerFn(adminAssignSite);
  const deleteSite = useServerFn(adminDeleteSite);
  const requestRefresh = useServerFn(adminRequestRefresh);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", inverter_model: "", owner_id: "" });

  async function load() {
    const { data, error } = await supabase
      .from("sites")
      .select("id,name,status,plan,inverter_model,owner_id,last_seen_at,force_refresh_at,device_token")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []).map((r) => ({ ...r, profiles: null })) as unknown as SiteRow[]);
  }
  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.owner_id) return toast.error("Select an owner");
    try {
      await createSite({ data: { ...form, description: form.description || null, inverter_model: form.inverter_model || null } });
      toast.success("Site created");
      setOpen(false); setForm({ name: "", description: "", inverter_model: "", owner_id: "" });
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New site</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Register a site / device</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick a user" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Inverter model</Label>
                <Input value={form.inverter_model} onChange={(e) => setForm({ ...form, inverter_model: e.target.value })} placeholder="e.g. Axpert MKS 5K" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <DialogFooter><Button type="submit">Create</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Sync</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Plan</th>
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
                      try { await assignSite({ data: { site_id: r.id, owner_id: v } }); toast.success("Reassigned"); load(); }
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
                    {r.last_seen_at ? formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true }) : "—"}
                    {r.force_refresh_at && (
                      <div className="text-xs text-warning">refresh requested</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.plan}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Copy device token"
                        onClick={() => { navigator.clipboard.writeText(r.device_token); toast.success("Token copied"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Force telemetry refresh"
                        onClick={async () => {
                          try { await requestRefresh({ data: { site_id: r.id } }); toast.success("Refresh requested"); load(); }
                          catch (e) { toast.error((e as Error).message); }
                        }}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Delete site"
                        onClick={async () => {
                          if (!confirm(`Delete site "${r.name}"?`)) return;
                          try { await deleteSite({ data: { site_id: r.id } }); toast.success("Deleted"); load(); }
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
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No sites yet.</p>}
      </div>
    </>
  );
}

/* ----------------------------- Users Admin ----------------------------- */

function UsersAdmin() {
  const { users, reload } = useUsers();
  const createUser = useServerFn(adminCreateUser);
  const setRole = useServerFn(adminSetUserRole);
  const delUser = useServerFn(adminDeleteUser);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "user" as "user" | "superadmin" });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createUser({ data: form });
      toast.success("User created");
      setOpen(false); setForm({ email: "", password: "", full_name: "", role: "user" });
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a user</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-2"><Label>Email</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Password</Label>
                <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="space-y-2"><Label>Full name</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "user" | "superadmin" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="superadmin">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="submit">Create</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.full_name ?? "—"}</td>
                <td className="px-4 py-3">{u.isSuperadmin ? "Superadmin" : "User"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost"
                      title={u.isSuperadmin ? "Demote to user" : "Promote to superadmin"}
                      onClick={async () => {
                        try {
                          await setRole({ data: { user_id: u.id, role: u.isSuperadmin ? "user" : "superadmin" } });
                          toast.success("Role updated");
                          reload();
                        } catch (e) { toast.error((e as Error).message); }
                      }}>
                      {u.isSuperadmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" title="Delete user"
                      onClick={async () => {
                        if (!confirm(`Delete user ${u.email}? This removes their sites too.`)) return;
                        try { await delUser({ data: { user_id: u.id } }); toast.success("Deleted"); reload(); }
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
        {users.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No users yet.</p>}
      </div>
    </>
  );
}

/* ----------------------------- Licenses (existing) ----------------------------- */

interface License { id: string; code: string; plan: string; duration_days: number; redeemed_at: string | null; notes: string | null; }

function Licenses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<License[]>([]);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("pro");
  const [days, setDays] = useState(365);
  const [notes, setNotes] = useState("");

  async function load() {
    const { data, error } = await supabase.from("license_codes").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as License[]);
  }
  useEffect(() => { load(); }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const code = generateCode();
    const { error } = await supabase.from("license_codes").insert({
      code, plan, duration_days: days, notes: notes || null, created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("License generated");
    setOpen(false); setNotes("");
    load();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Generate license</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generate a license code</DialogTitle></DialogHeader>
            <form onSubmit={generate} className="space-y-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (days)</Label>
                <Input type="number" min={1} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 365)} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Customer name" />
              </div>
              <DialogFooter><Button type="submit">Generate</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3">{r.plan}</td>
                <td className="px-4 py-3">{r.duration_days} days</td>
                <td className="px-4 py-3">
                  {r.redeemed_at
                    ? <span className="text-muted-foreground">Redeemed</span>
                    : <span className="text-success">Available</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.notes ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(r.code); toast.success("Copied"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No licenses yet.</p>}
      </div>
    </>
  );
}

function generateCode() {
  const seg = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}
