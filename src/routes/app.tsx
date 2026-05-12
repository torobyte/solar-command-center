import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Plus, CpuIcon, Activity, Sparkles, KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton, PageHeaderSkeleton } from "@/components/LoadingStates";

export const Route = createFileRoute("/app")({
  component: () => <ProtectedLayout><SitesIndex /></ProtectedLayout>,
});

interface Site {
  id: string; name: string; description: string | null;
  inverter_model: string | null; status: string; plan: string;
  last_seen_at: string | null; license_expires_at: string | null;
}

interface MyLicense {
  id: string; code: string; plan: string; duration_days: number;
  assigned_email: string | null; site_name: string | null;
  redeemed_at: string | null; revoked_at: string | null;
}

function SitesIndex() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [licenses, setLicenses] = useState<MyLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: s, error }, { data: lic }] = await Promise.all([
      supabase.from("sites").select("*").order("created_at", { ascending: false }),
      supabase.from("license_codes")
        .select("id,code,plan,duration_days,assigned_email,site_name,redeemed_at,revoked_at")
        .order("created_at", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    setSites((s ?? []) as Site[]);
    setLicenses((lic ?? []) as MyLicense[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createSite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("sites").insert({
      owner_id: user.id, name, description: description || null,
    });
    if (error) return toast.error(error.message);
    toast.success(t("sites.created"));
    setOpen(false); setName(""); setDescription("");
    load();
  }

  if (loading) {
    return (
      <>
        <PageHeaderSkeleton />
        <TableSkeleton rows={4} cols={5} />
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("sites.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("sites.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-glow"><Plus className="mr-1.5 h-4 w-4" strokeWidth={2.4} />{t("sites.new")}</Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>{t("sites.newDialog.title")}</DialogTitle>
              <DialogDescription>{t("sites.newDialog.desc")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createSite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("common.name")}</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("sites.namePh")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">{t("common.description")}</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">{t("common.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(() => {
        const pending = licenses.filter((l) => !l.redeemed_at && !l.revoked_at);
        if (pending.length === 0) return null;
        return (
          <div className="mb-6 overflow-hidden rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-transparent p-5 animate-fade-up">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
                <Sparkles className="h-4 w-4" strokeWidth={2.4} />
              </div>
              <h3 className="font-semibold">Tienes {pending.length} licencia{pending.length > 1 ? "s" : ""} lista{pending.length > 1 ? "s" : ""} para activar</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Instala el agente en tu Raspberry Pi y, en su pantalla local, ingresa uno de estos códigos:
            </p>
            <div className="space-y-2">
              {pending.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border bg-background/80 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <KeyRound className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.2} />
                    <div className="min-w-0">
                      <div className="font-mono text-sm truncate">{l.code}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.plan} · {l.duration_days} días{l.site_name ? ` · ${l.site_name}` : ""}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full"
                    onClick={() => { navigator.clipboard.writeText(l.code); toast.success("Código copiado"); }}>
                    <Copy className="mr-1 h-3.5 w-3.5" strokeWidth={2.2} /> Copiar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center animate-fade-up">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 text-accent">
            <CpuIcon className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <h3 className="mt-4 font-semibold">{t("sites.empty.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("sites.empty.body")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">{t("sites.col.name")}</th>
                <th className="px-4 py-3 font-medium">{t("sites.col.inverter")}</th>
                <th className="px-4 py-3 font-medium">{t("sites.col.plan")}</th>
                <th className="px-4 py-3 font-medium">{t("sites.col.status")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const statusKey = s.status === "online" ? "sync.online" : s.status === "offline" ? "sync.offline" : `sync.${s.status}`;
                const statusLabel = s.status === "online" || s.status === "offline" || s.status === "stale" || s.status === "never" ? t(statusKey) : s.status;
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.name}</div>
                      {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.inverter_model ?? "—"}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{s.plan}</Badge></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                        s.status === "online" ? "bg-success/15 text-success" :
                        s.status === "offline" ? "bg-destructive/15 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        <Activity className="h-3 w-3" /> {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/sites/$siteId" params={{ siteId: s.id }}>
                        <Button variant="outline" size="sm">{t("sites.view")}</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
