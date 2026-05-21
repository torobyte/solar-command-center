import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { LayoutDashboard, LineChart as LineChartIcon, Calculator, Settings2, Wrench, Unlink, ExternalLink, Wifi } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { SiteDashboardView, type DashboardSample, formatInverterMode } from "@/components/SiteDashboardView";
import { InverterConfigWizard } from "@/components/InverterConfigWizard";
import { PvSystemConfigCard, type PvConfig } from "@/components/PvSystemConfig";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useBranding } from "@/lib/branding";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

/**
 * Local mirror of /sites/$siteId. Same tabs as the cloud version
 * (Dashboard, Charts, Totals, Configuration) but reading from the
 * agent's HTTP API so it works offline.
 *
 * URL: /local?agent=http://192.168.1.42  (defaults to same-origin)
 */
export const Route = createFileRoute("/local")({
  validateSearch: z.object({ agent: z.string().url().optional() }),
  component: LocalDashboardPage,
});

interface LicenseMeta { plan?: string; site_name?: string; site_id?: string; license_expires_at?: string | null }
interface HistPoint { t: string; pv: number | null; load: number | null; soc: number | null; grid: number | null }
interface TotalsToday {
  pv_kwh: number; load_kwh: number; grid_used_kwh: number;
  battery_charged_kwh: number; battery_discharged_kwh: number;
}
interface PairInfo { code?: string | null; expires_at?: string | null; linked?: boolean }
interface AgentState {
  latest: DashboardSample | null;
  license?: LicenseMeta | null;
  history?: HistPoint[];
  totals_today?: TotalsToday;
  pairing?: PairInfo | null;
  linked?: boolean;
}

interface BridgeFetchResult { ok: boolean; status: number; json: unknown; text?: string; error?: string }
export type AgentFetcher = (path: string, init?: { method?: string; body?: unknown }) => Promise<BridgeFetchResult>;

/** Carry forward last known non-null fields so a transient bad QPIGS read
 *  doesn't blank the whole dashboard to 0. */
function mergeDashboardSample(prev: DashboardSample | null, next: DashboardSample | null): DashboardSample | null {
  if (!next) return prev;
  if (!prev) return next;
  const keys: (keyof DashboardSample)[] = [
    "ac_output_active_power", "pv_input_power", "battery_capacity",
    "battery_voltage", "grid_voltage", "inverter_mode",
  ];
  const merged: DashboardSample = { ...next };
  for (const k of keys) {
    if (next[k] == null && prev[k] != null) {
      (merged as unknown as Record<string, unknown>)[k as string] = prev[k];
    }
  }
  return merged;
}

type LocalTab = "dashboard" | "charts" | "totals" | "config" | "system";

interface AgentInfo { version?: string; boot_id?: string }

const TRIAL_DAYS = 30;
const TRIAL_KEY = "local.trialStartedAt";

