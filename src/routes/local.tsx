import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { SiteDashboardView, type DashboardSample, formatInverterMode } from "@/components/SiteDashboardView";
import type { PvConfig } from "@/components/PvSystemConfig";

/**
 * Public mirror of /sites/$siteId — designed to be embedded inside an
 * iframe served by the local Raspberry Pi / Orange Pi agent. Reads its
 * data from the agent's HTTP API instead of Supabase, so it works
 * offline (LAN-only) and stays pixel-identical to the cloud dashboard.
 *
 * URL: /local?agent=http://192.168.1.42  (defaults to same-origin)
 */
export const Route = createFileRoute("/local")({
  validateSearch: z.object({
    agent: z.string().url().optional(),
  }),
  component: LocalDashboardPage,
});

interface AgentState {
  latest: DashboardSample | null;
  config?: { device_token?: boolean; cloud_url?: string } | null;
  license?: { plan?: string; site_name?: string; site_id?: string } | null;
}

function LocalDashboardPage() {
  const search = Route.useSearch();
  // Default: same-origin (when the bundle is served from the agent itself).
  const agentBase = useMemo(() => {
    if (search.agent) return search.agent.replace(/\/$/, "");
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, [search.agent]);

  const [state, setState] = useState<AgentState | null>(null);
  const [pvCfg, setPvCfg] = useState<PvConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<number>(0);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!agentBase) return;
    let alive = true;

    async function fetchJSON<T>(url: string): Promise<T> {
      const r = await fetch(url, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!ct.includes("application/json")) throw new Error("Respuesta no-JSON");
      return r.json() as Promise<T>;
    }

    async function pullState() {
      try {
        const data = await fetchJSON<AgentState>(`${agentBase}/api/state`);
        if (!alive) return;
        setState(data);
        setError(null);
        setLastTick(Date.now());
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
      }
    }
    async function pullPv() {
      try {
        const data = await fetchJSON<Partial<PvConfig>>(`${agentBase}/api/pvconfig`);
        if (!alive) return;
        setPvCfg({
          site_id: "local",
          array_kwp: data.array_kwp ?? null,
          panel_count: data.panel_count ?? null,
          panel_watts: data.panel_watts ?? null,
          azimuth: data.azimuth ?? null,
          tilt: data.tilt ?? null,
          battery_kwh: data.battery_kwh ?? null,
          system_losses_pct: data.system_losses_pct ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          battery_count: data.battery_count ?? null,
          battery_type: data.battery_type ?? null,
          battery_voltage_each: data.battery_voltage_each ?? null,
          battery_ah_each: data.battery_ah_each ?? null,
          battery_usable_dod_pct: data.battery_usable_dod_pct ?? null,
        });
      } catch {
        // ignore — pv config is optional
      }
    }

    pullState();
    pullPv();
    tickRef.current = window.setInterval(() => {
      pullState();
    }, 2000) as unknown as number;

    return () => { alive = false; window.clearInterval(tickRef.current); };
  }, [agentBase]);

  const latest = state?.latest ?? null;
  const mode = formatInverterMode(latest?.inverter_mode);
  const fresh = latest?.recorded_at && (Date.now() - new Date(latest.recorded_at).getTime() < 60_000);
  const siteName = state?.license?.site_name ?? "SolarOps Local";
  const plan = state?.license?.plan ?? "local";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{siteName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${fresh ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${fresh ? "bg-success animate-pulse" : "bg-destructive"}`} />
                {fresh ? "En vivo · cada 2 s" : error ? `Sin conexión · ${error}` : "Sin datos del inversor"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Plan: {plan}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Modo: {mode.label}</span>
              {lastTick > 0 && (
                <span className="text-muted-foreground/70">
                  · Última lectura {latest?.recorded_at ? new Date(latest.recorded_at).toLocaleTimeString() : "—"}
                </span>
              )}
            </p>
          </div>
        </header>

        <SiteDashboardView latest={latest} siteId="local" pvConfig={pvCfg} />

        {!latest && !error && (
          <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Esperando la primera muestra del inversor… (asegúrate de que el cable USB/serial esté conectado)
          </div>
        )}
      </div>
    </div>
  );
}
