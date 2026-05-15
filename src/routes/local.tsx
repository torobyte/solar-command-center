import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { LayoutDashboard, LineChart as LineChartIcon, Calculator, Settings2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteDashboardView, type DashboardSample, formatInverterMode } from "@/components/SiteDashboardView";
import { InverterConfigWizard } from "@/components/InverterConfigWizard";
import { PvSystemConfigCard, type PvConfig } from "@/components/PvSystemConfig";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LangSwitcher } from "@/components/LangSwitcher";
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

interface LicenseMeta { plan?: string; site_name?: string; site_id?: string }
interface HistPoint { t: string; pv: number | null; load: number | null; soc: number | null; grid: number | null }
interface TotalsToday {
  pv_kwh: number; load_kwh: number; grid_used_kwh: number;
  battery_charged_kwh: number; battery_discharged_kwh: number;
}
interface AgentState {
  latest: DashboardSample | null;
  license?: LicenseMeta | null;
  history?: HistPoint[];
  totals_today?: TotalsToday;
}

type LocalTab = "dashboard" | "charts" | "totals" | "config";

function LocalDashboardPage() {
  const search = Route.useSearch();
  const agentBase = useMemo(() => {
    if (search.agent) return search.agent.replace(/\/$/, "");
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, [search.agent]);

  const [tab, setTab] = useState<LocalTab>("dashboard");
  const [latest, setLatest] = useState<DashboardSample | null>(null);
  const [history, setHistory] = useState<HistPoint[]>([]);
  const [totals, setTotals] = useState<TotalsToday | null>(null);
  const [license, setLicense] = useState<LicenseMeta | null>(null);
  const [pvCfg, setPvCfg] = useState<PvConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastRecordedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!agentBase) return;
    let alive = true;
    async function pull() {
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
          setLatest(incoming);
        }
        if (j.history) setHistory(j.history);
        if (j.totals_today) setTotals(j.totals_today);
        if (j.license) setLicense(j.license);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    async function pullPv() {
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

  const mode = formatInverterMode(latest?.inverter_mode);
  const fresh = latest?.recorded_at && (Date.now() - new Date(latest.recorded_at).getTime() < 60_000);
  const siteName = license?.site_name ?? "SolarOps Local";
  const plan = license?.plan ?? "local";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:py-6">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{siteName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${fresh ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${fresh ? "bg-success animate-pulse" : "bg-destructive"}`} />
                {fresh ? "En vivo · cada 1 s" : error ? `Sin conexión · ${error}` : "Sin datos del inversor"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Plan: {plan}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Modo: {mode.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Modo local · sincronizando con cloud</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <LangSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LocalTab)} className="pb-8">
          <TabsList className="h-11 rounded-full bg-muted/60 p-1 inline-flex flex-wrap">
            <TabsTrigger value="dashboard" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LayoutDashboard className="h-3.5 w-3.5" strokeWidth={2.2} />Dashboard</TabsTrigger>
            <TabsTrigger value="charts" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LineChartIcon className="h-3.5 w-3.5" strokeWidth={2.2} />Charts</TabsTrigger>
            <TabsTrigger value="totals" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Calculator className="h-3.5 w-3.5" strokeWidth={2.2} />Totals</TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Settings2 className="h-3.5 w-3.5" strokeWidth={2.2} />Configuración</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <SiteDashboardView latest={latest} siteId="local" pvConfig={pvCfg} />
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
                <InverterConfigWizard siteId="local" agentBase={agentBase} />
              </CardContent>
            </Card>
            <PvSystemConfigCard siteId="local" />
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
