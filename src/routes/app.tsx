import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { getSiteOwners } from "@/lib/sharing.functions";
import { Plus, Cpu as CpuIcon, Sparkles, KeyRound, Copy, Share2, Home, Sun as SunIcon, BatteryFull, EyeOff, ShieldCheck, Zap, Cloud, Lock as LockIcon, Search, SlidersHorizontal, Eye, MoreVertical, ChevronLeft, ChevronRight, Globe2 } from "lucide-react";
import { SiteSharing } from "@/components/SiteSharing";
import { toast } from "sonner";
import { TableSkeleton, PageHeaderSkeleton } from "@/components/LoadingStates";

export const Route = createFileRoute("/app")({
  component: () => <ProtectedLayout><SitesIndex /></ProtectedLayout>,
});

interface Site {
  id: string; name: string; description: string | null;
  inverter_model: string | null; status: string; plan: string;
  last_seen_at: string | null; license_expires_at: string | null;
  owner_id: string;
  owner_email?: string | null;
  owner_name?: string | null;
  inverter_driver?: string | null;
  inverter_spec_model?: string | null;
}

interface MyLicense {
  id: string; code: string; plan: string; duration_days: number;
  assigned_email: string | null; site_name: string | null;
  redeemed_at: string | null; revoked_at: string | null;
}

interface SiteMetrics {
  pv_w: number;
  kwh_today: number;
}

