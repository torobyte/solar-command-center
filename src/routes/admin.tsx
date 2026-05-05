import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

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
          <TabsTrigger value="sites">All sites</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
        </TabsList>
        <TabsContent value="sites" className="mt-6"><AllSites /></TabsContent>
        <TabsContent value="users" className="mt-6"><AllUsers /></TabsContent>
        <TabsContent value="licenses" className="mt-6"><Licenses /></TabsContent>
      </Tabs>
    </>
  );
}

function AllSites() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    supabase.from("sites").select("*, profiles!sites_owner_id_fkey(email,full_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) toast.error(error.message); setRows(data ?? []); });
  }, []);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Site</th>
            <th className="px-4 py-3 font-medium">Owner</th>
            <th className="px-4 py-3 font-medium">Inverter</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const profile = r.profiles as { email?: string; full_name?: string } | null;
            return (
              <tr key={r.id as string} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{r.name as string}</td>
                <td className="px-4 py-3 text-muted-foreground">{profile?.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{(r.inverter_model as string) ?? "—"}</td>
                <td className="px-4 py-3">{r.plan as string}</td>
                <td className="px-4 py-3">{r.status as string}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No sites yet.</p>}
    </div>
  );
}

function AllUsers() {
  const [rows, setRows] = useState<Array<{ id: string; email: string; full_name: string | null }>>([]);
  useEffect(() => {
    supabase.from("profiles").select("id,email,full_name").order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) toast.error(error.message); setRows(data ?? []); });
  }, []);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left">
          <tr><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Name</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="px-4 py-3">{r.email}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.full_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
