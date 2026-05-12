import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, Battery, Sun, Plug, Cpu, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
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
          <ConfigurationView site={site} />
        </TabsContent>
      </Tabs>
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

interface DeviceSnapshot {
  ssid: string | null; ip_eth: string | null; ip_wlan: string | null;
  ip_public: string | null; internet_up: boolean | null;
  cpu_temp_c: number | null; storage_used_pct: number | null;
  storage_total_gb: number | null; usb_devices: number | null;
  board_model: string | null; agent_version: string | null;
  voltage_dips: number | null; updated_at: string;
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
    <>
      <Section title="General">
        <Row label="Site ID" value={site.id} />
        <Row label="Plan" value={site.plan} />
        <Row label="Estado" value={site.status} />
        <Row label="Licencia expira" value={site.license_expires_at ?? "—"} />
      </Section>

      <Section title="Especificación del inversor">
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
          <p className="text-sm text-muted-foreground">Esperando que la Raspberry envíe la especificación del inversor…</p>
        )}
      </Section>

      <Section title="Configuración remota del inversor">
        <p className="mb-4 text-sm text-muted-foreground">
          Los cambios se envían a la Raspberry y se aplican al inversor mediante comandos Voltronic.
        </p>
        <SettingControl label="Prioridad de salida (POP)"
          options={[
            { v: "00", l: "Utility first" },
            { v: "01", l: "Solar first" },
            { v: "02", l: "SBU (Solar→Batería→Utility)" },
          ]}
          onApply={(v) => sendCommand("set_output_priority", { value: v })} />
        <SettingControl label="Prioridad de carga (PCP)"
          options={[
            { v: "00", l: "Utility first" },
            { v: "01", l: "Solar first" },
            { v: "02", l: "Solar y Utility" },
            { v: "03", l: "Solo Solar" },
          ]}
          onApply={(v) => sendCommand("set_charger_priority", { value: v })} />
        <SettingControl label="Rango voltaje AC entrada"
          options={[{ v: "appliance", l: "Appliance (170–280 V)" }, { v: "ups", l: "UPS (90–280 V)" }]}
          onApply={(v) => sendCommand("set_input_range", { value: v })} />
        <NumberControl label="Corriente máx. de carga (A)" min={10} max={100} step={10} defaultValue={40}
          onApply={(n) => sendCommand("set_max_charge_current", { amps: n })} />
        <NumberControl label="Corriente máx. carga AC (A)" min={2} max={30} step={2} defaultValue={20}
          onApply={(n) => sendCommand("set_max_ac_charge_current", { amps: n })} />
        <NumberControl label="Voltaje volver a batería (V)" min={44} max={51} step={0.1} defaultValue={48}
          onApply={(n) => sendCommand("set_back_to_battery_voltage", { volts: n })} />
        <NumberControl label="Voltaje a red (V)" min={44} max={51} step={0.1} defaultValue={47}
          onApply={(n) => sendCommand("set_back_to_grid_voltage", { volts: n })} />

        <div className="mt-6">
          <h4 className="mb-2 text-sm font-semibold">Últimos comandos</h4>
          {commands.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin comandos enviados todavía.</p>
          ) : (
            <div className="space-y-1">
              {commands.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded border bg-background px-3 py-2 text-xs">
                  <div className="font-mono">{c.command} {JSON.stringify(c.payload)}</div>
                  <div className={
                    c.status === "done" ? "text-success" :
                    c.status === "failed" ? "text-destructive" :
                    "text-muted-foreground"
                  }>
                    {c.status}{c.error ? ` — ${c.error}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Estado de red">
        {snap ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Row label="SSID WiFi" value={snap.ssid ?? "—"} />
            <Row label="Internet" value={snap.internet_up ? "Conectado" : "Desconectado"} />
            <Row label="IP Ethernet" value={snap.ip_eth ?? "—"} />
            <Row label="IP WiFi" value={snap.ip_wlan ?? "—"} />
            <Row label="IP pública" value={snap.ip_public ?? "—"} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Esperando datos del dispositivo…</p>
        )}
      </Section>

      <Section title="Sistema">
        {snap ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">Esperando datos del dispositivo…</p>
        )}
      </Section>

      <Section title="Instalación del dispositivo">
        <p className="mb-3 text-sm text-muted-foreground">
          Ejecuta esto en tu Raspberry Pi para instalar el agente y vincularlo a este sitio:
        </p>
        <CodeBlock value={`curl -fsSL https://solarops.local/install.sh | sudo bash -s -- --token ${site.device_token}`} />
        <p className="mt-2 text-xs text-muted-foreground">El token identifica este dispositivo. No lo compartas.</p>
      </Section>
    </>
  );
}

function SettingControl({ label, options, onApply }: {
  label: string; options: Array<{ v: string; l: string }>;
  onApply: (v: string) => void;
}) {
  const [val, setVal] = useState(options[0].v);
  return (
    <div className="mb-3 flex items-center gap-3">
      <Label className="w-64 text-sm">{label}</Label>
      <select value={val} onChange={(e) => setVal(e.target.value)}
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <Button size="sm" onClick={() => onApply(val)}>Aplicar</Button>
    </div>
  );
}

function NumberControl({ label, min, max, step, defaultValue, onApply }: {
  label: string; min: number; max: number; step: number; defaultValue: number;
  onApply: (n: number) => void;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <div className="mb-3 flex items-center gap-3">
      <Label className="w-64 text-sm">{label}</Label>
      <input type="number" min={min} max={max} step={step} value={val}
        onChange={(e) => setVal(parseFloat(e.target.value) || defaultValue)}
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
      <Button size="sm" onClick={() => onApply(val)}>Aplicar</Button>
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

const INVERTER_MODE_LABELS: Record<string, string> = {
  P: "Encendido",
  S: "Standby",
  L: "Modo Red",
  B: "Modo Batería",
  F: "Fallo",
  H: "Ahorro de energía",
  D: "Apagado",
};

function formatInverterMode(raw: string | null | undefined): string {
  if (!raw) return "—";
  // Keep only the first ASCII letter — strips CRC/replacement chars from old samples.
  const letter = raw.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return INVERTER_MODE_LABELS[letter] ?? (letter || "—");
}

function DashboardView({ latest }: { latest: Sample | null }) {
  const { t } = useI18n();
  const pv = Number(latest?.pv_input_power ?? 0);
  const load = Number(latest?.ac_output_active_power ?? 0);
  const battery = Number(latest?.battery_capacity ?? 0);
  const batteryV = Number(latest?.battery_voltage ?? 0);
  const gridV = Number(latest?.grid_voltage ?? 0);
  const gridConnected = gridV > 50;
  const mode = formatInverterMode(latest?.inverter_mode);
  const batteryW = Math.round(batteryV * 0);
  const ratio = (n: number, max: number) => Math.min(1, Math.max(0, n / max));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:gap-4 sm:p-6">
        <IconCard icon={<Cpu className="h-10 w-10 sm:h-12 sm:w-12 text-foreground/70" />} title={t("site.dash.inverter")} subtitle={mode} />
        <IconCard icon={<Sun className="h-10 w-10 sm:h-12 sm:w-12 text-[var(--solar)]" />} title={t("site.dash.solar")} subtitle={`${(pv / 1000).toFixed(1)} kW`} />
        <IconCard
          icon={
            <div className="relative">
              <Plug className="h-10 w-10 sm:h-12 sm:w-12 text-foreground/70" />
              {!gridConnected && (
                <AlertCircle className="absolute -bottom-1 -right-1 h-4 w-4 fill-[var(--warning)] text-background" />
              )}
            </div>
          }
          title={t("site.dash.grid")}
          subtitle={`${gridV.toFixed(0)} V`}
        />
        <IconCard icon={<Battery className="h-10 w-10 sm:h-12 sm:w-12 text-[var(--battery)]" />} title={t("site.dash.battery")} subtitle={`${battery.toFixed(0)} %`} />
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:gap-4 sm:p-6">
        <Gauge value={`${load.toFixed(0)} W`} label={t("site.dash.load")} ratio={ratio(load, 5000)} color="var(--load)" />
        <Gauge value={`${pv.toFixed(0)} W`} label={t("site.dash.solar")} ratio={ratio(pv, 5000)} color="var(--solar)" />
        <Gauge value={`${gridConnected ? load.toFixed(0) : 0} W`} label={t("site.dash.grid")} ratio={gridConnected ? ratio(load, 5000) : 0} color="var(--grid)" />
        <Gauge value={`${batteryW || pv > load ? Math.max(0, pv - load).toFixed(0) : "0"} W`} label={t("site.dash.battery")} ratio={ratio(Math.abs(pv - load), 5000)} color="var(--battery)" />
      </div>
    </div>
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

function Gauge({ value, label, ratio, color }: { value: string; label: string; ratio: number; color: string }) {
  // Semicircle gauge: 180° arc
  const r = 70;
  const cx = 80, cy = 80;
  const startAngle = Math.PI; // 180°
  const sweep = Math.PI;       // 180°
  const a = startAngle + sweep * ratio;
  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(a), y2 = cy + r * Math.sin(a);
  const largeArc = sweep * ratio > Math.PI ? 1 : 0;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-background p-3 sm:p-4">
      <svg viewBox="0 0 160 95" className="w-full max-w-[180px]">
        {/* background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round"
          className="opacity-40"
        />
        {/* value arc */}
        {ratio > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          />
        )}
        <text x="80" y="70" textAnchor="middle" className="fill-foreground" fontSize="20" fontWeight="700">{value}</text>
        <text x="80" y="88" textAnchor="middle" className="fill-muted-foreground" fontSize="11">{label}</text>
      </svg>
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
