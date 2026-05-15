import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, Battery, Sun, Plug, Cpu, AlertCircle, LayoutDashboard, LineChart, Calculator, Settings2, Info, Wifi, HardDrive, Terminal, SlidersHorizontal, Download, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { SolarForecastWidget } from "@/components/SolarForecastWidget";
import { EnergyFlowDiagram } from "@/components/EnergyFlowDiagram";
import { PowerGauges } from "@/components/PowerGauges";
import { Battery3D, SolarRays, GridSineWave, ConcentricRings, SolarPanelsViz, HouseLoadViz, BackupTimeCard } from "@/components/AdvancedVisuals";
import { DashboardGrid, useDashboardLayout, type WidgetDef } from "@/components/DashboardCustomizer";
import { PvSystemConfigCard, usePvConfig } from "@/components/PvSystemConfig";
import { DeviceSelector, useDevices, type Device } from "@/components/DeviceManager";
import { NotificationsConfig } from "@/components/NotificationsConfig";
import { useNotificationWatcher } from "@/lib/notifications";
import { useAuth } from "@/lib/auth";
import { BellRing } from "lucide-react";
import { MobileBottomNav, type SiteTab } from "@/components/MobileBottomNav";
import { PageHeaderSkeleton, DashboardSkeleton, SectionSkeleton } from "@/components/LoadingStates";
import { InverterConfigWizard } from "@/components/InverterConfigWizard";

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
    "battery_voltage", "grid_voltage", "inverter_mode",
  ];
  const merged: Sample = { ...next };
  for (const k of keys) {
    if (next[k] == null && prev[k] != null) {
      (merged as unknown as Record<string, unknown>)[k as string] = prev[k];
    }
  }
  return merged;
}

/* ---------------- Chart smoothing ---------------- */
type SeriesPoint = { t: number; pv: number | null; load: number | null; soc: number | null; grid: number | null };

