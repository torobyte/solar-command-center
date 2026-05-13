import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { SiteDashboardView, type DashboardSample, formatInverterMode } from "@/components/SiteDashboardView";
import type { PvConfig } from "@/components/PvSystemConfig";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LangSwitcher } from "@/components/LangSwitcher";

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

interface LicenseMeta { plan?: string; site_name?: string; site_id?: string }

function LocalDashboardPage() {
  const search = Route.useSearch();
  // Default: same-origin (when the bundle is served from the agent itself).
  const agentBase = useMemo(() => {
    if (search.agent) return search.agent.replace(/\/$/, "");
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, [search.agent]);

  // Split state so each piece only re-renders subscribers when it actually
  // changes — this is what eliminates the 2s "flicker" of the dashboard.
  const [latest, setLatest] = useState<DashboardSample | null>(null);
  const [license, setLicense] = useState<LicenseMeta | null>(null);
  const [pvCfg, setPvCfg] = useState<PvConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<number>(0);

  const lastRecordedAt = useRef<string | null>(null);
  const lastLicenseKey = useRef<string>("");
  const bridgedRef = useRef(false);

  // ---- Bridge postMessage: cuando estamos embebidos en el wrapper HTTP del
  // agente, el padre hace los fetches a /api/* y nos envía los datos por
  // postMessage. Así evitamos el bloqueo mixed-content HTTPS→HTTP.
  useEffect(() => {
    function applyState(data: { latest?: DashboardSample | null; license?: LicenseMeta | null } | null) {
      if (!data) return;
      setError(null);
      setLastTick(Date.now());
      const incoming = data.latest ?? null;
      const incomingKey = incoming?.recorded_at ?? null;
      if (incomingKey !== lastRecordedAt.current) {
        lastRecordedAt.current = incomingKey;
        setLatest(incoming);
      }
      const lic = data.license ?? null;
      const licKey = lic ? `${lic.site_id}|${lic.site_name}|${lic.plan}` : "";
      if (licKey !== lastLicenseKey.current) {
        lastLicenseKey.current = licKey;
        setLicense(lic);
      }
    }
    function applyPv(data: Partial<PvConfig> | null) {
      if (!data) return;
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
    }
    function onMessage(ev: MessageEvent) {
      const d = ev.data as { source?: string; type?: string; payload?: unknown } | null;
      if (!d || d.source !== "solarops-agent") return;
      bridgedRef.current = true;
      if (d.type === "state") applyState(d.payload as Parameters<typeof applyState>[0]);
      else if (d.type === "pvconfig") applyPv(d.payload as Partial<PvConfig>);
    }
    window.addEventListener("message", onMessage);
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ source: "solarops-local", type: "ready" }, "*"); } catch { /* ignore */ }
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!agentBase) return;
    let alive = true;
    const mountedAt = Date.now();
    const embedded = typeof window !== "undefined" && window.parent && window.parent !== window;

    async function fetchJSON<T>(url: string): Promise<T> {
      const r = await fetch(url, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      // Si el agente devolvió JSON con `error`, úsalo como mensaje legible
      // en lugar del genérico "HTTP 500".
      if (ct.includes("application/json")) {
        const body = await r.json();
        if (!r.ok) {
          const msg = (body && (body.error || body.message)) || `HTTP ${r.status}`;
          throw new Error(String(msg));
        }
        return body as T;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      throw new Error("Respuesta no-JSON (¿estás apuntando al agente?)");
    }

    async function pullState() {
      if (bridgedRef.current) return;
      try {
        const data = await fetchJSON<{
          latest: DashboardSample | null;
          license?: LicenseMeta | null;
        }>(`${agentBase}/api/state`);
        if (!alive) return;
        setError(null);
        setLastTick(Date.now());

        const incoming = data.latest;
        const incomingKey = incoming?.recorded_at ?? null;
        if (incomingKey !== lastRecordedAt.current) {
          lastRecordedAt.current = incomingKey;
          setLatest(incoming);
        }

        const lic = data.license ?? null;
        const licKey = lic ? `${lic.site_id}|${lic.site_name}|${lic.plan}` : "";
        if (licKey !== lastLicenseKey.current) {
          lastLicenseKey.current = licKey;
          setLicense(lic);
        }
      } catch (e) {
        if (!alive) return;
        // Estamos embebidos esperando el bridge del padre — no mostremos
        // "Failed to fetch" durante los primeros 4s; el bridge ya está en camino.
        if (embedded && (bridgedRef.current || Date.now() - mountedAt < 4000)) return;
        setError((e as Error).message);
      }
    }
    async function pullPv() {
      if (bridgedRef.current) return;
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
        // ignore — pv config is optional; fall back to a stub so children
        // don't remount later when it finally arrives.
        if (alive) setPvCfg((prev) => prev ?? ({ site_id: "local" } as PvConfig));
      }
    }

    pullState();
    pullPv();
    const id = window.setInterval(pullState, 2000);
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
          <div className="flex items-center gap-1">
            <LangSwitcher />
            <ThemeToggle />
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
