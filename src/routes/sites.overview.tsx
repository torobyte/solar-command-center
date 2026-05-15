import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeaderSkeleton } from "@/components/LoadingStates";
import { PowerGauges } from "@/components/PowerGauges";

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

interface Spec {
  max_ac_output_power: number | null;
}

function SitesOverview() {
  const [sites, setSites] = useState<Site[]>([]);
  const [samples, setSamples] = useState<Record<string, Latest | null>>({});
  const [specs, setSpecs] = useState<Record<string, Spec | null>>({});
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

      const [sampleResults, specResults] = await Promise.all([
        Promise.all(list.map(async (site) => {
          const { data } = await supabase
            .from("telemetry_samples")
            .select("pv_input_power,ac_output_active_power,battery_capacity,battery_voltage,grid_voltage,inverter_mode,recorded_at")
            .eq("site_id", site.id)
            .order("recorded_at", { ascending: false })
            .limit(1);
          return [site.id, (data?.[0] ?? null) as Latest | null] as const;
        })),
        Promise.all(list.map(async (site) => {
          const { data } = await supabase
            .from("inverter_specs")
            .select("max_ac_output_power")
            .eq("site_id", site.id)
            .maybeSingle();
          return [site.id, (data ?? null) as Spec | null] as const;
        })),
      ]);
      if (!alive) return;
      setSamples(Object.fromEntries(sampleResults));
      setSpecs(Object.fromEntries(specResults));
      setLoading(false);
    })();

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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 animate-fade-up">
          {sites.map((s) => (
            <SiteBlock key={s.id} site={s} latest={samples[s.id] ?? null} spec={specs[s.id] ?? null} />
          ))}
        </div>
      )}
    </>
  );
}

function SiteBlock({ site, latest, spec }: { site: Site; latest: Latest | null; spec: Spec | null }) {
  const pv = Number(latest?.pv_input_power ?? 0);
  const load = Number(latest?.ac_output_active_power ?? 0);
  const soc = Number(latest?.battery_capacity ?? 0);
  const batV = Number(latest?.battery_voltage ?? 0);
  const gridV = Number(latest?.grid_voltage ?? 0);
  const ageSec = latest ? Math.floor((Date.now() - new Date(latest.recorded_at).getTime()) / 1000) : null;
  const live = ageSec != null && ageSec < 60;
  const pvMax = Number(spec?.max_ac_output_power ?? 5000);

  return (
    <Link
      to="/sites/$siteId"
      params={{ siteId: site.id }}
      className="group block rounded-2xl border bg-card shadow-sm transition-all hover:border-accent/50 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold tracking-tight">{site.name}</h3>
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
      <div className="p-3 sm:p-4">
        <PowerGauges pv={pv} load={load} gridV={gridV} battery={soc} batteryV={batV} pvMax={pvMax} />
      </div>
    </Link>
  );
}