function smoothSeries(
  data: SeriesPoint[],
  mode: "off" | "mean" | "median",
  window: number,
): Array<{ t: number; pv: number; load: number; soc: number; grid: number }> {
  if (mode === "off" || window <= 1) {
    return data.map((p) => ({
      t: p.t,
      pv: p.pv ?? 0,
      load: p.load ?? 0,
      soc: p.soc ?? 0,
      grid: p.grid ?? 0,
    }));
  }
  const keys: ("pv" | "load" | "soc" | "grid")[] = ["pv", "load", "soc", "grid"];
  const out = data.map((p) => ({ t: p.t, pv: 0, load: 0, soc: 0, grid: 0 }));
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
  const { devices, selected: selectedDevice } = useDevices(siteId);
  const [site, setSite] = useState<Site | null>(null);
  const [latest, setLatest] = useState<Sample | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [totals, setTotals] = useState<DailyTotal[]>([]);
  const [tab, setTab] = useState<SiteTab>("dashboard");

  useNotificationWatcher(siteId, user?.id);

  // device_id NULL on a row = legacy / primary device. So when the
  // selected device is the primary one, accept rows whose device_id
  // matches OR is NULL. Otherwise filter strictly to that device.
  const deviceFilter = useMemo(() => {
    if (!selectedDevice) return null;
    if (selectedDevice.is_primary) {
      return `device_id.eq.${selectedDevice.id},device_id.is.null`;
    }
    return null; // non-primary handled with .eq below
  }, [selectedDevice]);

  function applyDeviceFilter<T extends { eq: (col: string, v: unknown) => T; or: (q: string) => T }>(q: T): T {
    if (!selectedDevice) return q;
    if (selectedDevice.is_primary && deviceFilter) return q.or(deviceFilter);
    return q.eq("device_id", selectedDevice.id);
  }

  async function load() {
    const { data: s } = await supabase.from("sites").select("*").eq("id", siteId).maybeSingle();
    setSite(s as Site | null);

    let tq = supabase
      .from("telemetry_samples")
      .select("recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, grid_voltage, inverter_mode, device_id")
      .eq("site_id", siteId);
    tq = applyDeviceFilter(tq as never) as never;
    const { data: t } = await tq.order("recorded_at", { ascending: false }).limit(720);
    const rows = (t ?? []).reverse() as Sample[];
    setHistory(rows);
    setLatest(rows.length ? rows[rows.length - 1] : null);

    const { data: dt } = await supabase
      .from("daily_totals")
      .select("day, pv_kwh, load_kwh, grid_used_kwh, battery_charged_kwh, battery_discharged_kwh")
      .eq("site_id", siteId)
      .order("day", { ascending: false })
      .limit(30);
    setTotals(((dt ?? []) as DailyTotal[]).reverse());
  }

  useEffect(() => {
    if (!selectedDevice) return;
    let alive = true;
    load();

    // Unique channel name per effect run prevents reuse of an already-
    // subscribed channel object (which silently fails to re-subscribe).
    const chanName = `site-${siteId}-${selectedDevice.id}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(chanName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_samples", filter: `site_id=eq.${siteId}` },
        (payload) => {
          if (!alive) return;
          const row = payload.new as Sample & { device_id: string | null };
          const matches = selectedDevice.is_primary
            ? (row.device_id === selectedDevice.id || row.device_id == null)
            : row.device_id === selectedDevice.id;
          if (!matches) return;
          setLatest((prev) => mergeSample(prev, row));
          setHistory((h) => (h.length && h[h.length - 1].recorded_at === row.recorded_at) ? h : [...h.slice(-719), row]);
        })
      .subscribe();

    // Polling fallback (websocket may be dropped by mobile / corp proxies).
    async function poll() {
      let q = supabase
        .from("telemetry_samples")
        .select("recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, grid_voltage, inverter_mode, device_id")
        .eq("site_id", siteId);
      q = applyDeviceFilter(q as never) as never;
      const { data } = await q.order("recorded_at", { ascending: false }).limit(1);
      if (!alive) return;
      const row = (data && data[0]) as Sample | undefined;
      if (!row) return;
      setLatest((prev) => {
        if (prev && prev.recorded_at === row.recorded_at) return prev;
        setHistory((h) => (h.length && h[h.length - 1].recorded_at === row.recorded_at) ? h : [...h.slice(-719), row]);
        return mergeSample(prev, row);
      });
    }
    const pollId = setInterval(poll, 1000);
    return () => { alive = false; supabase.removeChannel(channel); clearInterval(pollId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, selectedDevice?.id, selectedDevice?.is_primary]);

  // Persisted smoothing options (per-browser).
  const [smoothMode, setSmoothMode] = useState<"off" | "mean" | "median">(
    () => (typeof localStorage !== "undefined" && (localStorage.getItem("chart.smoothMode") as "off" | "mean" | "median")) || "off",
  );
  const [smoothWindow, setSmoothWindow] = useState<number>(
    () => (typeof localStorage !== "undefined" && Number(localStorage.getItem("chart.smoothWindow"))) || 5,
  );
  useEffect(() => { localStorage.setItem("chart.smoothMode", smoothMode); }, [smoothMode]);
  useEffect(() => { localStorage.setItem("chart.smoothWindow", String(smoothWindow)); }, [smoothWindow]);

  const rawChartData = useMemo(() => history.map((r) => ({
    t: new Date(r.recorded_at).getTime(),
    pv: r.pv_input_power == null ? null : Number(r.pv_input_power),
    load: r.ac_output_active_power == null ? null : Number(r.ac_output_active_power),
    soc: r.battery_capacity == null ? null : Number(r.battery_capacity),
    grid: r.grid_voltage == null ? null : Number(r.grid_voltage),
  })), [history]);

  const chartData = useMemo(
    () => smoothSeries(rawChartData, smoothMode, smoothWindow),
    [rawChartData, smoothMode, smoothWindow],
  );

  if (!site) return <SiteDetailSkeleton />;

  return (
    <>
      <Link to="/app" className="group mb-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.4} /> Back to sites
      </Link>

      <div className="mb-4 flex items-center justify-between gap-3 animate-fade-up">
        <div className="min-w-0 flex-1">
          <InlineSiteName site={site} onRenamed={(name) => setSite((s) => s ? { ...s, name } : s)} />
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedDevice?.name ?? site.inverter_model ?? "Inverter not yet detected"} · <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${site.status === "online" ? "bg-success/15 text-success" : site.status === "offline" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>● {site.status}</span>
          </p>
        </div>
      </div>

      <div className="mb-6">
        <DeviceSelector siteId={siteId} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SiteTab)} className="pb-24 md:pb-0">
        <TabsList className="hidden h-11 rounded-full bg-muted/60 p-1 md:inline-flex">
          <TabsTrigger value="dashboard" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LayoutDashboard className="h-3.5 w-3.5" strokeWidth={2.2} />Dashboard</TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><LineChart className="h-3.5 w-3.5" strokeWidth={2.2} />Charts</TabsTrigger>
          <TabsTrigger value="totals" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Calculator className="h-3.5 w-3.5" strokeWidth={2.2} />Totals</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><BellRing className="h-3.5 w-3.5" strokeWidth={2.2} />Alertas</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 rounded-full px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Settings2 className="h-3.5 w-3.5" strokeWidth={2.2} />Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardView latest={latest} siteId={siteId} spec={null} device={selectedDevice} />
          {!latest && (
            <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Esperando la primera muestra de {selectedDevice?.name ?? "tu inversor"}…
            </div>
          )}
        </TabsContent>

        <TabsContent value="charts" className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/60 p-3 text-sm">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Suavizado</span>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border">
              {(["off", "mean", "median"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSmoothMode(m)}
                  className={`px-3 py-1 text-xs transition-colors ${smoothMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  {m === "off" ? "Sin filtro" : m === "mean" ? "Promedio móvil" : "Mediana"}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Ventana</label>
              <input
                type="range" min={2} max={30} step={1}
                value={smoothWindow}
                disabled={smoothMode === "off"}
                onChange={(e) => setSmoothWindow(Number(e.target.value))}
                className="w-32 accent-primary disabled:opacity-40"
              />
              <span className="w-12 text-right font-mono text-xs tabular-nums">{smoothWindow} pts</span>
            </div>
          </div>
          <ChartCard title="Power (W) — last 12h">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gPv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--solar, 45 100% 50%))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--solar, 45 100% 50%))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gLoad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--load, 200 90% 55%))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--load, 200 90% 55%))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" tickFormatter={(v) => format(new Date(v), "HH:mm")} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip labelFormatter={(v) => format(new Date(v as number), "PP HH:mm")} />
              <Legend />
              <Area type="monotone" dataKey="pv" name="Solar" stroke="var(--solar)" fill="url(#gPv)" />
              <Area type="monotone" dataKey="load" name="Load" stroke="var(--load)" fill="url(#gLoad)" />
            </AreaChart>
          </ChartCard>

          <ChartCard title="Battery SOC (%) — last 12h">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" tickFormatter={(v) => format(new Date(v), "HH:mm")} fontSize={11} />
              <YAxis domain={[0, 100]} fontSize={11} />
              <Tooltip labelFormatter={(v) => format(new Date(v as number), "PP HH:mm")} />
              <Area type="monotone" dataKey="soc" stroke="var(--battery)" fill="var(--battery)" fillOpacity={0.2} />
            </AreaChart>
          </ChartCard>
        </TabsContent>

        <TabsContent value="totals" className="mt-6 space-y-6">
          <ChartCard title="Daily energy (kWh)">
            <AreaChart data={totals}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="pv_kwh" name="Solar" stroke="var(--solar)" fill="var(--solar)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="load_kwh" name="Load" stroke="var(--load)" fill="var(--load)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="grid_used_kwh" name="Grid" stroke="var(--grid)" fill="var(--grid)" fillOpacity={0.2} />
            </AreaChart>
          </ChartCard>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Day</th>
                  <th className="px-4 py-3 font-medium">PV</th>
                  <th className="px-4 py-3 font-medium">Load</th>
                  <th className="px-4 py-3 font-medium">Grid</th>
                  <th className="px-4 py-3 font-medium">Battery in</th>
                  <th className="px-4 py-3 font-medium">Battery out</th>
                </tr>
              </thead>
              <tbody>
                {[...totals].reverse().map((d) => (
                  <tr key={d.day} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{d.day}</td>
                    <td className="px-4 py-3">{d.pv_kwh.toFixed(2)} kWh</td>
                    <td className="px-4 py-3">{d.load_kwh.toFixed(2)} kWh</td>
                    <td className="px-4 py-3">{d.grid_used_kwh.toFixed(2)} kWh</td>
                    <td className="px-4 py-3">{d.battery_charged_kwh.toFixed(2)} kWh</td>
                    <td className="px-4 py-3">{d.battery_discharged_kwh.toFixed(2)} kWh</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totals.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No daily data yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          {user ? (
            <NotificationsConfig siteId={siteId} userId={user.id} />
          ) : (
            <p className="text-sm text-muted-foreground">Inicia sesión para configurar alertas.</p>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-6 space-y-6">
          <ConfigurationView site={site} />
        </TabsContent>
      </Tabs>
      <MobileBottomNav value={tab} onChange={setTab} />
    </>
  );
}

/* ---------------- Configuration tab ---------------- */

interface InverterSpec {
  driver: string | null; model_name: string | null; serial_number: string | null;
  firmware: string | null; topology: string | null; machine_type: string | null;
  nominal_battery_voltage: number | null; expected_ac_input_voltage: number | null;
  max_ac_input_current: number | null; max_ac_output_current: number | null;
  max_ac_output_power: number | null; max_ac_output_apparent_power: number | null;
  updated_at: string;
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

function ConfigurationView({ site }: { site: Site }) {
  const [spec, setSpec] = useState<InverterSpec | null>(null);
  const [snap, setSnap] = useState<DeviceSnapshot | null>(null);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? null });
    });
    refresh();
    const ch = supabase.channel(`cfg-${site.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inverter_specs", filter: `site_id=eq.${site.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_snapshots", filter: `site_id=eq.${site.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_commands", filter: `site_id=eq.${site.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  async function refresh() {
    const [{ data: sp }, { data: sn }, { data: cm }] = await Promise.all([
      supabase.from("inverter_specs").select("*").eq("site_id", site.id).maybeSingle(),
      supabase.from("device_snapshots").select("*").eq("site_id", site.id).maybeSingle(),
      supabase.from("device_commands").select("*").eq("site_id", site.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setSpec(sp as InverterSpec | null);
    setSnap(sn as DeviceSnapshot | null);
    setCommands((cm ?? []) as DeviceCommand[]);
  }

  async function sendCommand(command: string, payload: Record<string, unknown>) {
    if (!user) return;
    const { error } = await supabase.from("device_commands").insert({
      site_id: site.id, command, payload: payload as never, created_by: user.id,
    });
    if (error) toast.error(error.message);
    else toast.success("Comando encolado — la Raspberry lo aplicará en breve");
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <Section title="General" icon={Info}>
        <Row label="Site ID" value={site.id} />
        <Row label="Plan" value={site.plan} />
        <Row label="Estado" value={site.status} />
        <Row label="Licencia expira" value={site.license_expires_at ?? "—"} />
      </Section>

      <Section title="Especificación del inversor" icon={Cpu}>
        {spec ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Row label="Driver" value={spec.driver ?? "—"} />
            <Row label="Modelo" value={spec.model_name ?? "—"} />
            <Row label="Número de serie" value={spec.serial_number ?? "—"} />
            <Row label="Firmware" value={spec.firmware ?? "—"} />
            <Row label="Topología" value={spec.topology ?? "—"} />
            <Row label="Tipo de máquina" value={spec.machine_type ?? "—"} />
            <Row label="Voltaje nominal batería" value={spec.nominal_battery_voltage ? `${spec.nominal_battery_voltage} V` : "—"} />
            <Row label="Voltaje AC esperado" value={spec.expected_ac_input_voltage ? `${spec.expected_ac_input_voltage} V` : "—"} />
            <Row label="Max corriente AC entrada" value={spec.max_ac_input_current ? `${spec.max_ac_input_current} A` : "—"} />
            <Row label="Max corriente AC salida" value={spec.max_ac_output_current ? `${spec.max_ac_output_current} A` : "—"} />
            <Row label="Max potencia AC salida" value={spec.max_ac_output_power ? `${spec.max_ac_output_power} W` : "—"} />
            <Row label="Max potencia aparente AC" value={spec.max_ac_output_apparent_power ? `${spec.max_ac_output_apparent_power} VA` : "—"} />
          </div>
        ) : (
          <SectionSkeleton />
        )}
      </Section>

      <PvSystemConfigCard
        siteId={site.id}
        maxAcOutputPower={spec?.max_ac_output_power ?? null}
        nominalBatteryV={spec?.nominal_battery_voltage ?? null}
      />

      <Section title="Configuración remota del inversor" icon={SlidersHorizontal}>
        <p className="mb-4 text-sm text-muted-foreground">
          Asistente paso a paso. Los cambios se envían a la Raspberry y se aplican al inversor mediante comandos Voltronic.
        </p>
        <InverterConfigWizard siteId={site.id} />

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

      <Section title="Instalación del dispositivo" icon={Download}>
        <p className="mb-3 text-sm text-muted-foreground">
          Ejecuta esto en tu Raspberry Pi para instalar el agente y vincularlo a este sitio:
        </p>
        <CodeBlock value={`curl -fsSL https://solarops.local/install.sh | sudo bash -s -- --token ${site.device_token}`} />
        <p className="mt-2 text-xs text-muted-foreground">El token identifica este dispositivo. No lo compartas.</p>
      </Section>
    </div>
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

/* ---------------- Inverter-style dashboard ---------------- */

// QMOD codes for Voltronic / Axpert / MPP-Solar inverters.
// Source: Voltronic protocol manuals (Axpert, PIP-MS, PIP-HS, InfiniSolar).
const INVERTER_MODE_LABELS: Record<string, string> = {
  P: "Encendido (Power On)",
  S: "Standby",
  L: "Modo Red (Línea)",
  B: "Modo Batería",
  F: "Fallo",
  H: "Ahorro de energía (ECO)",
  D: "Apagado",
  Y: "Bypass",
  G: "Conectado a red (Grid-tie)",
  C: "Cargando",
  E: "ECO",
  T: "Test / Mantenimiento",
};

function formatInverterMode(raw: string | null | undefined): { label: string; code: string } {
  if (!raw) return { label: "—", code: "" };
  // Keep only the first ASCII letter — strips CRC/replacement chars from old samples.
  const code = raw.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  if (!code) return { label: "—", code: "" };
  return { label: INVERTER_MODE_LABELS[code] ?? `Modo ${code} (desconocido)`, code };
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: "mode", label: "Modo del inversor" },
  { id: "icons", label: "Tarjetas resumen" },
  { id: "backup", label: "Tiempo de respaldo" },
  { id: "rings", label: "Anillos concéntricos" },
  { id: "gauges", label: "Medidores radiales" },
  { id: "battery3d", label: "Batería 3D animada" },
  { id: "solarcell", label: "Paneles solares animados" },
  { id: "loadcell", label: "Casa — consumo animado" },
  { id: "solarrays", label: "Sol radiante" },
  { id: "gridwave", label: "Onda sinusoidal de red" },
  { id: "flow", label: "Diagrama de flujo de energía" },
  { id: "forecast", label: "Previsión solar y producción" },
];

function DashboardView({ latest, siteId, spec: _spec, device: _device }: { latest: Sample | null; siteId: string; spec: InverterSpec | null; device: Device | null }) {
  const { t } = useI18n();
  const { state, persist } = useDashboardLayout(siteId, WIDGET_DEFS);
  const { config: pv } = usePvConfig(siteId);
  const pv_W = Number(latest?.pv_input_power ?? 0);
  const load = Number(latest?.ac_output_active_power ?? 0);
  const battery = Number(latest?.battery_capacity ?? 0);
  const batteryV = Number(latest?.battery_voltage ?? 0);
  const gridV = Number(latest?.grid_voltage ?? 0);
  const gridConnected = gridV > 50;
  const mode = formatInverterMode(latest?.inverter_mode);
  const charging = pv_W > load;
  const pvMax = (pv?.array_kwp ?? 5) * 1000;

  const widgets: Record<string, React.ReactNode> = {
    mode: (
      <div className="flex items-center justify-between rounded-xl border bg-card p-4 sm:p-5 animate-fade-in h-full">
        <div className="flex items-center gap-3">
          <Cpu className="h-8 w-8 text-foreground/70" />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Modo de uso del inversor</div>
            <div className="text-lg font-semibold sm:text-xl">{mode.label}</div>
          </div>
        </div>
        {mode.code && <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">QMOD: {mode.code}</span>}
      </div>
    ),
    icons: (
      <div className="@container rounded-xl border bg-card p-4 sm:p-6 animate-fade-in h-full">
        <div className="grid grid-cols-1 gap-3 @[280px]:grid-cols-2 @[520px]:grid-cols-3 @[760px]:grid-cols-5 sm:gap-4">
          <IconCard icon={<Cpu className="h-10 w-10 text-foreground/70" />} title={t("site.dash.inverter")} subtitle={mode.label} />
          <IconCard icon={<Sun className="h-10 w-10 text-[var(--solar)]" />} title={t("site.dash.solar")} subtitle={`${Math.round(pv_W).toLocaleString()} W`} />
          <IconCard icon={<Plug className="h-10 w-10 text-[var(--load)]" />} title="Consumo" subtitle={`${Math.round(load).toLocaleString()} W`} />
          <IconCard
            icon={<div className="relative"><Plug className="h-10 w-10 text-foreground/70" />{!gridConnected && <AlertCircle className="absolute -bottom-1 -right-1 h-4 w-4 fill-[var(--warning)] text-background" />}</div>}
            title={t("site.dash.grid")} subtitle={`${gridV.toFixed(0)} V`} />
          <IconCard icon={<Battery className="h-10 w-10 text-[var(--battery)]" />} title={t("site.dash.battery")} subtitle={`${battery.toFixed(0)} %`} />
        </div>
      </div>
    ),
    backup: (
      <BackupTimeCard
        soc={battery}
        batteryKwh={pv?.battery_kwh ?? null}
        usableDodPct={pv?.battery_usable_dod_pct ?? null}
        load={load}
        pv={pv_W}
        batteryCount={pv?.battery_count ?? null}
        batteryType={pv?.battery_type ?? null}
      />
    ),
    rings: <ConcentricRings pv={pv_W} load={load} soc={battery} pvMax={pvMax} loadMax={5000} />,
    gauges: <PowerGauges pv={pv_W} load={load} gridV={gridV} battery={battery} batteryV={batteryV} pvMax={pvMax} />,
    battery3d: <Battery3D soc={battery} voltage={batteryV} charging={charging} />,
    solarcell: <SolarPanelsViz pv={pv_W} pvMax={pvMax} />,
    loadcell: <HouseLoadViz load={load} loadMax={pvMax} />,
    solarrays: <SolarRays pv={pv_W} pvMax={pvMax} />,
    gridwave: <GridSineWave voltage={gridV} frequency={50} />,
    flow: <EnergyFlowDiagram pv={pv_W} load={load} gridV={gridV} battery={battery} batteryV={batteryV} />,
    forecast: (
      <SolarForecastWidget
        pvConfig={{ kwp: pv?.array_kwp, lossesPct: pv?.system_losses_pct, batteryKwh: pv?.battery_kwh, lat: pv?.latitude, lon: pv?.longitude }}
      />
    ),
  };

  return (
    <DashboardGrid
      defs={WIDGET_DEFS}
      state={state}
      onChange={persist}
      render={(id) => widgets[id] ?? null}
    />
  );
}

function IconCard({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3 sm:gap-4 sm:p-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted/50 sm:h-16 sm:w-16">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold sm:text-base">{title}</div>
        <div className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</div>
      </div>
    </div>
  );
}

function Section({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: typeof Cpu }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4 shadow-sm animate-fade-up">
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
