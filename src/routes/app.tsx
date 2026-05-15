import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { claimPairingCode } from "@/lib/pairing.functions";
import { Plus, Cpu as CpuIcon, Sparkles, KeyRound, Copy } from "lucide-react";
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
  const [code, setCode] = useState("");
  const [siteName, setSiteName] = useState("");
  const [busy, setBusy] = useState(false);
  const claim = useServerFn(claimPairingCode);

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

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
      toast.error("El código debe tener 6 letras o números");
      return;
    }
    setBusy(true);
    try {
      await claim({ data: { code: cleanCode, site_name: siteName.trim() || undefined } });
      toast.success(t("sites.created"));
      setOpen(false); setCode(""); setSiteName("");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
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
        <div className="flex gap-2">
          {sites.length > 1 && (
            <Link to="/sites/overview">
              <Button variant="outline" className="rounded-full"><CpuIcon className="mr-1.5 h-4 w-4" strokeWidth={2.4} />Vista global</Button>
            </Link>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-glow"><Plus className="mr-1.5 h-4 w-4" strokeWidth={2.4} />{t("sites.new")}</Button>
            </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Vincular un dispositivo</DialogTitle>
              <DialogDescription>
                Introduce el código de 6 caracteres que aparece en la pantalla de tu Raspberry / Orange Pi.
                Si aún no tienes uno, instala el agente con <code className="font-mono text-xs">install.sh</code> y enciéndelo.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={addSite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pair-code">Código de vinculación</Label>
                <Input
                  id="pair-code"
                  required
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  placeholder="A1B2C3"
                  className="text-center font-mono text-2xl tracking-[0.5em] uppercase"
                  maxLength={6}
                />
                <p className="text-[11px] text-muted-foreground">
                  El código aparece en la pantalla local del equipo (o en <code className="font-mono">/local</code>).
                  Caduca a los 30 minutos — genera otro si expira.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-name">Nombre del sitio (opcional)</Label>
                <Input
                  id="site-name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="Ej. Casa Chillán, Bodega norte…"
                />
                <p className="text-[11px] text-muted-foreground">
                  Podrás cambiarlo en cualquier momento desde el detalle del sitio.
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full" disabled={busy}>
                  {busy ? "Vinculando…" : "Vincular"}
                </Button>
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
              <h3 className="font-semibold">Tienes {pending.length} licencia{pending.length > 1 ? "s" : ""} pendiente{pending.length > 1 ? "s" : ""}</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Estos códigos de licencia se aplican automáticamente cuando vinculas un dispositivo a tu cuenta.
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
          <p className="mt-3 text-xs text-muted-foreground">
            Enciende tu Raspberry, abre <code className="font-mono">/local</code> y verás un código de 6 caracteres para vincularlo aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden animate-fade-up">
            {sites.map((s) => {
              const statusKey = s.status === "online" ? "sync.online" : s.status === "offline" ? "sync.offline" : `sync.${s.status}`;
              const statusLabel = s.status === "online" || s.status === "offline" || s.status === "stale" || s.status === "never" ? t(statusKey) : s.status;
              const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).toLocaleDateString() : "—";
              return (
                <Link key={s.id} to="/sites/$siteId" params={{ siteId: s.id }}
                  className="block rounded-2xl border bg-card p-4 shadow-sm transition-all active:scale-[.99] hover:border-accent/40">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold tracking-tight uppercase truncate">{s.name}</h3>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{lastSeen}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="rounded-full bg-accent/10 text-accent border-accent/20 px-2.5 py-0.5 text-[11px]">
                      {s.plan}
                    </Badge>
                    {s.inverter_model && (
                      <Badge variant="outline" className="rounded-full bg-success/10 text-success border-success/20 px-2.5 py-0.5 text-[11px] gap-1">
                        <CpuIcon className="h-3 w-3" strokeWidth={2.4} /> {s.inverter_model}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      s.status === "online" ? "bg-success/15 text-success" :
                      s.status === "offline" ? "bg-destructive/15 text-destructive" :
                      "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}>
                      <span className="relative flex h-1.5 w-1.5">
                        {s.status === "online" && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
                        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.status === "online" ? "bg-success" : s.status === "offline" ? "bg-destructive" : "bg-amber-500"}`} />
                      </span>
                      {statusLabel}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs text-accent">
                      {t("sites.view")} →
                    </Button>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border bg-card shadow-card animate-fade-up">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                      <tr key={s.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.name}</div>
                          {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.inverter_model ?? "—"}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="rounded-full">{s.plan}</Badge></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            s.status === "online" ? "bg-success/15 text-success" :
                            s.status === "offline" ? "bg-destructive/15 text-destructive" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            <span className={`relative flex h-1.5 w-1.5`}>
                              {s.status === "online" && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
                              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.status === "online" ? "bg-success" : s.status === "offline" ? "bg-destructive" : "bg-muted-foreground"}`} />
                            </span>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to="/sites/$siteId" params={{ siteId: s.id }}>
                            <Button variant="outline" size="sm" className="rounded-full">{t("sites.view")}</Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