function getLocalTrialStart(): number {
  if (typeof window === "undefined") return Date.now();
  const stored = localStorage.getItem(TRIAL_KEY);
  if (stored) {
    const n = Number(stored);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const now = Date.now();
  localStorage.setItem(TRIAL_KEY, String(now));
  return now;
}

function LocalDashboardPage() {
  const search = Route.useSearch();
  const agentBase = useMemo(() => {
    if (search.agent) return search.agent.replace(/\/$/, "");
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, [search.agent]);

  const [tab, setTab] = useState<LocalTab>("dashboard");
  const [wifiOpen, setWifiOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [latest, setLatest] = useState<DashboardSample | null>(null);
  const [history, setHistory] = useState<HistPoint[]>([]);
  const [totals, setTotals] = useState<TotalsToday | null>(null);
  const [license, setLicense] = useState<LicenseMeta | null>(null);
  const [pairing, setPairing] = useState<PairInfo | null>(null);
  const [linked, setLinked] = useState<boolean>(false);
  const [pvCfg, setPvCfg] = useState<PvConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trialStart] = useState<number>(() => getLocalTrialStart());
  const [agentInfo, setAgentInfo] = useState<AgentInfo>({});
  const lastRecordedAt = useRef<string | null>(null);
  const bridgeActive = useRef(false);
  const reqIdRef = useRef(0);
  const pendingReqs = useRef(new Map<number, (v: BridgeFetchResult) => void>());

  const agentFetch = useMemo(() => {
    return async (path: string, init?: { method?: string; body?: unknown }): Promise<BridgeFetchResult> => {
      const method = init?.method || "GET";
      const bodyStr = init?.body != null ? JSON.stringify(init.body) : null;
      if (bridgeActive.current && typeof window !== "undefined" && window.parent && window.parent !== window) {
        return new Promise<BridgeFetchResult>((resolve) => {
          const id = ++reqIdRef.current;
          pendingReqs.current.set(id, resolve);
          try {
            window.parent.postMessage({ source: "solarops-local", type: "fetch", id, path, method, body: bodyStr }, "*");
          } catch {
            pendingReqs.current.delete(id);
            resolve({ ok: false, status: 0, json: null });
          }
          window.setTimeout(() => {
            if (pendingReqs.current.has(id)) {
              pendingReqs.current.delete(id);
              resolve({ ok: false, status: 0, json: null, error: "timeout" });
            }
          }, 15000);
        });
      }
      try {
        const r = await fetch(`${agentBase}${path}`, {
          method,
          headers: bodyStr ? { "Content-Type": "application/json" } : undefined,
          body: bodyStr ?? undefined,
          cache: "no-store",
        });
        const text = await r.text();
        let json: unknown = null;
        try { json = JSON.parse(text); } catch { /* noop */ }
        return { ok: r.ok, status: r.status, json, text };
      } catch (e) {
        return { ok: false, status: 0, json: null, error: (e as Error).message };
      }
    };
  }, [agentBase]);

  // ---- Bridge postMessage: cuando esta página se carga dentro del wrapper
  // del agente (HTTP) en un iframe HTTPS, los fetch directos al agente
  // fallan por mixed-content. El padre los hace y nos los envía aquí.
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d = ev?.data as { source?: string; type?: string; payload?: unknown; id?: number; ok?: boolean; status?: number; json?: unknown; text?: string; error?: string } | null;
      if (!d || d.source !== "solarops-agent") return;
      const fetchResult = (d.payload as { id?: number; ok?: boolean; status?: number; json?: unknown; text?: string; error?: string } | null) ?? d;
      if (d.type === "fetch:result" && typeof fetchResult.id === "number") {
        const resolver = pendingReqs.current.get(fetchResult.id);
        if (resolver) {
          pendingReqs.current.delete(fetchResult.id);
          resolver({ ok: !!fetchResult.ok, status: fetchResult.status ?? 0, json: fetchResult.json ?? null, text: fetchResult.text, error: fetchResult.error });
        }
        return;
      }
      bridgeActive.current = true;
      setError(null);
      if (d.type === "state") {
        const j = d.payload as AgentState;
        const incoming = j?.latest ?? null;
        const key = incoming?.recorded_at ?? null;
        if (key !== lastRecordedAt.current) {
          lastRecordedAt.current = key;
          setLatest((prev) => mergeDashboardSample(prev, incoming));
        }
        if (j?.history) setHistory(j.history);
        if (j?.totals_today) setTotals(j.totals_today);
        if (j?.license) setLicense(j.license);
        if (j?.pairing !== undefined) setPairing(j.pairing ?? null);
        if (typeof j?.linked === "boolean") setLinked(j.linked);
        const ag = (j as unknown as { agent?: AgentInfo })?.agent;
        if (ag) setAgentInfo(ag);
      } else if (d.type === "pvconfig") {
        setPvCfg({ site_id: "local", ...(d.payload as object) } as PvConfig);
      }
    }
    window.addEventListener("message", onMsg);
    // Avisamos al padre que estamos listos para recibir el último snapshot.
    try { window.parent?.postMessage({ source: "solarops-local", type: "ready" }, "*"); } catch { /* noop */ }
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!agentBase) return;
    let alive = true;
    async function pull() {
      // Si el bridge está enviando datos, no compitas con fetches que el
      // navegador bloquea por mixed-content.
      if (bridgeActive.current) return;
      try {
        const r = await fetch(`${agentBase}/api/state`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as AgentState;
        if (!alive) return;
        setError(null);
        const incoming = j.latest;
        const key = incoming?.recorded_at ?? null;
        if (key !== lastRecordedAt.current) {
          lastRecordedAt.current = key;
          setLatest((prev) => mergeDashboardSample(prev, incoming));
        }
        if (j.history) setHistory(j.history);
        if (j.totals_today) setTotals(j.totals_today);
        if (j.license) setLicense(j.license);
        if (j.pairing !== undefined) setPairing(j.pairing ?? null);
        if (typeof j.linked === "boolean") setLinked(j.linked);
      } catch (e) {
        if (alive && !bridgeActive.current) setError((e as Error).message);
      }
    }
    async function pullPv() {
      if (bridgeActive.current) return;
      try {
        const r = await fetch(`${agentBase}/api/pvconfig`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (!alive) return;
        setPvCfg({ site_id: "local", ...data });
      } catch { /* optional */ }
    }
    pull(); pullPv();
    const id = window.setInterval(pull, 1000);
    return () => { alive = false; window.clearInterval(id); };
  }, [agentBase]);


  const { branding } = useBranding();
  const brandName = branding?.site_name || branding?.pwa_name || "Torobyte";
  const mode = formatInverterMode(latest?.inverter_mode);
  const fresh = latest?.recorded_at && (Date.now() - new Date(latest.recorded_at).getTime() < 60_000);
  const siteName = license?.site_name ?? `${brandName} Local`;
  const isLinked = Boolean(pairing?.linked) || linked || Boolean(license?.site_id);
  const plan = isLinked ? (license?.plan ?? "cloud") : "trial local";
  const isLifetime = (plan || "").toLowerCase().includes("lifetime") || (plan || "").toLowerCase().includes("perpetu");

  // Trial countdown (modo local). Si la licencia cloud trae expires_at lo
  // usamos; si no, calculamos 30 días desde el primer arranque local.
  const cloudExp = license?.license_expires_at ? new Date(license.license_expires_at).getTime() : null;
  const localExp = trialStart + TRIAL_DAYS * 86_400_000;
  const expMs = cloudExp ?? localExp;
  const daysLeft = Math.max(0, Math.ceil((expMs - Date.now()) / 86_400_000));
  // Más de 100 años restantes = licencia "de por vida" mal modelada en el back.
  const treatAsLifetime = isLifetime || daysLeft > 36500;
  const trialLabel = treatAsLifetime
    ? "Licencia: Perpetua"
    : isLinked && cloudExp
      ? (daysLeft > 0 ? `Licencia: ${daysLeft} día${daysLeft === 1 ? "" : "s"}` : "Licencia vencida")
      : (daysLeft > 0 ? `Prueba: ${daysLeft}/${TRIAL_DAYS} días` : "Prueba vencida");
  const trialTone = treatAsLifetime ? "bg-success/15 text-success"
    : daysLeft > 7 ? "bg-success/15 text-success"
    : daysLeft > 0 ? "bg-warning/15 text-warning"
    : "bg-destructive/15 text-destructive";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:py-6">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{siteName}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${fresh ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${fresh ? "bg-success animate-pulse" : "bg-destructive"}`} />
                {fresh ? "En vivo · 1 s" : error ? `Sin conexión` : "Sin datos"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Plan: {plan}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Modo: {mode.label}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${trialTone}`}>{trialLabel}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Agente v{agentInfo.version ?? "?"}</span>
              {!isLinked && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  Código:
                  <span className="font-mono tracking-[0.2em] text-foreground">
                    {pairing?.code ?? "······"}
                  </span>
                </span>
              )}
              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 p-0.5">
                <LangSwitcher />
                <ThemeToggle />
              </span>
            </div>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LocalTab)} className="pb-8">
          <TabsList className="h-11 rounded-full bg-muted/60 p-1 inline-flex flex-wrap">
            <TabsTrigger value="dashboard" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LayoutDashboard className="h-3.5 w-3.5" strokeWidth={2.2} />Dashboard</TabsTrigger>
            <TabsTrigger value="charts" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LineChartIcon className="h-3.5 w-3.5" strokeWidth={2.2} />Charts</TabsTrigger>
            <TabsTrigger value="totals" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Calculator className="h-3.5 w-3.5" strokeWidth={2.2} />Totals</TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Settings2 className="h-3.5 w-3.5" strokeWidth={2.2} />Configuración</TabsTrigger>
            <TabsTrigger value="system" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Wrench className="h-3.5 w-3.5" strokeWidth={2.2} />Sistema</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <SiteDashboardView latest={latest} siteId="local" pvConfig={pvCfg} agentBase={agentBase} />
            {!latest && (
              <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                <div className="font-medium text-foreground/90">Esperando datos del inversor…</div>
                <div className="mt-2 text-xs">Verifica que el cable USB/serial esté conectado y el inversor encendido.</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="charts" className="mt-6 space-y-6">
            <ChartCard title="Potencia (W) — últimas muestras" data={history} keys={[
              { key: "pv", name: "PV", color: "hsl(var(--success))" },
              { key: "load", name: "Carga", color: "hsl(var(--primary))" },
            ]} />
            <ChartCard title="Estado batería (%) y red (V)" data={history} keys={[
              { key: "soc", name: "SOC %", color: "hsl(var(--accent))" },
              { key: "grid", name: "Red V", color: "hsl(var(--warning))" },
            ]} />
          </TabsContent>

          <TabsContent value="totals" className="mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <TotalCard label="Solar generado" value={totals?.pv_kwh} unit="kWh" tone="success" />
              <TotalCard label="Consumo" value={totals?.load_kwh} unit="kWh" tone="primary" />
              <TotalCard label="Red usada" value={totals?.grid_used_kwh} unit="kWh" tone="warning" />
              <TotalCard label="Batería cargada" value={totals?.battery_charged_kwh} unit="kWh" tone="success" />
              <TotalCard label="Batería descargada" value={totals?.battery_discharged_kwh} unit="kWh" tone="destructive" />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Totales del día calculados localmente desde las muestras del inversor (aprox. trapezoidal).</p>
          </TabsContent>

          <TabsContent value="config" className="mt-6 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Configuración del inversor (paso a paso)</CardTitle></CardHeader>
              <CardContent>
                <InverterConfigWizard siteId="local" agentBase={agentBase} agentFetch={agentFetch} />
              </CardContent>
            </Card>
            <PvSystemConfigCard siteId="local" />
          </TabsContent>

          <TabsContent value="system" className="mt-6 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Sistema y vinculación</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Versión del agente</div><div className="font-mono">v{agentInfo.version ?? "?"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Estado</div><div>{isLinked ? "Vinculado" : "Sin vincular"}</div></div>
                  {license?.site_id && <div className="col-span-2"><div className="text-xs text-muted-foreground">Site ID</div><div className="font-mono text-xs">{license.site_id}</div></div>}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {isLinked && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (!confirm("¿Desvincular este equipo? Se generará un nuevo código de pairing.")) return;
                        try {
                          const res = await agentFetch("/api/unlink", { method: "POST" });
                          const j = (res.json as { code?: string } | null) ?? {};
                          if (j?.code) toast.success(`Nuevo código: ${j.code}`);
                          else if (res.ok) toast.success("Desvinculado");
                          else toast.error(res.error || `HTTP ${res.status}`);
                        } catch (e) { toast.error((e as Error).message); }
                      }}
                    >
                      <Unlink className="mr-1.5 h-3.5 w-3.5" /> Desvincular equipo
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${agentBase}/wifi`} target="_blank" rel="noreferrer">
                      <Wifi className="mr-1.5 h-3.5 w-3.5" /> Configurar WiFi
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${agentBase}/status`} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Diagnóstico del agente
                    </a>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  <b>Configurar WiFi</b> siempre está disponible, aunque el equipo esté por Ethernet.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TotalCard({ label, value, unit, tone }: { label: string; value: number | undefined; unit: string; tone: "success"|"primary"|"warning"|"destructive" }) {
  const toneCls = {
    success: "text-success",
    primary: "text-primary",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${toneCls}`}>
          {value != null ? value.toFixed(2) : "—"} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, data, keys }: { title: string; data: HistPoint[]; keys: { key: keyof HistPoint; name: string; color: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              {keys.map((k) => (
                <linearGradient key={String(k.key)} id={`g-${String(k.key)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={k.color} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={k.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} tickFormatter={(v) => v ? new Date(v).toLocaleTimeString().slice(0,5) : ""} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {keys.map((k) => (
              <Area key={String(k.key)} type="monotone" dataKey={String(k.key)} name={k.name} stroke={k.color} fill={`url(#g-${String(k.key)})`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
