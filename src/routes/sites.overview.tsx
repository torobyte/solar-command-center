import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Sun, Plug, Battery, Cpu, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeaderSkeleton } from "@/components/LoadingStates";

export const Route = createFileRoute("/sites/overview")({
  component: () => <ProtectedLayout><SitesOverview /></ProtectedLayout>,
});

interface Site {
  id: string;
  name: string;
  status: string;
  inverter_model: string | null;
  last_seen_at: string | null;
}

interface Latest {
  pv_input_power: number | null;
  ac_output_active_power: number | null;
  battery_capacity: number | null;
  battery_voltage: number | null;
  grid_voltage: number | null;
  inverter_mode: string | null;
  recorded_at: string;
}

function SitesOverview() {
  const [sites, setSites] = useState<Site[]>([]);
  const [samples, setSamples] = useState<Record<string, Latest | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: s } = await supabase
        .from("sites")
        .select("id,name,status,inverter_model,last_seen_at")
        .order("name");
      if (!alive) return;
      const list = (s ?? []) as Site[];
      setSites(list);

      // Fetch latest sample per site in parallel
      const results = await Promise.all(
        list.map(async (site) => {
          const { data } = await supabase
            .from("telemetry_samples")
            .select("pv_input_power,ac_output_active_power,battery_capacity,battery_voltage,grid_voltage,inverter_mode,recorded_at")
            .eq("site_id", site.id)
            .order("recorded_at", { ascending: false })
            .limit(1);
          return [site.id, (data?.[0] ?? null) as Latest | null] as const;
        })
      );
      if (!alive) return;
      setSamples(Object.fromEntries(results));
      setLoading(false);
    })();

    // Realtime: update on any new sample
    const ch = supabase
      .channel(`overview-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telemetry_samples" },
        (payload) => {
          const row = payload.new as Latest & { site_id: string };
          setSamples((cur) => ({ ...cur, [row.site_id]: row }));
        }
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  return (
    <>
      <Link
        to="/app"
        className="group mb-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.4} />
        Volver a sitios
      </Link>

      <div className="mb-6 animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight">Vista global</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medidores en tiempo real de todos tus sitios.
        </p>
      </div>

      {loading ? (
        <PageHeaderSkeleton />
      ) : sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay sitios para mostrar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 animate-fade-up">
          {sites.map((s) => (
            <SiteCard key={s.id} site={s} latest={samples[s.id] ?? null} />
          ))}
        </div>
      )}
    </>
  );
}

function SiteCard({ site, latest }: { site: Site; latest: Latest | null }) {
  const pv = Number(latest?.pv_input_power ?? 0);
  const load = Number(latest?.ac_output_active_power ?? 0);
  const soc = Number(latest?.battery_capacity ?? 0);
  const gridV = Number(latest?.grid_voltage ?? 0);
  const gridOn = gridV > 50;
  const ageSec = latest ? Math.floor((Date.now() - new Date(latest.recorded_at).getTime()) / 1000) : null;
  const live = ageSec != null && ageSec < 60;

  return (
    <Link
      to="/sites/$siteId"
      params={{ siteId: site.id }}
      className="group block rounded-2xl border bg-card p-4 shadow-sm transition-all hover:border-accent/50 hover:shadow-md active:scale-[.99]"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold tracking-tight">{site.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Cpu className="h-3 w-3" />
            <span className="truncate">{site.inverter_model ?? "—"}</span>
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 gap-1 ${live ? "border-success/40 text-success" : "border-muted text-muted-foreground"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
          {live ? "En vivo" : ageSec != null ? `${Math.floor(ageSec / 60)}m` : "Sin datos"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Meter icon={<Sun className="h-3.5 w-3.5" />} label="Solar" value={`${Math.round(pv).toLocaleString()} W`} color="text-[var(--solar)]" />
        <Meter icon={<Plug className="h-3.5 w-3.5" />} label="Carga" value={`${Math.round(load).toLocaleString()} W`} color="text-[var(--load)]" />
        <Meter
          icon={<Battery className="h-3.5 w-3.5" />}
          label="Batería"
          value={`${soc.toFixed(0)}%`}
          color={soc > 50 ? "text-success" : soc > 20 ? "text-warning" : "text-destructive"}
        />
        <Meter
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Red"
          value={gridOn ? `${gridV.toFixed(0)} V` : "Off"}
          color={gridOn ? "text-foreground" : "text-muted-foreground"}
        />
      </div>
    </Link>
  );
}

function Meter({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-2.5">
      <div className={`mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide ${color}`}>
        {icon}{label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
