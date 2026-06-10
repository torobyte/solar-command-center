import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, Battery, Sun, Plug, Cpu, AlertCircle, LayoutDashboard, LineChart, Calculator, Settings2, Info, Wifi, HardDrive, Terminal, SlidersHorizontal, Download, Pencil, Check, X, Coins, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { SiteDashboardView } from "@/components/SiteDashboardView";
import { SolarMonitorView } from "@/components/SolarMonitorView";
import { SavingsTabView } from "@/components/SavingsTabView";
import { PvSystemConfigCard, usePvConfig } from "@/components/PvSystemConfig";
import { ProductionHistoryCompare } from "@/components/ProductionHistoryCompare";
import { DeviceSelector, useDevices, type Device } from "@/components/DeviceManager";
import { NotificationsConfig } from "@/components/NotificationsConfig";
import { useNotificationWatcher } from "@/lib/notifications";
import { useAuth } from "@/lib/auth";
import { BellRing } from "lucide-react";
import { MobileBottomNav, type SiteTab } from "@/components/MobileBottomNav";
import { PageHeaderSkeleton, DashboardSkeleton, SectionSkeleton } from "@/components/LoadingStates";
import { InverterConfigWizard } from "@/components/InverterConfigWizard";
import { QuickActions, QuickActionsConfigCard, useQuickActionsConfig } from "@/components/QuickActions";
import { LockscreenLiveCard } from "@/components/LockscreenLiveCard";
import { CommandStatusFeed } from "@/components/CommandStatusFeed";
import { SiteSharing } from "@/components/SiteSharing";
import { Share2, Lock } from "lucide-react";
import { useSiteRole, ROLE_LABEL, ROLE_DESCRIPTION, type SiteRole } from "@/lib/useSiteRole";

function SiteDetailSkeleton() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="space-y-4">
        <DashboardSkeleton />
      </div>
    </>
  );
}

export const Route = createFileRoute("/sites/$siteId")({
  component: () => <ProtectedLayout><SiteDetail /></ProtectedLayout>,
});

interface Site {
  id: string; name: string; description: string | null;
  inverter_model: string | null; inverter_serial: string | null;
  device_token: string; status: string; plan: string;
  last_seen_at: string | null; license_expires_at: string | null;
}

interface Sample {
  recorded_at: string;
  ac_output_active_power: number | null;
  pv_input_power: number | null;
  battery_capacity: number | null;
  battery_voltage: number | null;
  battery_discharge_current: number | null;
  battery_charging_current: number | null;
  grid_voltage: number | null;
  inverter_mode: string | null;
}

interface DailyTotal {
  day: string; pv_kwh: number; load_kwh: number;
  grid_used_kwh: number; battery_charged_kwh: number; battery_discharged_kwh: number;
}

/**
 * Merge a new sample with the previous one, preserving the last known
 * non-null value for each metric. This prevents the dashboard from
 * "flickering to zero" when a single bad inverter read sanitizes some
 * fields to null. The new recorded_at is always kept.
 */
function mergeSample(prev: Sample | null, next: Sample): Sample {
  if (!prev) return next;
  const keys: (keyof Sample)[] = [
    "ac_output_active_power", "pv_input_power", "battery_capacity",
    "battery_voltage", "battery_discharge_current", "battery_charging_current",
    "grid_voltage", "inverter_mode",
  ];
  const merged: Sample = { ...next };
  for (const k of keys) {
    if (next[k] == null && prev[k] != null) {
      (merged as unknown as Record<string, unknown>)[k as string] = prev[k];
    }
  }
  return merged;
}

/**
 * Rechaza picos transitorios del inversor (lecturas que se disparan o se
 * desploman un solo sample y vuelven a la normalidad). Si un valor numérico
 * cambia más allá del delta permitido respecto al sample anterior, lo
 * sustituimos por el valor previo durante hasta MAX_SKIPS samples
 * consecutivos; si el valor "anómalo" persiste se acepta como nuevo normal.
 */
type SpikeKey = "ac_output_active_power" | "pv_input_power" | "battery_capacity" | "battery_voltage" | "grid_voltage";
const SPIKE_LIMITS: Record<SpikeKey, number> = {
  ac_output_active_power: 4000, // W entre samples
  pv_input_power: 4000,         // W
  battery_capacity: 25,         // % SoC
  battery_voltage: 6,           // V
  grid_voltage: 60,             // V
};
const MAX_SKIPS = 2;
export type SpikeState = Partial<Record<SpikeKey, number>>;

function filterSpikes(prev: Sample | null, next: Sample, skips: SpikeState): Sample {
  if (!prev) return next;
  const cleaned: Sample = { ...next };
  for (const k of Object.keys(SPIKE_LIMITS) as SpikeKey[]) {
    const p = prev[k] as number | null;
    const n = next[k] as number | null;
    if (p == null || n == null || !Number.isFinite(p) || !Number.isFinite(n)) {
      skips[k] = 0;
      continue;
    }
    const delta = Math.abs(n - p);
    if (delta > SPIKE_LIMITS[k]) {
      const c = (skips[k] ?? 0) + 1;
      if (c <= MAX_SKIPS) {
        (cleaned as unknown as Record<string, unknown>)[k] = p;
        skips[k] = c;
        continue;
      }
    }
    skips[k] = 0;
  }
  return cleaned;
}

/* ---------------- Chart smoothing ---------------- */
type SeriesPoint = { t: number; pv: number | null; load: number | null; soc: number | null; battery: number | null; grid: number | null };
type ChartWindow = "3h" | "12h" | "24h";
type ChartResolution = "raw" | "5m" | "15m" | "1h";
type ChartPoint = {
  t: number;
  pv: number;
  load: number;
  soc: number;
  battery: number;
  grid: number;
  batteryCharge: number;
  batteryDischarge: number;
  solarShare: number;
};

function smoothSeries(
  data: SeriesPoint[],
  mode: "off" | "mean" | "median",
  window: number,
): Array<{ t: number; pv: number; load: number; soc: number; battery: number; grid: number }> {
  if (mode === "off" || window <= 1) {
    return data.map((p) => ({
      t: p.t,
      pv: p.pv ?? 0,
      load: p.load ?? 0,
      soc: p.soc ?? 0,
      battery: p.battery ?? 0,
      grid: p.grid ?? 0,
    }));
  }
  const keys: ("pv" | "load" | "soc" | "battery" | "grid")[] = ["pv", "load", "soc", "battery", "grid"];
  const out = data.map((p) => ({ t: p.t, pv: 0, load: 0, soc: 0, battery: 0, grid: 0 }));
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    for (const k of keys) {
      const vals = slice.map((s) => s[k]).filter((v): v is number => v != null && Number.isFinite(v));
      if (vals.length === 0) { out[i][k] = 0; continue; }
      if (mode === "mean") {
        out[i][k] = vals.reduce((a, b) => a + b, 0) / vals.length;
      } else {
        const sorted = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        out[i][k] = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      }
    }
  }
  return out;
}

