import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, Battery, Sun, Zap, Plug, Cpu, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";

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

function SiteDetail() {
  const { siteId } = Route.useParams();
  const [site, setSite] = useState<Site | null>(null);
  const [latest, setLatest] = useState<Sample | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [totals, setTotals] = useState<DailyTotal[]>([]);

  async function load() {
    const { data: s } = await supabase.from("sites").select("*").eq("id", siteId).maybeSingle();
    setSite(s as Site | null);
    const { data: t } = await supabase
      .from("telemetry_samples")
      .select("recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, grid_voltage, inverter_mode")
      .eq("site_id", siteId)
      .order("recorded_at", { ascending: false })
      .limit(720); // ~12h at 1/min
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
    load();
    const channel = supabase
      .channel(`site-${siteId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_samples", filter: `site_id=eq.${siteId}` },
        (payload) => {
          const row = payload.new as Sample;
          setLatest(row);
          setHistory((h) => [...h.slice(-719), row]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [siteId]);

  const chartData = useMemo(() => history.map((r) => ({
    t: new Date(r.recorded_at).getTime(),
    pv: Number(r.pv_input_power ?? 0),
    load: Number(r.ac_output_active_power ?? 0),
    soc: Number(r.battery_capacity ?? 0),
    grid: Number(r.grid_voltage ?? 0),
  })), [history]);

  if (!site) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <Link to="/app" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to sites
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{site.name}</h1>
          <p className="text-sm text-muted-foreground">
            {site.inverter_model ?? "Inverter not yet detected"} · {site.status}
          </p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="totals">Totals</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardView latest={latest} />
          {!latest && (
            <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Waiting for the first telemetry sample from your device…
            </div>
          )}
        </TabsContent>

        <TabsContent value="charts" className="mt-6 space-y-6">
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

          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
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

        <TabsContent value="config" className="mt-6 space-y-6">
          <Section title="General">
            <Row label="Site ID" value={site.id} />
            <Row label="Status" value={site.status} />
            <Row label="Plan" value={site.plan} />
            <Row label="License expires" value={site.license_expires_at ?? "—"} />
          </Section>

          <Section title="Device installation">
            <p className="mb-3 text-sm text-muted-foreground">
              Run this on your Raspberry Pi or Orange Pi to install the SolarOps agent and pair it with this site:
            </p>
            <CodeBlock value={`curl -fsSL https://solarops.local/install.sh | sudo bash -s -- --token ${site.device_token}`} />
            <p className="mt-2 text-xs text-muted-foreground">Keep this token secret. It identifies your device.</p>
          </Section>
        </TabsContent>
      </Tabs>
    </>
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

function MetricCard({ icon: Icon, label, value, unit, tone, sub }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; value: number; unit: string;
  tone: "solar" | "load" | "grid" | "battery"; sub?: string;
}) {
  const colorVar = `var(--${tone})`;
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" style={{ color: colorVar }} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight">
        {Number(value).toFixed(0)} <span className="text-base font-normal text-muted-foreground">{unit}</span>
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="mb-4 font-semibold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 font-mono text-xs">
      <code className="flex-1 break-all">{value}</code>
      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
