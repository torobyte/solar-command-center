import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, Battery, Sun, Zap, Plug } from "lucide-react";
import { toast } from "sonner";

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

function SiteDetail() {
  const { siteId } = Route.useParams();
  const [site, setSite] = useState<Site | null>(null);
  const [latest, setLatest] = useState<Sample | null>(null);

  async function load() {
    const { data: s } = await supabase.from("sites").select("*").eq("id", siteId).maybeSingle();
    setSite(s as Site | null);
    const { data: t } = await supabase
      .from("telemetry_samples")
      .select("recorded_at, ac_output_active_power, pv_input_power, battery_capacity, battery_voltage, grid_voltage, inverter_mode")
      .eq("site_id", siteId)
      .order("recorded_at", { ascending: false })
      .limit(1);
    setLatest((t?.[0] as Sample) ?? null);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`site-${siteId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_samples", filter: `site_id=eq.${siteId}` },
        (payload) => setLatest(payload.new as Sample))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [siteId]);

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
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Sun} label="Solar PV" value={latest?.pv_input_power ?? 0} unit="W" tone="solar" />
            <MetricCard icon={Plug} label="Load" value={latest?.ac_output_active_power ?? 0} unit="W" tone="load" />
            <MetricCard icon={Zap} label="Grid" value={latest?.grid_voltage ?? 0} unit="V" tone="grid" />
            <MetricCard icon={Battery} label="Battery" value={latest?.battery_capacity ?? 0} unit="%" tone="battery"
              sub={latest?.battery_voltage ? `${latest.battery_voltage} V` : undefined} />
          </div>

          {!latest && (
            <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Waiting for the first telemetry sample from your device…
            </div>
          )}
        </TabsContent>

        <TabsContent value="charts" className="mt-6">
          <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
            Charts (load / PV / grid / battery over time) — coming in next iteration.
          </div>
        </TabsContent>

        <TabsContent value="totals" className="mt-6">
          <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
            Daily / monthly energy totals — coming in next iteration.
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