function SitesIndex() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [metrics, setMetrics] = useState<Record<string, SiteMetrics>>({});
  const [licenses, setLicenses] = useState<MyLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [siteName, setSiteName] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareSite, setShareSite] = useState<Site | null>(null);
  const claim = useServerFn(claimPairingCode);
  const fetchOwners = useServerFn(getSiteOwners);

  // Filters
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fInverter, setFInverter] = useState<string>("all");
  const [fPlan, setFPlan] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    setLoading(true);
    const [{ data: s, error }, { data: lic }] = await Promise.all([
      supabase.from("sites").select("*").order("created_at", { ascending: false }),
      supabase.from("license_codes")
        .select("id,code,plan,duration_days,assigned_email,site_name,redeemed_at,revoked_at")
        .order("created_at", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    const list = (s ?? []) as Site[];
    const myId = user?.id;
    const siteIds = list.map(x => x.id);

    // Fetch inverter specs for driver/model fallback (RLS allows viewers)
    if (siteIds.length > 0) {
      const { data: specs } = await supabase
        .from("inverter_specs")
        .select("site_id,driver,model_name")
        .in("site_id", siteIds);
      const specById = new Map((specs ?? []).map(sp => [sp.site_id, sp]));
      list.forEach(x => {
        const sp = specById.get(x.id);
        x.inverter_driver = sp?.driver ?? null;
        x.inverter_spec_model = sp?.model_name ?? null;
      });
    }

    // Fetch owner names for shared sites via server fn (admin client)
    const sharedIds = list.filter(x => x.owner_id !== myId).map(x => x.id);
    if (sharedIds.length > 0) {
      try {
        const res = await fetchOwners({ data: { site_ids: sharedIds } });
        const bySite = new Map(res.owners.map(o => [o.site_id, o]));
        list.forEach(x => {
          const o = bySite.get(x.id);
          if (o) {
            x.owner_email = o.email;
            x.owner_name = o.full_name;
          }
        });
      } catch { /* ignore */ }
    }

    setSites(list);
    setLicenses((lic ?? []) as MyLicense[]);
    setLoading(false);

    // Fetch latest power + today's energy for each site (best-effort)
    if (siteIds.length > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dayStr = today.toISOString().slice(0, 10);
      const entries = await Promise.all(siteIds.map(async (id) => {
        const [{ data: latest }, { data: total }] = await Promise.all([
          supabase.from("telemetry_samples")
            .select("ac_output_active_power,pv_input_power")
            .eq("site_id", id).order("recorded_at", { ascending: false }).limit(1),
          supabase.from("daily_totals")
            .select("pv_kwh,load_kwh").eq("site_id", id).eq("day", dayStr).maybeSingle(),
        ]);
        const row = latest?.[0];
        const pv_w = Number(row?.pv_input_power ?? row?.ac_output_active_power ?? 0);
        const kwh_today = Number(total?.pv_kwh ?? total?.load_kwh ?? 0);
        return [id, { pv_w, kwh_today }] as const;
      }));
      setMetrics(Object.fromEntries(entries));
    }
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

  // Distinct inverters for filter dropdown
  const inverterOptions = useMemo(() => {
    const set = new Set<string>();
    sites.forEach(s => { const m = s.inverter_spec_model || s.inverter_model || s.inverter_driver; if (m) set.add(m); });
    return Array.from(set);
  }, [sites]);

  const planOptions = useMemo(() => {
    const set = new Set<string>();
    sites.forEach(s => { if (s.plan) set.add(s.plan); });
    return Array.from(set);
  }, [sites]);

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter(s => {
      if (q && !(s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q))) return false;
      if (fStatus !== "all" && s.status !== fStatus) return false;
      if (fInverter !== "all") {
        const m = s.inverter_spec_model || s.inverter_model || s.inverter_driver || "";
        if (m !== fInverter) return false;
      }
      if (fPlan !== "all" && s.plan !== fPlan) return false;
      return true;
    });
  }, [sites, search, fStatus, fInverter, fPlan]);

  const totalPages = Math.max(1, Math.ceil(filteredSites.length / pageSize));
  const pageItems = filteredSites.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  function clearFilters() { setSearch(""); setFStatus("all"); setFInverter("all"); setFPlan("all"); }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 animate-fade-up">
        <div className="flex items-start gap-3">
          <div className="mt-1.5 h-9 w-1 rounded-full bg-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("sites.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Dispositivos que monitorean tus inversores solares.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/sites/overview">
            <Button variant="outline" className="rounded-xl border-border bg-card shadow-sm hover:bg-muted/60"><Globe2 className="mr-1.5 h-4 w-4" strokeWidth={2.2} />Vista global</Button>
          </Link>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"><Plus className="mr-1.5 h-4 w-4" strokeWidth={2.4} />{t("sites.new")}</Button>
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
      </div>

      {(() => {
        const activos = sites.filter(s => s.status === "online" || s.status === "stale").length;
        const offline = sites.filter(s => s.status === "offline" || s.status === "never").length;
        const total = sites.length || 1;
        const pctActivos = Math.round((activos / total) * 100);
        const pctOffline = Math.round((offline / total) * 100);
        const stats = [
          { label: "Sitios activos", value: activos.toString(), hint: `${pctActivos}% del total`, icon: Home, tint: "bg-blue-50 text-blue-600", hintTint: "text-blue-600" },
          { label: "Potencia actual", value: "—", unit: "", hint: "Total generando", icon: SunIcon, tint: "bg-amber-50 text-amber-600", hintTint: "text-amber-600" },
          { label: "Energía hoy", value: "—", unit: "", hint: "Energía producida", icon: BatteryFull, tint: "bg-emerald-50 text-emerald-600", hintTint: "text-emerald-600" },
          { label: "Sitios offline", value: offline.toString(), hint: `${pctOffline}% del total`, icon: EyeOff, tint: "bg-rose-50 text-rose-600", hintTint: "text-rose-600" },
        ];
        return (
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 animate-fade-up">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight">{s.value}</p>
                    <p className={`mt-1 text-xs font-medium ${s.hintTint}`}>{s.hint}</p>
                  </div>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${s.tint}`}>
                    <s.icon className="h-6 w-6" strokeWidth={2.2} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

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
              const isShared = !!user && s.owner_id !== user.id;
              return (
                <div key={s.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <Link to="/sites/$siteId" params={{ siteId: s.id }} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold tracking-tight uppercase truncate">{s.name}</h3>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{lastSeen}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {isShared ? (
                        <Badge variant="outline" className="rounded-full bg-muted/40 text-muted-foreground border-border px-2.5 py-0.5 text-[11px]">
                          Compartido por {s.owner_name || s.owner_email || "otro usuario"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full bg-accent/10 text-accent border-accent/20 px-2.5 py-0.5 text-[11px]">
                          {s.plan}
                        </Badge>
                      )}
                      {(s.inverter_spec_model || s.inverter_model || s.inverter_driver) && (
                        <Badge variant="outline" className="rounded-full bg-success/10 text-success border-success/20 px-2.5 py-0.5 text-[11px] gap-1">
                          <CpuIcon className="h-3 w-3" strokeWidth={2.4} /> {s.inverter_spec_model || s.inverter_model || s.inverter_driver}
                        </Badge>
                      )}
                    </div>
                  </Link>
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
                    <div className="flex items-center gap-1">
                      {!isShared && (
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => setShareSite(s)}>
                          <Share2 className="h-3.5 w-3.5" /> Compartir
                        </Button>
                      )}
                      <Link to="/sites/$siteId" params={{ siteId: s.id }}>
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs text-accent">
                          {t("sites.view")} →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: filters + table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border bg-card shadow-sm animate-fade-up">
            {/* Filter bar */}
            <div className="grid grid-cols-12 items-center gap-3 border-b bg-card p-4">
              <div className="relative col-span-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Buscar sitios…"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <div className="col-span-2">
                <FilterSelect label="Estado" value={fStatus} onChange={(v) => { setFStatus(v); setPage(1); }}
                  options={[["all","Todos"],["online","En línea"],["offline","Offline"],["stale","Sin datos"],["never","Sin conectar"]]} />
              </div>
              <div className="col-span-2">
                <FilterSelect label="Inversor" value={fInverter} onChange={(v) => { setFInverter(v); setPage(1); }}
                  options={[["all","Todos"] as [string,string], ...inverterOptions.map(o => [o, o] as [string,string])]} />
              </div>
              <div className="col-span-2">
                <FilterSelect label="Plan" value={fPlan} onChange={(v) => { setFPlan(v); setPage(1); }}
                  options={[["all","Todos"] as [string,string], ...planOptions.map(o => [o, o] as [string,string])]} />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button variant="outline" className="h-10 rounded-xl border-border bg-card" onClick={clearFilters}>
                  <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Limpiar
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Sitio</th>
                    <th className="px-4 py-3 font-medium">Inversor</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Potencia actual</th>
                    <th className="px-4 py-3 font-medium">Energía hoy</th>
                    <th className="px-4 py-3 font-medium">Última actualización</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s) => {
                    const statusKey = s.status === "online" ? "sync.online" : s.status === "offline" ? "sync.offline" : `sync.${s.status}`;
                    const statusLabel = ["online","offline","stale","never"].includes(s.status) ? t(statusKey) : s.status;
                    const isShared = !!user && s.owner_id !== user.id;
                    const m = metrics[s.id];
                    const lastSeen = s.last_seen_at ? new Date(s.last_seen_at) : null;
                    const ageMin = lastSeen ? Math.floor((Date.now() - lastSeen.getTime()) / 60000) : null;
                    const lastSeenStr = lastSeen
                      ? (ageMin! < 60 ? `Hace ${ageMin} min` : ageMin! < 1440 ? `Hace ${Math.floor(ageMin!/60)} h` : lastSeen.toLocaleDateString())
                      : "—";
                    const lastSeenAbs = lastSeen ? lastSeen.toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                    const inv = s.inverter_spec_model || s.inverter_model || s.inverter_driver || "—";
                    return (
                      <tr key={s.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 text-primary ring-1 ring-blue-100">
                              <Home className="h-5 w-5" strokeWidth={2.2} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold tracking-tight">{s.name}</div>
                              <div className="truncate text-xs text-muted-foreground">{s.description || "Instalación residencial"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium">{inv}</div>
                          {s.inverter_driver && s.inverter_driver !== inv && (
                            <div className="text-xs text-muted-foreground">{s.inverter_driver}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex h-10 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                            <CpuIcon className="h-4 w-4" strokeWidth={2.2} />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {isShared ? (
                            <Badge variant="outline" className="rounded-full bg-muted/40 text-muted-foreground border-border">
                              Compartido
                            </Badge>
                          ) : (
                            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10 border-0 px-3 py-1 font-medium">{s.plan}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            s.status === "online" ? "bg-emerald-50 text-emerald-700" :
                            s.status === "offline" ? "bg-destructive/10 text-destructive" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            <span className="relative flex h-1.5 w-1.5">
                              {s.status === "online" && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />}
                              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.status === "online" ? "bg-emerald-500" : s.status === "offline" ? "bg-destructive" : "bg-amber-500"}`} />
                            </span>
                            {statusLabel}
                          </span>
                          <div className="mt-1 text-[11px] text-muted-foreground">Normal</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold tracking-tight">
                            {m ? (m.pv_w >= 1000 ? `${(m.pv_w/1000).toFixed(2)} kW` : `${Math.round(m.pv_w)} W`) : "—"}
                          </div>
                          <Sparkline color="#F59E0B" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold tracking-tight">
                            {m ? `${m.kwh_today.toFixed(2)} kWh` : "—"}
                          </div>
                          <Sparkline color="#22C55E" bars />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium">{lastSeenStr}</div>
                          <div className="text-[11px] text-muted-foreground">{lastSeenAbs}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isShared && (
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-border" title="Compartir" onClick={() => setShareSite(s)}>
                                <Share2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Link to="/sites/$siteId" params={{ siteId: s.id }}>
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-border" title="Ver">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Más opciones">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pageItems.length === 0 && (
                    <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">No hay sitios que coincidan con los filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Mostrando {filteredSites.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredSites.length)} de {filteredSites.length} sitio{filteredSites.length === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/5 px-2 text-xs font-semibold text-primary">{page}</div>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-8 w-[130px] rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 por página</SelectItem>
                    <SelectItem value="25">25 por página</SelectItem>
                    <SelectItem value="50">50 por página</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="mt-8 rounded-2xl border bg-primary/[0.04] px-5 py-5 animate-fade-up">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, title: "Monitoreo 24/7", body: "Tus sistemas siempre vigilados", tint: "text-primary" },
            { icon: Zap, title: "Datos en tiempo real", body: "Información precisa al instante", tint: "text-amber-500" },
            { icon: Cloud, title: "Alta disponibilidad", body: "Plataforma 99.9% operativa", tint: "text-sky-500" },
            { icon: LockIcon, title: "Seguro y confiable", body: "Tus datos siempre protegidos", tint: "text-emerald-500" },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <f.icon className={`mt-0.5 h-5 w-5 shrink-0 ${f.tint}`} strokeWidth={2.2} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={shareSite != null} onOpenChange={(o) => !o && setShareSite(null)}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-accent" /> Compartir “{shareSite?.name}”
            </DialogTitle>
            <DialogDescription>
              Invita a otras personas a ver o gestionar este sitio. Puedes asignar roles
              de Lector, Operador o Admin.
            </DialogDescription>
          </DialogHeader>
          {shareSite && <SiteSharing siteId={shareSite.id} isOwnerOrAdmin={true} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-14 rounded-xl pt-5 text-sm font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Sparkline({ color, bars = false }: { color: string; bars?: boolean }) {
  // Deterministic decorative mini-viz (no data needed in list view).
  const points = [3, 5, 4, 7, 6, 9, 7, 8, 11, 9, 12, 10];
  const w = 80, h = 18, max = Math.max(...points);
  if (bars) {
    const bw = (w - (points.length - 1) * 1) / points.length;
    return (
      <svg width={w} height={h} className="mt-1 block">
        {points.map((p, i) => {
          const bh = (p / max) * h;
          return <rect key={i} x={i * (bw + 1)} y={h - bh} width={bw} height={bh} rx={1} fill={color} opacity={0.85} />;
        })}
      </svg>
    );
  }
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="mt-1 block">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
