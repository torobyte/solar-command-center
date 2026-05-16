import type React from "react";
import { Cpu, Sun, Plug, Battery, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PowerGauges } from "@/components/PowerGauges";
import { EnergyFlowDiagram } from "@/components/EnergyFlowDiagram";
import { SolarForecastWidget } from "@/components/SolarForecastWidget";
import {
  Battery3D, SolarRays, GridSineWave, ConcentricRings,
  SolarPanelsViz, HouseLoadViz, BackupTimeCard,
} from "@/components/AdvancedVisuals";
import { DashboardGrid, useDashboardLayout, type WidgetDef } from "@/components/DashboardCustomizer";
import { usePvConfig, type PvConfig } from "@/components/PvSystemConfig";

/** Shared sample shape consumed by the dashboard widgets. */
export interface DashboardSample {
  recorded_at: string;
  ac_output_active_power: number | null;
  pv_input_power: number | null;
  battery_capacity: number | null;
  battery_voltage: number | null;
  grid_voltage: number | null;
  inverter_mode: string | null;
}

/** QMOD codes for Voltronic / Axpert / MPP-Solar inverters. */
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

export function formatInverterMode(raw: string | null | undefined): { label: string; code: string } {
  if (!raw) return { label: "—", code: "" };
  const code = raw.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  if (!code) return { label: "—", code: "" };
  return { label: INVERTER_MODE_LABELS[code] ?? `Modo ${code} (desconocido)`, code };
}

export const WIDGET_DEFS: WidgetDef[] = [
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

/**
 * Renders the cloud-style dashboard. Pass `pvConfig` to bypass the Supabase
 * `usePvConfig(siteId)` query (useful from the local agent which has no
 * authenticated Supabase session).
 */
export function SiteDashboardView({
  latest,
  siteId,
  pvConfig: pvConfigProp,
}: {
  latest: DashboardSample | null;
  siteId: string;
  pvConfig?: PvConfig | null;
}) {
  const { t } = useI18n();
  const { state, persist } = useDashboardLayout(siteId, WIDGET_DEFS);
  // When a pvConfig prop is provided, skip the Supabase subscription entirely.
  const liveCfg = usePvConfig(pvConfigProp === undefined ? siteId : "__skipped__");
  const pv: PvConfig | null = pvConfigProp ?? liveCfg.config;

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
        pvConfig={{ kwp: pv?.array_kwp, lossesPct: pv?.system_losses_pct, batteryKwh: pv?.battery_kwh, lat: pv?.latitude, lon: pv?.longitude, locationLabel: pv?.location_label }}
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
