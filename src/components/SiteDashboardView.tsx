import type React from "react";
import { useI18n } from "@/lib/i18n";
import {
  Battery3D,
  BackupTimeCard,
} from "@/components/AdvancedVisuals";
import { DashboardGrid, useDashboardLayout, type WidgetDef } from "@/components/DashboardCustomizer";
import { usePvConfig, type PvConfig } from "@/components/PvSystemConfig";
import { useSiteRole } from "@/lib/useSiteRole";
import {
  EnvironmentalImpactCard,
  EnergyFlowReferenceCard,
  HouseConsumptionReferenceCard,
  SavingsReferenceCard,
  SolarProductionReferenceCard,
  SystemStatusCard,
  useSolarReferenceWeather,
  WeatherAndRadiationCard,
} from "@/components/ReferenceDashboardCards";

/** Shared sample shape consumed by the dashboard widgets. */
export interface DashboardSample {
  recorded_at: string;
  ac_output_active_power: number | null;
  pv_input_power: number | null;
  battery_capacity: number | null;
  battery_voltage: number | null;
  battery_discharge_current?: number | null;
  battery_charging_current?: number | null;
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
  { id: "system", label: "Estado general del sistema" },
  { id: "backup", label: "Tiempo de respaldo" },
  { id: "batteryStatus", label: "Batería" },
  { id: "flow", label: "Diagrama de flujo de energía" },
  { id: "solarProduction", label: "Producción solar" },
  { id: "houseConsumption", label: "Consumo de la casa" },
  { id: "environmental", label: "Impacto ambiental" },
  { id: "weather", label: "Clima y radiación solar" },
  { id: "savings", label: "Ahorro económico" },
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
  agentBase,
}: {
  latest: DashboardSample | null;
  siteId: string;
  pvConfig?: PvConfig | null;
  agentBase?: string | null;
}) {
  const { t } = useI18n();
  const { state, persist } = useDashboardLayout(siteId, WIDGET_DEFS);
  const liveCfg = usePvConfig(pvConfigProp === undefined ? siteId : "__skipped__");
  const pv: PvConfig | null = pvConfigProp ?? liveCfg.config;
  const roleInfo = useSiteRole(pvConfigProp === undefined ? siteId : null);
  void roleInfo;
  void agentBase;

  const pv_W = Number(latest?.pv_input_power ?? 0);
  const load = Number(latest?.ac_output_active_power ?? 0);
  const battery = Number(latest?.battery_capacity ?? 0);
  const batteryV = Number(latest?.battery_voltage ?? 0);
  const gridV = Number(latest?.grid_voltage ?? 0);
  const gridConnected = gridV > 50;
  const mode = formatInverterMode(latest?.inverter_mode);
  const charging = pv_W > load;
  const pvMax = (pv?.array_kwp ?? 5) * 1000;
  const weatherData = useSolarReferenceWeather(pv);
  const batteryDischargeW = Math.max(0, Number(latest?.battery_discharge_current ?? 0) * batteryV);
  const batteryChargeW = Math.max(0, Number(latest?.battery_charging_current ?? 0) * batteryV);
  const batteryNetW = batteryDischargeW - batteryChargeW;
  // Aporte de la red = (consumo casa + carga batería) - (PV + descarga batería)
  const gridW = gridConnected ? Math.max(0, load + batteryChargeW - pv_W - batteryDischargeW) : 0;

  const widgets: Record<string, React.ReactNode> = {
    system: <SystemStatusCard pv={pv_W} load={load} battery={battery} batteryV={batteryV} batteryW={batteryNetW} gridV={gridV} gridW={gridW} pvMax={pvMax} />,
    backup: (
      <BackupTimeCard
        soc={battery}
        batteryKwh={pv?.battery_kwh ?? null}
        usableDodPct={pv?.battery_usable_dod_pct ?? null}
        load={load}
        pv={pv_W}
        batteryCount={pv?.battery_count ?? null}
        batteryType={pv?.battery_type ?? null}
        batteryChargeW={batteryChargeW}
        gridConnected={gridConnected}
      />
    ),
    batteryStatus: <Battery3D soc={battery} voltage={batteryV} charging={charging} powerW={Math.abs(batteryNetW)} currentA={Number(latest?.battery_discharge_current ?? latest?.battery_charging_current ?? 0)} />,
    flow: <EnergyFlowReferenceCard pv={pv_W} load={load} gridV={gridV} battery={battery} batteryV={batteryV} batteryNetW={batteryNetW} />,
    solarProduction: <SolarProductionReferenceCard pv={pv_W} pvMax={pvMax} />,
    houseConsumption: <HouseConsumptionReferenceCard load={load} contractedPower={5200} />,
    environmental: <EnvironmentalImpactCard siteId={siteId} emissionFactor={0.4} />,
    weather: <WeatherAndRadiationCard data={weatherData} pvConfig={pv} livePv={pv_W} siteId={siteId} batterySoc={battery} batteryChargingW={batteryChargeW} />,
    savings: (
      <SavingsReferenceCard
        siteId={siteId}
        pvW={pv_W}
        batteryDischargeW={batteryDischargeW}
        loadW={load}
        gridV={gridV}
        energyPrice={pv?.energy_price ?? null}
        currency={pv?.currency ?? "CLP"}
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