function getWindowMs(window: ChartWindow) {
  if (window === "3h") return 3 * 60 * 60 * 1000;
  if (window === "24h") return 24 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

function getBucketMs(resolution: ChartResolution) {
  if (resolution === "5m") return 5 * 60 * 1000;
  if (resolution === "15m") return 15 * 60 * 1000;
  if (resolution === "1h") return 60 * 60 * 1000;
  return 0;
}

function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function bucketSeries(data: ChartPoint[], resolution: ChartResolution): ChartPoint[] {
  const bucketMs = getBucketMs(resolution);
  if (!bucketMs) return data;

  const buckets = new Map<number, ChartPoint[]>();
  for (const point of data) {
    const key = Math.floor(point.t / bucketMs) * bucketMs;
    const list = buckets.get(key) ?? [];
    list.push(point);
    buckets.set(key, list);
  }

  return Array.from(buckets.entries()).map(([t, points]) => ({
    t,
    pv: average(points.map((p) => p.pv)),
    load: average(points.map((p) => p.load)),
    soc: average(points.map((p) => p.soc)),
    battery: average(points.map((p) => p.battery)),
    grid: average(points.map((p) => p.grid)),
    batteryCharge: average(points.map((p) => p.batteryCharge)),
    batteryDischarge: average(points.map((p) => p.batteryDischarge)),
    solarShare: average(points.map((p) => p.solarShare)),
  }));
}

function InlineSiteName({ site, onRenamed }: { site: Site; onRenamed: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(site.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(site.name); }, [site.name]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === site.name) { setEditing(false); setValue(site.name); return; }
    setSaving(true);
    const { error } = await supabase.from("sites").update({ name: trimmed }).eq("id", site.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onRenamed(trimmed);
    setEditing(false);
    toast.success("Nombre actualizado");
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(site.name); } }}
          className="h-9 max-w-sm text-lg font-semibold"
          disabled={saving}
        />
        <Button size="icon" variant="ghost" onClick={save} disabled={saving}><Check className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => { setEditing(false); setValue(site.name); }} disabled={saving}><X className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-2 rounded-md text-left hover:bg-muted/40 px-1 -mx-1 py-0.5 transition-colors"
      title="Renombrar sitio"
    >
      <h1 className="truncate text-2xl font-semibold tracking-tight">{site.name}</h1>
      <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function SiteDetail() {
  const { siteId } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { devices, selected: selectedDevice, loaded: devicesLoaded } = useDevices(siteId);
  const roleInfo = useSiteRole(siteId);
  const { config: pvForCompare } = usePvConfig(siteId);
  const [site, setSite] = useState<Site | null>(null);
  const [latest, setLatest] = useState<Sample | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [totals, setTotals] = useState<DailyTotal[]>([]);
  const spikeRef = useRef<SpikeState>({});
  const [tab, setTab] = useState<SiteTab>("dashboard");
  const [configSubTab, setConfigSubTab] = useState<string>("inverter");
  const [chartWindow, setChartWindow] = useState<ChartWindow>("12h");
  const [chartResolution, setChartResolution] = useState<ChartResolution>("5m");

  // If a viewer somehow lands on the Config tab (deep-link, role just demoted),
  // bounce them back to the dashboard so they don't see a "blocked" empty pane.
  useEffect(() => {
    if (!roleInfo.loading && roleInfo.role === "viewer" && tab === "config") {
      setTab("dashboard");
    }
  }, [roleInfo.loading, roleInfo.role, tab]);

  useNotificationWatcher(siteId, user?.id);


  // device_id NULL on a row = legacy / primary device or rows ingested
  // before any "devices" row existed. Treat the primary device — and the
  // case where no device row exists at all — as "match device_id == id OR
  // device_id IS NULL". Otherwise filter strictly to that device.
  const deviceFilter = useMemo(() => {
    if (!selectedDevice) return null;
    if (selectedDevice.is_primary) {
      return `device_id.eq.${selectedDevice.id},device_id.is.null`;
    }
    return null; // non-primary handled with .eq below
  }, [selectedDevice]);

  function applyDeviceFilter<T extends { eq: (col: string, v: unknown) => T; or: (q: string) => T; is: (col: string, v: unknown) => T }>(q: T): T {
    if (!selectedDevice) return q.is("device_id", null);
    if (selectedDevice.is_primary && deviceFilter) return q.or(deviceFilter);
    return q.eq("device_id", selectedDevice.id);
  }

  async function loadSite() {
    const { data: s } = await supabase.from("sites").select("*").eq("id", siteId).maybeSingle();
    setSite(s as Site | null);
  }

  async function load() {
    await loadSite();

    const sinceWindow = new Date(Date.now() - getWindowMs("24h")).toISOString();
    let tq = supabase
      .from("telemetry_samples")
      .select("recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, battery_discharge_current, battery_charging_current, grid_voltage, inverter_mode, device_id")
      .eq("site_id", siteId)
      .gte("recorded_at", sinceWindow);
    tq = applyDeviceFilter(tq as never) as never;
    const { data: t } = await tq.order("recorded_at", { ascending: false }).limit(5000);
    const rows = (t ?? []).reverse() as Sample[];
    setHistory(rows);
    // Fold from oldest → newest preserving the last known non-null value per
    // metric, so a single bad sample at the end doesn't show a dashboard of 0s.
    const folded = rows.reduce<Sample | null>((acc, r) => mergeSample(acc, r), null);
    setLatest(folded);

    const { data: dt } = await supabase
      .from("daily_totals")
      .select("day, pv_kwh, load_kwh, grid_used_kwh, battery_charged_kwh, battery_discharged_kwh")
      .eq("site_id", siteId)
      .order("day", { ascending: false })
      .limit(30);
    setTotals(((dt ?? []) as DailyTotal[]).reverse());
  }

  // Always load the site row so the page renders even if no device has
  // been registered yet (e.g. immediately after pairing, before the agent
  // has pushed its first sample / device row).
  useEffect(() => { loadSite(); }, [siteId]);

  useEffect(() => {
    // Wait until useDevices has resolved so we know whether to filter by a
    // device id or by "device_id IS NULL". Without this, samples ingested
    // by the agent (which sends device_id=NULL) would never show up on
    // sites that don't have a devices row yet.
    if (!devicesLoaded) return;
    let alive = true;
    load();

    const devKey = selectedDevice?.id ?? "none";
    const chanName = `site-${siteId}-${devKey}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(chanName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_samples", filter: `site_id=eq.${siteId}` },
        (payload) => {
          if (!alive) return;
          const row = payload.new as Sample & { device_id: string | null };
          const matches = !selectedDevice
            ? row.device_id == null
            : selectedDevice.is_primary
              ? (row.device_id === selectedDevice.id || row.device_id == null)
              : row.device_id === selectedDevice.id;
          if (!matches) return;
          setLatest((prev) => mergeSample(prev, filterSpikes(prev, row, spikeRef.current)));
          setHistory((h) => {
            if (h.length && h[h.length - 1].recorded_at === row.recorded_at) return h;
            const cutoff = Date.now() - getWindowMs("24h");
            const next = [...h, row];
            let i = 0;
            while (i < next.length && new Date(next[i].recorded_at).getTime() < cutoff) i++;
            return i > 0 ? next.slice(i) : next;
          });
        })
      .subscribe();

    // Polling fallback (websocket may be dropped by mobile / corp proxies).
    async function poll() {
      let q = supabase
        .from("telemetry_samples")
        .select("recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, battery_discharge_current, battery_charging_current, grid_voltage, inverter_mode, device_id")
        .eq("site_id", siteId);
      q = applyDeviceFilter(q as never) as never;
      const { data } = await q.order("recorded_at", { ascending: false }).limit(1);
      if (!alive) return;
      const row = (data && data[0]) as Sample | undefined;
      if (!row) return;
      setLatest((prev) => {
        if (prev && prev.recorded_at === row.recorded_at) return prev;
        setHistory((h) => {
          if (h.length && h[h.length - 1].recorded_at === row.recorded_at) return h;
            const cutoff = Date.now() - getWindowMs("24h");
          const next = [...h, row];
          let i = 0;
          while (i < next.length && new Date(next[i].recorded_at).getTime() < cutoff) i++;
          return i > 0 ? next.slice(i) : next;
        });
        return mergeSample(prev, filterSpikes(prev, row, spikeRef.current));
      });
    }
    const pollId = setInterval(poll, 1000);
    return () => { alive = false; supabase.removeChannel(channel); clearInterval(pollId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, devicesLoaded, selectedDevice?.id, selectedDevice?.is_primary]);

  // Persisted smoothing options (per-browser).
  const [smoothMode, setSmoothMode] = useState<"off" | "mean" | "median">(
    () => (typeof localStorage !== "undefined" && (localStorage.getItem("chart.smoothMode") as "off" | "mean" | "median")) || "off",
  );
  const [smoothWindow, setSmoothWindow] = useState<number>(
    () => (typeof localStorage !== "undefined" && Number(localStorage.getItem("chart.smoothWindow"))) || 5,
  );
  useEffect(() => { localStorage.setItem("chart.smoothMode", smoothMode); }, [smoothMode]);
  useEffect(() => { localStorage.setItem("chart.smoothWindow", String(smoothWindow)); }, [smoothWindow]);

  const rawChartData = useMemo(() => {
    const skips: SpikeState = {};
    let prev: Sample | null = null;
    const cleaned: Sample[] = [];
    for (const r of history) {
      const next = filterSpikes(prev, r, skips);
      cleaned.push(next);
      prev = mergeSample(prev, next);
    }
    return cleaned.map((r) => {
      const bv = Number(r.battery_voltage ?? 0);
      const di = Number(r.battery_discharge_current ?? 0);
      const ci = Number(r.battery_charging_current ?? 0);
      const batW = bv * (di - ci);
      const pv = r.pv_input_power == null ? 0 : Number(r.pv_input_power);
      const load = r.ac_output_active_power == null ? 0 : Number(r.ac_output_active_power);
      const battery = r.battery_voltage == null ? 0 : +batW.toFixed(1);
      const batteryDischarge = Math.max(0, battery);
      const batteryCharge = Math.max(0, -battery);
      const grid = Number(r.grid_voltage ?? 0) > 50 ? Math.max(0, load + batteryCharge - pv - batteryDischarge) : 0;
      return {
        t: new Date(r.recorded_at).getTime(),
        pv,
        load,
        soc: r.battery_capacity == null ? 0 : Number(r.battery_capacity),
        grid,
        battery,
      };
    });
  }, [history]);

  const chartData = useMemo(() => {
    const cutoff = Date.now() - getWindowMs(chartWindow);
    const windowed = rawChartData.filter((point) => point.t >= cutoff);
    const smoothed = smoothSeries(windowed, smoothMode, smoothWindow).map((point) => ({
      ...point,
      batteryCharge: Math.max(0, -point.battery),
      batteryDischarge: Math.max(0, point.battery),
      solarShare: point.load > 0 ? Math.min(100, (point.pv / point.load) * 100) : 0,
    }));
    return bucketSeries(smoothed, chartResolution);
  }, [chartResolution, chartWindow, rawChartData, smoothMode, smoothWindow]);

  const chartStats = useMemo(() => {
    if (!chartData.length) {
      return { peakPv: 0, peakLoad: 0, avgLoad: 0, gridUseAvg: 0, selfSupply: 0 };
    }
    const peakPv = Math.max(...chartData.map((p) => p.pv));
    const peakLoad = Math.max(...chartData.map((p) => p.load));
    const avgLoad = average(chartData.map((p) => p.load));
    const gridUseAvg = average(chartData.map((p) => p.grid));
    const totalLoad = chartData.reduce((sum, p) => sum + p.load, 0);
    const totalGrid = chartData.reduce((sum, p) => sum + p.grid, 0);
    const selfSupply = totalLoad > 0 ? Math.max(0, Math.min(100, ((totalLoad - totalGrid) / totalLoad) * 100)) : 0;
    return { peakPv, peakLoad, avgLoad, gridUseAvg, selfSupply };
  }, [chartData]);

  if (!site) return <SiteDetailSkeleton />;

  const sidebarItems: { id: SiteTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "charts", label: "Charts", icon: LineChart },
    { id: "totals", label: "Totales", icon: Calculator },
    { id: "savings", label: "Ahorro", icon: Coins },
    { id: "control", label: "Control", icon: Zap },
    ...(roleInfo.role !== "viewer" ? [{ id: "config" as SiteTab, label: "Configuración", icon: Settings2 }] : []),
  ];


  return (
    <>
      <Link to="/app" className="group mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.4} /> Volver a sitios
      </Link>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <div className="mb-4">
              <h2 className="truncate text-xl font-bold tracking-tight">{site.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{site.inverter_model ?? "Inversor conectado"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${site.status === "online" ? "bg-success/15 text-success" : site.status === "offline" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>● En línea</span>
                {roleInfo.role && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    <Lock className="h-3 w-3" strokeWidth={2.4} /> {ROLE_LABEL[roleInfo.role]}
                  </span>
                )}
              </div>
            </div>
            <nav className="space-y-1">
              {sidebarItems.map((it) => {
                const active = tab === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => setTab(it.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                  >
                    <it.icon className="h-4 w-4" strokeWidth={2.2} />
                    {it.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex items-start justify-between gap-3 animate-fade-up lg:hidden">
            <div className="min-w-0 flex-1">
              <InlineSiteName site={site} onRenamed={(name) => setSite((s) => s ? { ...s, name } : s)} />
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <span>{site.inverter_model ?? selectedDevice?.name ?? (latest ? "Inversor conectado" : "Esperando datos del inversor…")}</span>
                <span>·</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${site.status === "online" ? "bg-success/15 text-success" : site.status === "offline" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>● {site.status}</span>
                {roleInfo.role && (
                  <span title={ROLE_DESCRIPTION[roleInfo.role]} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    <Lock className="h-3 w-3" strokeWidth={2.4} /> Tu rol: {ROLE_LABEL[roleInfo.role]}
                  </span>
                )}
              </p>
            </div>
            {roleInfo.canManageMembers && (
              <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => { setTab("config"); setConfigSubTab("sharing"); }}>
                <Share2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={2.4} /> Compartir
              </Button>
            )}
          </div>

          {/* Desktop title bar matching design captures */}
          <div className="mb-6 hidden items-start justify-between gap-4 lg:flex animate-fade-up">
            <div className="min-w-0 flex-1">
              <InlineSiteName site={site} onRenamed={(name) => setSite((s) => s ? { ...s, name } : s)} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{site.inverter_model ?? selectedDevice?.name ?? "Inversor conectado"}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${site.status === "online" ? "bg-success/15 text-success" : site.status === "offline" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" /> {site.status === "online" ? "En línea" : site.status === "offline" ? "Offline" : site.status}
                </span>
                {roleInfo.role && (
                  <span title={ROLE_DESCRIPTION[roleInfo.role]} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                    <Lock className="h-3 w-3" strokeWidth={2.4} /> Tu rol: {ROLE_LABEL[roleInfo.role]}
                  </span>
                )}
              </div>
            </div>
            {roleInfo.canManageMembers && (
              <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => { setTab("config"); setConfigSubTab("sharing"); }}>
                <Share2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={2.4} /> Compartir
              </Button>
            )}
          </div>


      <Tabs value={tab} onValueChange={(v) => setTab(v as SiteTab)} className="pb-24 lg:pb-0">
        {/* Mobile y tablet usan MobileBottomNav (abajo); desktop usa el sidebar. */}
        <TabsList className="hidden">

          <TabsTrigger value="dashboard" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LayoutDashboard className="h-3.5 w-3.5" strokeWidth={2.2} />Dashboard</TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LineChart className="h-3.5 w-3.5" strokeWidth={2.2} />Charts</TabsTrigger>
          <TabsTrigger value="totals" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Calculator className="h-3.5 w-3.5" strokeWidth={2.2} />Totals</TabsTrigger>
          <TabsTrigger value="savings" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Coins className="h-3.5 w-3.5" strokeWidth={2.2} />Ahorro</TabsTrigger>
          <TabsTrigger value="control" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Zap className="h-3.5 w-3.5" strokeWidth={2.2} />Control</TabsTrigger>
          {roleInfo.role !== "viewer" && (
            <TabsTrigger value="config" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Settings2 className="h-3.5 w-3.5" strokeWidth={2.2} />Configuration</TabsTrigger>

          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6 space-y-6">
          <SolarMonitorView latest={latest} siteId={siteId} />
          <SiteDashboardView latest={latest} siteId={siteId} />
          {!latest && (
            <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Esperando la primera muestra de {selectedDevice?.name ?? "tu inversor"}…
            </div>
          )}
        </TabsContent>

        <TabsContent value="control" className="mt-6">
          <ControlPanelView siteId={siteId} canCommand={roleInfo.role === "owner" || roleInfo.role === "admin" || roleInfo.role === "operator"} />
        </TabsContent>



        <TabsContent value="charts" className="mt-6 space-y-6">
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 shadow-elevated">
            <div className="border-b border-border/60 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
                    <LineChart className="h-3.5 w-3.5" strokeWidth={2.6} /> Telemetría real
                  </div>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight">Charts corregidos y estabilizados</h2>
                  <p className="mt-1 text-sm text-muted-foreground">La ventana temporal ahora coincide con el rango visible y la serie de red usa potencia estimada, no voltaje.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[540px] xl:grid-cols-4">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rango</div>
                    <div className="inline-flex w-full overflow-hidden rounded-xl border bg-background">
                      {(["3h", "12h", "24h"] as const).map((range) => (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setChartWindow(range)}
                          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${chartWindow === range ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resolución</div>
                    <div className="inline-flex w-full overflow-hidden rounded-xl border bg-background">
                      {([
                        ["raw", "Raw"],
                        ["5m", "5m"],
                        ["15m", "15m"],
                        ["1h", "1h"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setChartResolution(value)}
                          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${chartResolution === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suavizado</div>
                    <div className="inline-flex w-full overflow-hidden rounded-xl border bg-background">
                      {(["off", "mean", "median"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSmoothMode(m)}
                          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${smoothMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {m === "off" ? "Off" : m === "mean" ? "Media" : "Mediana"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Ventana filtro</span>
                      <span className="font-mono normal-case">{smoothWindow} pts</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={30}
                      step={1}
                      value={smoothWindow}
                      disabled={smoothMode === "off"}
                      onChange={(e) => setSmoothWindow(Number(e.target.value))}
                      className="w-full accent-primary disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 xl:grid-cols-5 sm:px-6">
              <QuickKpi label="Pico solar" value={`${Math.round(chartStats.peakPv).toLocaleString("es-CL")} W`} accent="var(--solar)" />
              <QuickKpi label="Pico consumo" value={`${Math.round(chartStats.peakLoad).toLocaleString("es-CL")} W`} accent="var(--load)" />
              <QuickKpi label="Carga media" value={`${Math.round(chartStats.avgLoad).toLocaleString("es-CL")} W`} accent="var(--primary)" />
              <QuickKpi label="Red media" value={`${Math.round(chartStats.gridUseAvg).toLocaleString("es-CL")} W`} accent="var(--grid)" />
              <QuickKpi label="Autosuministro" value={`${chartStats.selfSupply.toFixed(0)} %`} accent="var(--success)" />
            </div>
          </div>

          <ChartCard title={`Potencias reales — ${chartWindow}`}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gPv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--solar)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--solar)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gLoad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--load)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--load)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gGrid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--grid)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--grid)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="t" tickFormatter={(v) => format(new Date(v), chartWindow === "24h" ? "dd HH:mm" : "HH:mm")} fontSize={11} minTickGap={24} />
              <YAxis fontSize={11} unit=" W" />
              <Tooltip labelFormatter={(v) => format(new Date(v as number), "dd/MM HH:mm")} formatter={(value) => [`${Math.round(Number(value ?? 0)).toLocaleString("es-CL")} W`, ""]} />
              <Legend />
              <Area type="monotone" dataKey="pv" name="Solar" stroke="var(--solar)" fill="url(#gPv)" strokeWidth={2.2} />
              <Area type="monotone" dataKey="load" name="Consumo" stroke="var(--load)" fill="url(#gLoad)" strokeWidth={2.2} />
              <Area type="monotone" dataKey="grid" name="Red estimada" stroke="var(--grid)" fill="url(#gGrid)" strokeWidth={2} />
            </AreaChart>
          </ChartCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Batería — carga / descarga (W)">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="t" tickFormatter={(v) => format(new Date(v), chartWindow === "24h" ? "dd HH:mm" : "HH:mm")} fontSize={11} minTickGap={24} />
                <YAxis fontSize={11} unit=" W" />
                <Tooltip labelFormatter={(v) => format(new Date(v as number), "dd/MM HH:mm")} />
                <Legend />
                <Area type="monotone" dataKey="batteryDischarge" name="Descarga" stroke="var(--battery)" fill="var(--battery)" fillOpacity={0.22} strokeWidth={2.2} />
                <Area type="monotone" dataKey="batteryCharge" name="Carga" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.18} strokeWidth={2.2} />
              </AreaChart>
            </ChartCard>

            <ChartCard title="Estado de batería y cobertura solar">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="t" tickFormatter={(v) => format(new Date(v), chartWindow === "24h" ? "dd HH:mm" : "HH:mm")} fontSize={11} minTickGap={24} />
                <YAxis yAxisId="left" domain={[0, 100]} fontSize={11} unit=" %" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} fontSize={11} unit=" %" />
                <Tooltip labelFormatter={(v) => format(new Date(v as number), "dd/MM HH:mm")} />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="soc" name="SOC batería" stroke="var(--battery)" fill="var(--battery)" fillOpacity={0.18} strokeWidth={2.2} />
                <Area yAxisId="right" type="monotone" dataKey="solarShare" name="Cobertura solar" stroke="var(--success)" fill="var(--success)" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ChartCard>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b px-4 py-3 text-sm font-semibold">Últimos puntos procesados</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Hora</th>
                    <th className="px-4 py-3 font-medium">Solar</th>
                    <th className="px-4 py-3 font-medium">Consumo</th>
                    <th className="px-4 py-3 font-medium">Red</th>
                    <th className="px-4 py-3 font-medium">Bat. carga</th>
                    <th className="px-4 py-3 font-medium">Bat. descarga</th>
                    <th className="px-4 py-3 font-medium">SOC</th>
                    <th className="px-4 py-3 font-medium">Cobertura solar</th>
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].slice(-18).reverse().map((point) => (
                    <tr key={point.t} className="border-t border-border/60">
                      <td className="px-4 py-3 font-mono text-xs">{format(new Date(point.t), "dd/MM HH:mm")}</td>
                      <td className="px-4 py-3">{Math.round(point.pv).toLocaleString("es-CL")} W</td>
                      <td className="px-4 py-3">{Math.round(point.load).toLocaleString("es-CL")} W</td>
                      <td className="px-4 py-3">{Math.round(point.grid).toLocaleString("es-CL")} W</td>
                      <td className="px-4 py-3">{Math.round(point.batteryCharge).toLocaleString("es-CL")} W</td>
                      <td className="px-4 py-3">{Math.round(point.batteryDischarge).toLocaleString("es-CL")} W</td>
                      <td className="px-4 py-3">{point.soc.toFixed(1)} %</td>
                      <td className="px-4 py-3">{point.solarShare.toFixed(0)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {chartData.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Sin datos suficientes en la ventana seleccionada.</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="totals" className="mt-6 space-y-6">
          <ProductionHistoryCompare
            siteId={siteId}
            kwp={pvForCompare?.array_kwp ?? null}
            lossesPct={pvForCompare?.system_losses_pct ?? null}
            lat={pvForCompare?.latitude ?? null}
            lon={pvForCompare?.longitude ?? null}
            manualCalibration={pvForCompare?.manual_calibration ?? null}
          />

          <TotalsPeriodView siteId={siteId} totals={totals} />
        </TabsContent>

        <TabsContent value="savings" className="mt-6">
          <SavingsTabView siteId={siteId} canEdit={roleInfo.role === "owner" || roleInfo.role === "admin"} />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          {user ? (
            <NotificationsConfig siteId={siteId} userId={user.id} />
          ) : (
            <p className="text-sm text-muted-foreground">Inicia sesión para configurar alertas.</p>
          )}
        </TabsContent>

        {roleInfo.role !== "viewer" && (
          <TabsContent value="config" className="mt-6 space-y-6">
            <ConfigurationView site={site} subTab={configSubTab} onSubTabChange={setConfigSubTab} role={roleInfo.role} />
          </TabsContent>
        )}
      </Tabs>
        </div>
      </div>
      <MobileBottomNav value={tab} onChange={setTab} hideTabs={roleInfo.role === "viewer" ? ["config"] : []} />
    </>
  );
}

/* ---------------- Control panel (Quick actions + Command status) ---------------- */

function ControlPanelView({ siteId, canCommand }: { siteId: string; canCommand: boolean }) {
  const { config } = useQuickActionsConfig(siteId);
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-accent/10 via-card to-card p-6 shadow-elevated sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Zap className="h-3.5 w-3.5" strokeWidth={2.6} /> Centro de control
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Comandos del inversor</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Aplica cambios remotos al inversor y haz seguimiento del estado de cada comando enviado en tiempo real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <QuickActions siteId={siteId} config={config} readOnly={!canCommand} />
        </div>
        <div className="xl:col-span-1">
          <CommandStatusFeed siteId={siteId} limit={12} />
        </div>
      </div>
    </div>
  );
}


/* ---------------- Totals view with period selector ---------------- */

type TotalsPeriod = "day" | "week" | "month" | "year";

function TotalsPeriodView({ siteId, totals }: { siteId: string; totals: DailyTotal[] }) {
  const [period, setPeriod] = useState<TotalsPeriod>("week");
  const [monthly, setMonthly] = useState<DailyTotal[] | null>(null);
  const [loadingYear, setLoadingYear] = useState(false);

  useEffect(() => {
    if (period !== "year") return;
    let alive = true;
    setLoadingYear(true);
    (async () => {
      // Pull last 365 days of daily_totals and aggregate by month.
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data } = await supabase
        .from("daily_totals")
        .select("day, pv_kwh, load_kwh, grid_used_kwh, battery_charged_kwh, battery_discharged_kwh")
        .eq("site_id", siteId)
        .gte("day", since.toISOString().slice(0, 10))
        .order("day", { ascending: true });
      if (!alive) return;
      const buckets = new Map<string, DailyTotal>();
      for (const r of (data ?? []) as DailyTotal[]) {
        const month = r.day.slice(0, 7);
        const acc = buckets.get(month) ?? { day: month, pv_kwh: 0, load_kwh: 0, grid_used_kwh: 0, battery_charged_kwh: 0, battery_discharged_kwh: 0 };
        acc.pv_kwh += Number(r.pv_kwh) || 0;
        acc.load_kwh += Number(r.load_kwh) || 0;
        acc.grid_used_kwh += Number(r.grid_used_kwh) || 0;
        acc.battery_charged_kwh += Number(r.battery_charged_kwh) || 0;
        acc.battery_discharged_kwh += Number(r.battery_discharged_kwh) || 0;
        buckets.set(month, acc);
      }
      setMonthly(Array.from(buckets.values()));
      setLoadingYear(false);
    })();
    return () => { alive = false; };
  }, [period, siteId]);

  const data = useMemo(() => {
    if (period === "day") return totals.slice(-1);
    if (period === "week") return totals.slice(-7);
    if (period === "month") return totals.slice(-30);
    return monthly ?? [];
  }, [period, totals, monthly]);

  const xKey = "day";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Periodo:</span>
        <div className="inline-flex overflow-hidden rounded-md border">
          {(["day", "week", "month", "year"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs transition-colors ${period === p ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {p === "day" ? "Día" : p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
        {period === "year" && loadingYear && <span className="text-xs text-muted-foreground">Cargando…</span>}
      </div>

      <ChartCard title={period === "year" ? "Energía mensual (kWh)" : "Energía diaria (kWh)"}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey={xKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="pv_kwh" name="Solar" stroke="var(--solar)" fill="var(--solar)" fillOpacity={0.2} />
          <Area type="monotone" dataKey="load_kwh" name="Load" stroke="var(--load)" fill="var(--load)" fillOpacity={0.2} />
          <Area type="monotone" dataKey="grid_used_kwh" name="Grid" stroke="var(--grid)" fill="var(--grid)" fillOpacity={0.2} />
          <Area type="monotone" dataKey="battery_discharged_kwh" name="Batería descargada" stroke="var(--battery)" fill="var(--battery)" fillOpacity={0.2} />
          <Area type="monotone" dataKey="battery_charged_kwh" name="Batería cargada" stroke="hsl(142 60% 35%)" fill="hsl(142 60% 35%)" fillOpacity={0.15} />
        </AreaChart>
      </ChartCard>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">{period === "year" ? "Mes" : "Día"}</th>
              <th className="px-4 py-3 font-medium">PV</th>
              <th className="px-4 py-3 font-medium">Carga</th>
              <th className="px-4 py-3 font-medium">Red</th>
              <th className="px-4 py-3 font-medium">Bat. carga</th>
              <th className="px-4 py-3 font-medium">Bat. desc.</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{d.day}</td>
                <td className="px-4 py-3">{Number(d.pv_kwh).toFixed(2)} kWh</td>
                <td className="px-4 py-3">{Number(d.load_kwh).toFixed(2)} kWh</td>
                <td className="px-4 py-3">{Number(d.grid_used_kwh).toFixed(2)} kWh</td>
                <td className="px-4 py-3">{Number(d.battery_charged_kwh).toFixed(2)} kWh</td>
                <td className="px-4 py-3">{Number(d.battery_discharged_kwh).toFixed(2)} kWh</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Sin datos para este periodo.</p>}
      </div>
    </>
  );
}

interface InverterSpec {
  driver: string | null; model_name: string | null; serial_number: string | null;
  firmware: string | null; topology: string | null; machine_type: string | null;
  nominal_battery_voltage: number | null; expected_ac_input_voltage: number | null;
  max_ac_input_current: number | null; max_ac_output_current: number | null;
  max_ac_output_power: number | null; max_ac_output_apparent_power: number | null;
  max_ac_charge_current: number | null; max_charge_current: number | null;
  output_source_priority: string | null; charger_source_priority: string | null;
  battery_type: string | null; input_voltage_range: string | null;
  raw: { qpiri?: string[]; [k: string]: unknown } | null;
  updated_at: string;
}

// Etiquetas legibles para los 25 campos típicos del QPIRI (Voltronic / PIPxx-MS).
// Cualquier índice no listado se muestra como "QPIRI[i]" con el valor crudo.
const QPIRI_LABELS: Record<number, { label: string; unit?: string; map?: Record<string, string> }> = {
  0: { label: "Voltaje AC nominal entrada", unit: "V" },
  1: { label: "Corriente AC nominal entrada", unit: "A" },
  2: { label: "Voltaje AC nominal salida", unit: "V" },
  3: { label: "Frecuencia AC nominal salida", unit: "Hz" },
  4: { label: "Corriente AC nominal salida", unit: "A" },
  5: { label: "Potencia aparente AC salida", unit: "VA" },
  6: { label: "Potencia activa AC salida", unit: "W" },
  7: { label: "Voltaje nominal batería", unit: "V" },
  8: { label: "Voltaje re-carga batería", unit: "V" },
  9: { label: "Voltaje sub-tensión batería", unit: "V" },
  10: { label: "Voltaje de carga absorción (bulk)", unit: "V" },
  11: { label: "Voltaje de flotación", unit: "V" },
  12: {
    label: "Tipo de batería",
    map: { "0": "AGM", "1": "Flooded", "2": "User", "3": "Pylontech (LIB)" },
  },
  13: { label: "Max corriente carga AC", unit: "A" },
  14: { label: "Max corriente carga total", unit: "A" },
  15: {
    label: "Rango voltaje entrada",
    map: { "0": "Appliance (90-280V)", "1": "UPS (170-280V)" },
  },
  16: {
    label: "Prioridad de salida (POP)",
    map: { "00": "Utility", "01": "Solar", "02": "SBU" },
  },
  17: {
    label: "Prioridad de carga (PCP)",
    map: { "00": "Utility", "01": "Solar primero", "02": "Solar+Utility", "03": "Solo solar" },
  },
  18: { label: "Paralelo máx num" },
  19: { label: "Tipo de máquina", map: { "00": "Grid-tie", "01": "Off-grid", "10": "Hybrid" } },
  20: { label: "Topología", map: { "0": "Transformerless", "1": "Transformer" } },
  21: { label: "Modo de salida", map: { "0": "Single", "1": "Parallel", "2": "Phase 1 of 3", "3": "Phase 2 of 3", "4": "Phase 3 of 3" } },
  22: { label: "Voltaje re-descarga batería", unit: "V" },
  23: { label: "PV OK condition" },
  24: { label: "PV power balance" },
};

function formatQpiriRow(i: number, raw: string): { label: string; value: string } {
  const meta = QPIRI_LABELS[i];
  if (!meta) return { label: `QPIRI[${i}]`, value: raw };
  if (meta.map && meta.map[raw]) return { label: meta.label, value: `${meta.map[raw]} (${raw})` };
  if (meta.unit) return { label: meta.label, value: `${raw} ${meta.unit}` };
  return { label: meta.label, value: raw };
}

interface SyncMeta {
  agent_time?: string | null;
  last_sample_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  read_count?: number | null;
  error_count?: number | null;
}
interface DeviceSnapshot {
  ssid: string | null; ip_eth: string | null; ip_wlan: string | null;
  ip_public: string | null; internet_up: boolean | null;
  cpu_temp_c: number | null; storage_used_pct: number | null;
  storage_total_gb: number | null; usb_devices: number | null;
  usb_devices_list: string[] | null;
  board_model: string | null; agent_version: string | null;
  voltage_dips: number | null; updated_at: string;
  raw: { sync?: SyncMeta } | null;
}

interface DeviceCommand {
  id: string; command: string; payload: Record<string, unknown>;
  status: string; result: unknown; error: string | null;
  created_at: string; sent_at: string | null; acked_at: string | null;
}

function ConfigurationView({ site, subTab, onSubTabChange, role }: { site: Site; subTab: string; onSubTabChange: (v: string) => void; role: SiteRole | null }) {
  const canConfigure = role === "admin" || role === "owner";
  const canManageMembers = canConfigure;
  const [spec, setSpec] = useState<InverterSpec | null>(null);
  const [snap, setSnap] = useState<DeviceSnapshot | null>(null);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [lastSampleAt, setLastSampleAt] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? null });
    });
    refresh();
    const ch = supabase.channel(`cfg-${site.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inverter_specs", filter: `site_id=eq.${site.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_snapshots", filter: `site_id=eq.${site.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_commands", filter: `site_id=eq.${site.id}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_samples", filter: `site_id=eq.${site.id}` }, (p) => {
        setLastSampleAt((p.new as { recorded_at: string }).recorded_at);
      })
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  async function refresh() {
    const [{ data: sp }, { data: sn }, { data: cm }, { data: ts }] = await Promise.all([
      supabase.from("inverter_specs").select("*").eq("site_id", site.id).maybeSingle(),
      supabase.from("device_snapshots").select("*").eq("site_id", site.id).maybeSingle(),
      supabase.from("device_commands").select("*").eq("site_id", site.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("telemetry_samples").select("recorded_at").eq("site_id", site.id).order("recorded_at", { ascending: false }).limit(1),
    ]);
    setSpec(sp as InverterSpec | null);
    setSnap(sn as DeviceSnapshot | null);
    setCommands((cm ?? []) as DeviceCommand[]);
    setLastSampleAt((ts && ts[0]?.recorded_at) ?? null);
  }

  async function sendCommand(command: string, payload: Record<string, unknown>) {
    if (!user) return;
    const { error } = await supabase.from("device_commands").insert({
      site_id: site.id, command, payload: payload as never, created_by: user.id,
    });
    if (error) toast.error(error.message);
    else toast.success("Comando encolado — la Raspberry lo aplicará en breve");
  }

  const sync = snap?.raw?.sync ?? null;
  const agentSkewSec = sync?.agent_time ? Math.round((now - new Date(sync.agent_time).getTime()) / 1000) : null;
  const sampleAge = lastSampleAt ? Math.floor((now - new Date(lastSampleAt).getTime()) / 1000) : null;
  const seenAge = site.last_seen_at ? Math.floor((now - new Date(site.last_seen_at).getTime()) / 1000) : null;
  const fmtAge = (s: number | null) => s == null ? "—" : s < 60 ? `hace ${s}s` : s < 3600 ? `hace ${Math.floor(s/60)}m` : s < 86400 ? `hace ${Math.floor(s/3600)}h` : `hace ${Math.floor(s/86400)}d`;
  const liveBadge = sampleAge != null && sampleAge < 30
    ? <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">En vivo</span>
    : sampleAge != null && sampleAge < 300
    ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">Atrasado</span>
    : <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">Sin datos</span>;

  // Bounce operators away from admin-only subtabs
  useEffect(() => {
    if (!canConfigure && (subTab === "spec" || subTab === "pv" || subTab === "sharing" || subTab === "install")) {
      onSubTabChange("inverter");
    }
  }, [canConfigure, subTab, onSubTabChange]);

  return (
    <Tabs value={subTab} onValueChange={onSubTabChange} className="w-full">
      <TabsList className="flex w-full flex-wrap gap-1 rounded-full bg-muted/50 p-1 h-auto">
        <TabsTrigger value="inverter" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.2} />Inversor</TabsTrigger>
        {canConfigure && <TabsTrigger value="spec" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Cpu className="h-3.5 w-3.5" strokeWidth={2.2} />Especificaciones</TabsTrigger>}
        {canConfigure && <TabsTrigger value="pv" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Sun className="h-3.5 w-3.5" strokeWidth={2.2} />Sistema PV</TabsTrigger>}
        <TabsTrigger value="diagnostics" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Wifi className="h-3.5 w-3.5" strokeWidth={2.2} />Diagnóstico</TabsTrigger>
        {canManageMembers && <TabsTrigger value="sharing" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Share2 className="h-3.5 w-3.5" strokeWidth={2.2} />Compartir</TabsTrigger>}
        {canConfigure && <TabsTrigger value="install" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Download className="h-3.5 w-3.5" strokeWidth={2.2} />Instalación</TabsTrigger>}
      </TabsList>

      <TabsContent value="inverter" className="mt-6 space-y-4">
        <Section title="Configuración remota del inversor" icon={SlidersHorizontal}>
          <p className="mb-4 text-sm text-muted-foreground">
            Asistente paso a paso. Los valores iniciales se cargan desde el inversor (QPIRI). Cambia solo lo que necesites y aplícalo.
          </p>
          <InverterConfigWizard siteId={site.id} spec={spec} />

          <div className="mt-4">
            <CommandStatusFeed siteId={site.id} limit={8} />
          </div>

          <div className="mt-6">
            <QuickActionsConfigCard siteId={site.id} />
          </div>

          <div className="mt-6">
            <LockscreenLiveCard siteToken={site.device_token} siteName={site.name} />
          </div>

          <div className="mt-6">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Terminal className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.2} /> Últimos comandos</h4>
            {commands.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin comandos enviados todavía.</p>
            ) : (
              <div className="space-y-1.5">
                {commands.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs">
                    <div className="font-mono truncate">{c.command} {JSON.stringify(c.payload)}</div>
                    <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                      c.status === "done" ? "bg-success/15 text-success" :
                      c.status === "failed" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {c.status}{c.error ? ` — ${c.error}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </TabsContent>

      <TabsContent value="spec" className="mt-6 space-y-4">
        <Section title="Especificación del inversor" icon={Cpu}>
          {spec ? (
            <div className="space-y-5">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identificación</h4>
                <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                  <Row label="Driver" value={spec.driver ?? "—"} />
                  <Row label="Modelo" value={spec.model_name ?? "—"} />
                  <Row label="Número de serie" value={spec.serial_number ?? "—"} />
                  <Row label="Firmware" value={spec.firmware ?? "—"} />
                  <Row label="Topología" value={spec.topology ?? "—"} />
                  <Row label="Tipo de máquina" value={spec.machine_type ?? "—"} />
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eléctrico (QPIRI)</h4>
                <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                  <Row label="Voltaje nominal batería" value={spec.nominal_battery_voltage != null ? `${spec.nominal_battery_voltage} V` : "—"} />
                  <Row label="Voltaje AC esperado" value={spec.expected_ac_input_voltage != null ? `${spec.expected_ac_input_voltage} V` : "—"} />
                  <Row label="Max corriente AC entrada" value={spec.max_ac_input_current != null ? `${spec.max_ac_input_current} A` : "—"} />
                  <Row label="Max corriente AC salida" value={spec.max_ac_output_current != null ? `${spec.max_ac_output_current} A` : "—"} />
                  <Row label="Max potencia activa AC salida" value={spec.max_ac_output_power != null ? `${spec.max_ac_output_power} W` : "—"} />
                  <Row label="Max potencia aparente AC" value={spec.max_ac_output_apparent_power != null ? `${spec.max_ac_output_apparent_power} VA` : "—"} />
                  <Row label="Max corriente carga AC" value={spec.max_ac_charge_current != null ? `${spec.max_ac_charge_current} A` : "—"} />
                  <Row label="Max corriente carga total" value={spec.max_charge_current != null ? `${spec.max_charge_current} A` : "—"} />
                  <Row label="Tipo de batería" value={spec.battery_type ?? "—"} />
                  <Row label="Rango voltaje entrada" value={spec.input_voltage_range ?? "—"} />
                  <Row label="Prioridad de salida" value={spec.output_source_priority ?? "—"} />
                  <Row label="Prioridad de carga" value={spec.charger_source_priority ?? "—"} />
                </div>
              </div>

              {Array.isArray(spec.raw?.qpiri) && spec.raw!.qpiri!.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Respuesta QPIRI completa ({spec.raw!.qpiri!.length} campos)
                  </h4>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                    {spec.raw!.qpiri!.map((raw, i) => {
                      const { label, value } = formatQpiriRow(i, raw);
                      return (
                        <div key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/40 py-1 last:border-0">
                          <span className="text-xs text-muted-foreground">
                            <span className="font-mono text-[10px] opacity-60">[{i.toString().padStart(2, "0")}]</span> {label}
                          </span>
                          <span className="font-mono text-xs font-medium">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Row label="Última actualización" value={spec.updated_at ? new Date(spec.updated_at).toLocaleString() : "—"} />
            </div>
          ) : (
            <SectionSkeleton />
          )}
        </Section>
      </TabsContent>

      <TabsContent value="pv" className="mt-6 space-y-4">
        <PvSystemConfigCard
          siteId={site.id}
          maxAcOutputPower={spec?.max_ac_output_power ?? null}
          nominalBatteryV={spec?.nominal_battery_voltage ?? null}
        />
      </TabsContent>

      <TabsContent value="diagnostics" className="mt-6 space-y-4">
        <Section title="General" icon={Info}>
          <Row label="Site ID" value={site.id} />
          <Row label="Plan" value={site.plan} />
          <Row label="Estado" value={site.status} />
          <Row label="Licencia expira" value={site.license_expires_at ?? "—"} />
        </Section>

        <Section title="Sincronización end-to-end" icon={Wifi}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Telemetría:</span>
            {liveBadge}
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Row label="Último dato (telemetry)" value={`${lastSampleAt ? new Date(lastSampleAt).toLocaleString() : "—"} (${fmtAge(sampleAge)})`} />
            <Row label="Visto por la nube (last_seen)" value={`${site.last_seen_at ? new Date(site.last_seen_at).toLocaleString() : "—"} (${fmtAge(seenAge)})`} />
            <Row label="Reloj del agente" value={sync?.agent_time ? `${new Date(sync.agent_time).toLocaleString()}${agentSkewSec != null ? ` (desfase ${agentSkewSec >= 0 ? "+" : ""}${agentSkewSec}s)` : ""}` : "—"} />
            <Row label="Lecturas OK" value={sync?.read_count?.toString() ?? "—"} />
            <Row label="Errores totales" value={sync?.error_count?.toString() ?? "—"} />
            <Row label="Último error agente" value={sync?.last_error_at ? new Date(sync.last_error_at).toLocaleString() : "—"} />
          </div>
          {sync?.last_error ? (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs text-destructive whitespace-pre-wrap break-words">
              {sync.last_error}
            </div>
          ) : null}
        </Section>

        <Section title="Estado de red" icon={Wifi}>
          {snap ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              <Row label="SSID WiFi" value={snap.ssid ?? "—"} />
              <Row label="Internet" value={snap.internet_up ? "Conectado" : "Desconectado"} />
              <Row label="IP Ethernet" value={snap.ip_eth ?? "—"} />
              <Row label="IP WiFi" value={snap.ip_wlan ?? "—"} />
              <Row label="IP pública" value={snap.ip_public ?? "—"} />
            </div>
          ) : (
            <SectionSkeleton />
          )}
          {/* WiFi config siempre disponible — incluso si hay Ethernet con internet.
              Abre la página /wifi del agente en la IP local del equipo. */}
          <div className="mt-4 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Wifi className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.4} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Configurar WiFi del equipo</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Disponible siempre, esté conectado por Ethernet o no. Abre la página de configuración WiFi del agente desde tu red local.
                </p>
              </div>
              {(() => {
                const ip = snap?.ip_eth || snap?.ip_wlan;
                const href = ip ? `http://${ip}/wifi` : `http://solarops.local/wifi`;
                return (
                  <Button asChild size="sm" variant="outline" className="rounded-full">
                    <a href={href} target="_blank" rel="noreferrer">
                      <Wifi className="mr-1.5 h-3.5 w-3.5" /> Abrir WiFi
                    </a>
                  </Button>
                );
              })()}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tip: si no abre, conéctate al WiFi <span className="font-mono">Solar Torobyte</span> (contraseña por defecto <span className="font-mono">solartorobyte123</span>) y entra a <span className="font-mono">http://192.168.4.1/wifi</span>.
            </p>
          </div>
        </Section>

        <Section title="Sistema" icon={HardDrive}>
          {snap ? (
            <>
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                <Row label="Modelo de placa" value={snap.board_model ?? "—"} />
                <Row label="Versión del agente" value={snap.agent_version ?? "—"} />
                <Row label="Temperatura CPU" value={snap.cpu_temp_c ? `${snap.cpu_temp_c.toFixed(1)} °C` : "—"} />
                <Row label="Almacenamiento" value={
                  snap.storage_total_gb && snap.storage_used_pct != null
                    ? `${snap.storage_used_pct.toFixed(0)}% de ${snap.storage_total_gb.toFixed(0)} GB`
                    : "—"} />
                <Row label="Dispositivos USB" value={snap.usb_devices?.toString() ?? "—"} />
                <Row label="Caídas de voltaje USB" value={snap.voltage_dips?.toString() ?? "0"} />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold">Detecciones USB</div>
                {snap.usb_devices_list && snap.usb_devices_list.length > 0 ? (
                  <ul className="space-y-1 rounded-lg border bg-background p-3 font-mono text-xs">
                    {snap.usb_devices_list.map((d, i) => (
                      <li key={i} className="truncate">• {d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sin dispositivos USB detectados o el agente aún no envía la lista (actualiza a la última versión).
                  </p>
                )}
              </div>
            </>
          ) : (
            <SectionSkeleton />
          )}
        </Section>
      </TabsContent>

      <TabsContent value="sharing" className="mt-6 space-y-4">
        <Section title="Compartir sitio" icon={Share2}>
          <SiteSharing siteId={site.id} isOwnerOrAdmin={canManageMembers} />
        </Section>
      </TabsContent>

      <TabsContent value="install" className="mt-6 space-y-4">
        <Section title="Instalación del dispositivo" icon={Download}>
          <p className="mb-3 text-sm text-muted-foreground">
            Ejecuta esto en tu Raspberry Pi para instalar el agente y vincularlo a este sitio:
          </p>
          <CodeBlock value={`curl -fsSL https://solarops.local/install.sh | sudo bash -s -- --token ${site.device_token}`} />
          <p className="mt-2 text-xs text-muted-foreground">El token identifica este dispositivo. No lo compartas.</p>
        </Section>
      </TabsContent>
    </Tabs>
  );
}



function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function QuickKpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  );
}

/* ---------------- Inverter-style dashboard ---------------- */

function Section({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: typeof Cpu }) {
  return (
    <div className="dashboard-card p-3 sm:p-4 animate-fade-up">
      <div className="mb-2.5 flex items-center gap-2">
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 text-accent ring-1 ring-accent/20">
            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
          </div>
        )}
        <h3 className="text-sm font-semibold tracking-tight sm:text-base">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0 text-xs sm:flex-row sm:justify-between sm:gap-2 sm:text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono break-all sm:text-right">{value}</span>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 font-mono text-xs">
      <code className="flex-1 break-all">{value}</code>
      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(value); toast.success(t("common.copied")); }}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
