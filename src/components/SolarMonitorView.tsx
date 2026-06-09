import { useEffect, useMemo, useState } from "react";
import { Bell, MoreVertical, Menu, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog, Home as HomeIcon, BatteryFull, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePvConfig, type PvConfig } from "@/components/PvSystemConfig";
import { useSolarReferenceWeather, type DashboardWeatherData } from "@/components/ReferenceDashboardCards";
import type { DashboardSample } from "@/components/SiteDashboardView";
import { useTheme } from "@/lib/theme";
import sceneSunnyDay from "@/assets/scene-sunny-day.jpg";
import sceneCloudyDay from "@/assets/scene-cloudy-day.jpg";
import sceneRainyNight from "@/assets/scene-rainy-night.jpg";
import sceneSnowyNight from "@/assets/scene-snowy-night.jpg";

/** Picks the most appropriate hyperrealistic background scene for the current weather/time. */
function pickSceneImage(theme: WeatherTheme): string {
  if (theme.precipitation === "snow") return sceneSnowyNight;
  if (theme.precipitation === "rain" || theme.precipitation === "heavy_rain" || theme.precipitation === "drizzle" || theme.precipitation === "thunder") return sceneRainyNight;
  if (!theme.isDay) return sceneRainyNight; // night fallback (dark scene)
  if (theme.weatherType === "clear_day" || theme.solarMultiplier >= 0.7) return sceneSunnyDay;
  return sceneCloudyDay;
}

/* =========================================================================
   Weather mapping
   ========================================================================= */
export type WeatherType =
  | "clear_day" | "clear_night"
  | "partly_cloudy_day" | "partly_cloudy_night"
  | "cloudy" | "overcast"
  | "drizzle" | "rain" | "heavy_rain" | "thunderstorm"
  | "snow" | "snow_night"
  | "fog" | "mist" | "haze" | "windy";

export interface WeatherTheme {
  weatherType: WeatherType;
  weatherLabel: string;
  generationQualityLabel: string;
  solarMultiplier: number;
  isDay: boolean;
  /** Tailwind/inline gradient classes for the central scene background */
  sceneGradient: string;
  /** Accent color for solar card & lines */
  solarAccent: string;
  /** Whether to show rain/snow overlay */
  precipitation: "none" | "drizzle" | "rain" | "heavy_rain" | "snow" | "thunder";
}

function mapWeather(code: number, isDay: boolean): WeatherTheme {
  // Open-Meteo WMO codes
  const base = (t: Partial<WeatherTheme>): WeatherTheme => ({
    weatherType: "clear_day", weatherLabel: "—", generationQualityLabel: "—",
    solarMultiplier: 0, isDay, sceneGradient: "", solarAccent: "#facc15", precipitation: "none",
    ...t,
  });
  if (code === 0 || code === 1) {
    return isDay
      ? base({ weatherType: "clear_day", weatherLabel: "Soleado", generationQualityLabel: "Óptimo para generación", solarMultiplier: 1, sceneGradient: "linear-gradient(180deg,#3b82f6 0%,#60a5fa 35%,#bae6fd 65%,#1f3a52 100%)", solarAccent: "#facc15" })
      : base({ weatherType: "clear_night", weatherLabel: "Noche despejada", generationQualityLabel: "Sin generación solar", solarMultiplier: 0, sceneGradient: "linear-gradient(180deg,#020617 0%,#0b1325 50%,#111c33 100%)", solarAccent: "#60a5fa" });
  }
  if (code === 2) {
    return isDay
      ? base({ weatherType: "partly_cloudy_day", weatherLabel: "Parcialmente nublado", generationQualityLabel: "Buena generación", solarMultiplier: 0.75, sceneGradient: "linear-gradient(180deg,#475569 0%,#64748b 40%,#94a3b8 70%,#1f2937 100%)", solarAccent: "#fbbf24" })
      : base({ weatherType: "partly_cloudy_night", weatherLabel: "Noche parcialmente nublada", generationQualityLabel: "Sin generación solar", solarMultiplier: 0, sceneGradient: "linear-gradient(180deg,#020617 0%,#0f172a 50%,#1e293b 100%)", solarAccent: "#60a5fa" });
  }
  if (code === 3) {
    return base({ weatherType: isDay ? "cloudy" : "partly_cloudy_night", weatherLabel: isDay ? "Nublado" : "Noche nublada", generationQualityLabel: isDay ? "Óptimo moderado para generación" : "Sin generación solar", solarMultiplier: isDay ? 0.45 : 0, sceneGradient: "linear-gradient(180deg,#1e293b 0%,#334155 50%,#475569 100%)", solarAccent: isDay ? "#fbbf24" : "#60a5fa" });
  }
  if (code >= 45 && code <= 48) {
    return base({ weatherType: "fog", weatherLabel: "Niebla", generationQualityLabel: "Generación reducida", solarMultiplier: 0.25, sceneGradient: "linear-gradient(180deg,#475569 0%,#64748b 50%,#94a3b8 100%)", solarAccent: "#94a3b8" });
  }
  if (code >= 51 && code <= 57) {
    return base({ weatherType: "drizzle", weatherLabel: "Llovizna", generationQualityLabel: "Generación baja", solarMultiplier: 0.25, sceneGradient: "linear-gradient(180deg,#1e293b 0%,#334155 50%,#1f2937 100%)", solarAccent: "#38bdf8", precipitation: "drizzle" });
  }
  if (code >= 61 && code <= 67) {
    const heavy = code >= 65;
    return base({ weatherType: heavy ? "heavy_rain" : "rain", weatherLabel: heavy ? "Lluvia intensa" : "Lluvioso", generationQualityLabel: "Bajo para generación", solarMultiplier: heavy ? 0.08 : 0.15, sceneGradient: "linear-gradient(180deg,#0f172a 0%,#1e293b 50%,#0b1320 100%)", solarAccent: "#38bdf8", precipitation: heavy ? "heavy_rain" : "rain" });
  }
  if (code >= 71 && code <= 77) {
    return isDay
      ? base({ weatherType: "snow", weatherLabel: "Nevado", generationQualityLabel: "Generación muy baja", solarMultiplier: 0.05, sceneGradient: "linear-gradient(180deg,#475569 0%,#94a3b8 50%,#e2e8f0 100%)", solarAccent: "#7dd3fc", precipitation: "snow" })
      : base({ weatherType: "snow_night", weatherLabel: "Noche Nevada", generationQualityLabel: "Sin generación solar", solarMultiplier: 0, sceneGradient: "linear-gradient(180deg,#020617 0%,#0f172a 50%,#1e3a5f 100%)", solarAccent: "#7dd3fc", precipitation: "snow" });
  }
  if (code >= 80 && code <= 82) {
    return base({ weatherType: "rain", weatherLabel: "Chubascos", generationQualityLabel: "Bajo para generación", solarMultiplier: 0.18, sceneGradient: "linear-gradient(180deg,#0f172a 0%,#1e293b 50%,#0b1320 100%)", solarAccent: "#38bdf8", precipitation: "rain" });
  }
  if (code >= 95) {
    return base({ weatherType: "thunderstorm", weatherLabel: "Tormenta eléctrica", generationQualityLabel: "Generación crítica", solarMultiplier: 0.05, sceneGradient: "linear-gradient(180deg,#020617 0%,#1e1b4b 50%,#0f172a 100%)", solarAccent: "#a78bfa", precipitation: "thunder" });
  }
  return base({ weatherType: "cloudy", weatherLabel: "—", generationQualityLabel: "—", solarMultiplier: 0.5, sceneGradient: "linear-gradient(180deg,#1e293b,#334155)", solarAccent: "#facc15" });
}

function WeatherIcon({ type, className = "h-8 w-8" }: { type: WeatherType; className?: string }) {
  const common = { className, strokeWidth: 1.8 } as const;
  switch (type) {
    case "clear_day": return <Sun {...common} style={{ color: "#facc15" }} />;
    case "clear_night": return <Moon {...common} style={{ color: "#bfdbfe" }} />;
    case "partly_cloudy_day": return <Cloud {...common} style={{ color: "#cbd5e1" }} />;
    case "partly_cloudy_night": return <Moon {...common} style={{ color: "#bfdbfe" }} />;
    case "cloudy":
    case "overcast": return <Cloud {...common} style={{ color: "#cbd5e1" }} />;
    case "drizzle": return <CloudDrizzle {...common} style={{ color: "#7dd3fc" }} />;
    case "rain":
    case "heavy_rain": return <CloudRain {...common} style={{ color: "#38bdf8" }} />;
    case "thunderstorm": return <CloudLightning {...common} style={{ color: "#a78bfa" }} />;
    case "snow":
    case "snow_night": return <CloudSnow {...common} style={{ color: "#7dd3fc" }} />;
    case "fog":
    case "mist":
    case "haze": return <CloudFog {...common} style={{ color: "#cbd5e1" }} />;
    default: return <Sun {...common} />;
  }
}

/* =========================================================================
   Daily totals hook
   ========================================================================= */
interface DailyTotals {
  pvKwh: number;
  gridImportKwh: number;
  loadKwh: number;
  gridExportKwh: number;
  batteryChargedKwh: number;
}

function useTodayTotals(siteId: string): DailyTotals {
  const [t, setT] = useState<DailyTotals>({ pvKwh: 0, gridImportKwh: 0, loadKwh: 0, gridExportKwh: 0, batteryChargedKwh: 0 });
  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_totals")
        .select("pv_kwh, grid_used_kwh, load_kwh, grid_exported_kwh, battery_charged_kwh")
        .eq("site_id", siteId)
        .eq("day", today)
        .maybeSingle();
      if (cancelled || !data) return;
      setT({
        pvKwh: Number(data.pv_kwh ?? 0),
        gridImportKwh: Number(data.grid_used_kwh ?? 0),
        loadKwh: Number(data.load_kwh ?? 0),
        gridExportKwh: Number((data as Record<string, unknown>).grid_exported_kwh ?? 0),
        batteryChargedKwh: Number((data as Record<string, unknown>).battery_charged_kwh ?? 0),
      });
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [siteId]);
  return t;
}

/* =========================================================================
   Helpers
   ========================================================================= */
/** Returns integer power with adaptive unit: <1000W -> "450" W, otherwise "1" or "12" kW. */
function fmtPower(w: number): { value: string; unit: string } {
  const abs = Math.abs(w);
  if (abs < 1000) return { value: String(Math.round(w)), unit: "W" };
  return { value: String(Math.round(w / 1000)), unit: "kW" };
}
function fmtKwh(v: number): string {
  return Math.round(v).toString();
}

/** Battery icon that fills proportionally to charge level (0-100). */
function BatteryLevelIcon({ pct, className = "h-5 w-5", color = "currentColor" }: { pct: number; className?: string; color?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const fillW = (p / 100) * 14; // inner width 14
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="17" height="10" rx="2" />
      <line x1="22" y1="11" x2="22" y2="13" />
      <rect x="5" y="9" width={fillW} height="6" rx="1" fill={color} stroke="none" />
    </svg>
  );
}

/* =========================================================================
   Floating card
   ========================================================================= */
function FloatCard({
  label, value, unit, sub, icon, accent, className = "", light = false,
}: {
  label: string; value: string; unit?: string; sub?: string;
  icon: React.ReactNode; accent: string; className?: string; light?: boolean;
}) {
  return (
    <div
      className={`pointer-events-auto inline-flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur-md shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] ${className}`}
      style={{
        background: light ? "rgba(255,255,255,0.88)" : "rgba(8,18,30,0.85)",
        borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
        {icon}
      </div>
      <div className="leading-tight">
        <div className={`text-[10px] font-semibold tracking-wider ${light ? "text-slate-500" : "text-white/60"}`}>{label}</div>
        <div className="flex items-baseline gap-1">
          <span className={`text-lg font-bold tabular-nums ${light ? "text-slate-900" : "text-white"}`}>{value}</span>
          {unit && <span className={`text-[11px] font-medium ${light ? "text-slate-500" : "text-white/60"}`}>{unit}</span>}
        </div>
        {sub && <div className="text-[10px] font-medium" style={{ color: accent }}>{sub}</div>}
      </div>
    </div>
  );
}

/* =========================================================================
   Energy house scene (SVG isometric, weather-aware)
   ========================================================================= */
function HouseScene({ theme }: { theme: WeatherTheme }) {
  // Decorative SVG isometric scene. Cards are overlaid via the parent.
  const sunVisible = theme.isDay && theme.solarMultiplier > 0.4;
  return (
    <svg viewBox="0 0 400 280" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="house-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id="house-wall-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f2937" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Sun / Moon */}
      {sunVisible && (
        <g>
          <circle cx="340" cy="60" r="22" fill="#fde68a" opacity="0.95" />
          <circle cx="340" cy="60" r="34" fill="#fde68a" opacity="0.18" />
          {[0,45,90,135,180,225,270,315].map(a => {
            const rad = (a*Math.PI)/180;
            return <line key={a} x1={340+Math.cos(rad)*30} y1={60+Math.sin(rad)*30} x2={340+Math.cos(rad)*42} y2={60+Math.sin(rad)*42} stroke="#fde68a" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>;
          })}
        </g>
      )}
      {!theme.isDay && (
        <g>
          <circle cx="340" cy="55" r="18" fill="#e2e8f0" opacity="0.95" />
          <circle cx="332" cy="48" r="18" fill={theme.sceneGradient.includes("020617") ? "#020617" : "#0f172a"} />
          {/* Stars */}
          {[[60,40],[120,30],[200,50],[260,35],[300,70],[80,80]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r="1" fill="#e2e8f0" opacity="0.7"/>
          ))}
        </g>
      )}

      {/* Mountains backdrop */}
      <path d="M0,200 L60,150 L120,180 L200,130 L280,170 L340,140 L400,180 L400,210 L0,210 Z" fill="#0f172a" opacity="0.55" />

      {/* Ground */}
      <path d="M0,200 L400,200 L400,280 L0,280 Z" fill="url(#ground)" />

      {/* Power pole */}
      <g transform="translate(40,120)" stroke="#475569" strokeWidth="1.5" fill="none">
        <line x1="10" y1="0" x2="10" y2="100" />
        <line x1="0" y1="20" x2="20" y2="20" />
        <line x1="2" y1="32" x2="18" y2="32" />
      </g>

      {/* House body */}
      <g>
        {/* Left wall */}
        <polygon points="140,130 220,110 220,200 140,210" fill="url(#house-wall-dark)" />
        {/* Front wall */}
        <polygon points="220,110 300,130 300,210 220,200" fill="url(#house-wall)" />
        {/* Roof flat top */}
        <polygon points="140,130 220,110 300,130 220,150" fill="#334155" />
        {/* Windows (glow at night) */}
        <rect x="155" y="155" width="15" height="20" fill={theme.isDay ? "#1e293b" : "#fde68a"} opacity={theme.isDay ? 0.6 : 0.85}/>
        <rect x="180" y="155" width="15" height="20" fill={theme.isDay ? "#1e293b" : "#fde68a"} opacity={theme.isDay ? 0.6 : 0.85}/>
        <rect x="235" y="160" width="18" height="22" fill={theme.isDay ? "#1e293b" : "#fde68a"} opacity={theme.isDay ? 0.5 : 0.9}/>
        <rect x="265" y="160" width="18" height="22" fill={theme.isDay ? "#1e293b" : "#fde68a"} opacity={theme.isDay ? 0.5 : 0.9}/>

        {/* Solar panels on roof */}
        <g>
          {[0,1].map(row => [0,1,2].map(col => (
            <rect key={`${row}-${col}`}
              x={170 + col*22} y={118 + row*8}
              width="20" height="7" fill="url(#panel)" stroke="#1e40af" strokeWidth="0.5"
              transform={`skewX(-20) translate(${row*4},${-row*2})`}
              opacity={theme.weatherType === "snow" || theme.weatherType === "snow_night" ? 0.4 : 1}
            />
          )))}
          {(theme.weatherType === "snow" || theme.weatherType === "snow_night") && (
            <polygon points="160,115 250,108 248,114 158,121" fill="#f1f5f9" opacity="0.85" />
          )}
        </g>
      </g>

      {/* Battery cabinet */}
      <g transform="translate(310,165)">
        <rect x="0" y="0" width="28" height="40" rx="3" fill="#cbd5e1" />
        <rect x="3" y="3" width="22" height="6" fill="#e2e8f0" />
        <line x1="3" y1="30" x2="25" y2="30" stroke="#22c55e" strokeWidth="2" />
      </g>

      {/* Trees */}
      {theme.weatherType !== "snow" && theme.weatherType !== "snow_night" && (
        <g fill={theme.isDay ? "#15803d" : "#0f172a"} opacity="0.85">
          <circle cx="20" cy="195" r="14" />
          <circle cx="370" cy="200" r="12" />
          <circle cx="385" cy="195" r="10" />
        </g>
      )}

      {/* Flow lines - subtle glowing curves */}
      <g fill="none" strokeWidth="2" strokeLinecap="round">
        {/* Solar to house (yellow) */}
        {theme.solarMultiplier > 0.05 && (
          <path d="M 210,100 Q 215,135 230,160" stroke={theme.solarAccent} strokeDasharray="3 4" opacity="0.9">
            <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1.2s" repeatCount="indefinite"/>
          </path>
        )}
        {/* Grid to house (blue) */}
        <path d="M 50,140 Q 130,160 220,175" stroke="#38bdf8" strokeDasharray="3 5" opacity="0.85">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.6s" repeatCount="indefinite"/>
        </path>
        {/* House to battery (green) */}
        <path d="M 300,180 Q 312,180 318,185" stroke="#22c55e" strokeDasharray="3 4" opacity="0.9">
          <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1.4s" repeatCount="indefinite"/>
        </path>
      </g>

      {/* Precipitation overlay */}
      {(theme.precipitation === "rain" || theme.precipitation === "heavy_rain" || theme.precipitation === "drizzle") && (
        <g stroke="#7dd3fc" strokeWidth={theme.precipitation === "heavy_rain" ? 1.2 : 0.8} opacity={theme.precipitation === "drizzle" ? 0.4 : 0.6}>
          {Array.from({length: theme.precipitation === "heavy_rain" ? 60 : 35}).map((_,i)=>{
            const x = (i*53) % 400;
            const y = (i*37) % 200;
            return <line key={i} x1={x} y1={y} x2={x-4} y2={y+12}>
              <animate attributeName="y1" from={y-30} to={y+200} dur={`${0.6 + (i%5)*0.2}s`} repeatCount="indefinite"/>
              <animate attributeName="y2" from={y-18} to={y+212} dur={`${0.6 + (i%5)*0.2}s`} repeatCount="indefinite"/>
            </line>;
          })}
        </g>
      )}
      {theme.precipitation === "snow" && (
        <g fill="#f1f5f9" opacity="0.9">
          {Array.from({length: 40}).map((_,i)=>{
            const x = (i*43) % 400;
            const y = (i*29) % 200;
            return <circle key={i} cx={x} cy={y} r="1.4">
              <animate attributeName="cy" from={y-30} to={y+220} dur={`${2 + (i%4)*0.6}s`} repeatCount="indefinite"/>
            </circle>;
          })}
        </g>
      )}
      {theme.precipitation === "thunder" && (
        <g>
          <path d="M180,40 L195,70 L185,75 L200,110" stroke="#fde68a" strokeWidth="2" fill="none" opacity="0.9">
            <animate attributeName="opacity" values="0;0.95;0;0" keyTimes="0;0.05;0.15;1" dur="4s" repeatCount="indefinite"/>
          </path>
        </g>
      )}
    </svg>
  );
}

/* =========================================================================
   Main view
   ========================================================================= */
export function SolarMonitorView({
  latest, siteId, pvConfig: pvConfigProp,
}: {
  latest: DashboardSample | null;
  siteId: string;
  pvConfig?: PvConfig | null;
}) {
  const { resolved } = useTheme();
  const liveCfg = usePvConfig(pvConfigProp === undefined ? siteId : "__skipped__");
  const pv: PvConfig | null = pvConfigProp ?? liveCfg.config;
  const weather = useSolarReferenceWeather(pv);
  const totals = useTodayTotals(siteId);

  // Live power values (W)
  const solarW = Number(latest?.pv_input_power ?? 0);
  const loadW = Number(latest?.ac_output_active_power ?? 0);
  const batteryV = Number(latest?.battery_voltage ?? 0);
  const batterySoc = Number(latest?.battery_capacity ?? 0);
  const gridV = Number(latest?.grid_voltage ?? 0);
  const gridConnected = gridV > 50;

  const batChargeW = Math.max(0, Number(latest?.battery_charging_current ?? 0) * batteryV);
  const batDischargeW = Math.max(0, Number(latest?.battery_discharge_current ?? 0) * batteryV);
  const batteryW = batDischargeW - batChargeW; // >0 descargando, <0 cargando
  // gridKw: positive = importando, negative = exportando.
  // Estimación: aporte red = (consumo + carga batería) - (pv + descarga batería)
  const estGridW = gridConnected ? (loadW + batChargeW - solarW - batDischargeW) : 0;
  const gridKw = estGridW / 1000;

  // Day/night detection based on local hour (fallback) + weather code
  const isDay = useMemo(() => {
    const h = new Date().getHours();
    return h >= 7 && h < 19;
  }, []);

  const theme: WeatherTheme = useMemo(() => {
    if (!weather) return mapWeather(0, isDay);
    return mapWeather(weather.current.weatherCode, isDay);
  }, [weather, isDay]);

  const today = weather?.daily?.[0];
  const isLight = resolved === "light";

  const batteryKwh = pv?.battery_kwh ? (pv.battery_kwh * batterySoc / 100) : null;

  const exportToday = Math.max(0, totals.gridExportKwh);
  const showExport = exportToday > 0;

  return (
    <div className="space-y-4">
      {/* ============= HEADER ============= */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10">
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold leading-tight text-foreground">Monitor Solar</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sistema Residencial</span>
              <span className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-400 font-medium">En línea</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10">
            <Bell className="h-4 w-4" />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/5">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">


      {/* ============= SCENE WITH FLOATING CARDS ============= */}
      <div
        className="relative overflow-hidden rounded-3xl border w-full aspect-[4/3] sm:aspect-[16/10] lg:aspect-[16/10] max-h-[640px] mx-auto"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: isLight ? "#e5eef7" : "#020617",
        }}
      >


        {/* Hyperrealistic background scene */}
        <img
          src={pickSceneImage(theme)}
          alt="Escena residencial solar"
          className="absolute inset-0 h-full w-full object-cover"
          width={1024}
          height={1280}
          loading="lazy"
        />
        {/* Subtle dark gradient for card legibility */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: isLight ? "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.0) 60%, rgba(15,23,42,0.22) 100%)" : "linear-gradient(180deg, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.05) 30%, rgba(2,6,23,0.0) 60%, rgba(2,6,23,0.55) 100%)" }}
        />

        {/* Animated precipitation overlay on top of photo */}
        {(theme.precipitation === "rain" || theme.precipitation === "heavy_rain" || theme.precipitation === "drizzle") && (
          <svg viewBox="0 0 400 420" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <g stroke="#bae6fd" strokeWidth={theme.precipitation === "heavy_rain" ? 1.1 : 0.7} opacity={theme.precipitation === "drizzle" ? 0.35 : 0.55}>
              {Array.from({ length: theme.precipitation === "heavy_rain" ? 70 : 40 }).map((_, i) => {
                const x = (i * 53) % 400;
                const y = (i * 37) % 300;
                return (
                  <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 14}>
                    <animate attributeName="y1" from={y - 40} to={y + 380} dur={`${0.55 + (i % 5) * 0.18}s`} repeatCount="indefinite" />
                    <animate attributeName="y2" from={y - 26} to={y + 394} dur={`${0.55 + (i % 5) * 0.18}s`} repeatCount="indefinite" />
                  </line>
                );
              })}
            </g>
          </svg>
        )}
        {theme.precipitation === "snow" && (
          <svg viewBox="0 0 400 420" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <g fill="#f1f5f9" opacity="0.9">
              {Array.from({ length: 50 }).map((_, i) => {
                const x = (i * 43) % 400;
                const y = (i * 29) % 300;
                return (
                  <circle key={i} cx={x} cy={y} r={1 + (i % 3) * 0.4}>
                    <animate attributeName="cy" from={y - 40} to={y + 420} dur={`${2 + (i % 4) * 0.6}s`} repeatCount="indefinite" />
                    <animate attributeName="cx" values={`${x};${x + 6};${x - 4};${x}`} dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
                  </circle>
                );
              })}
            </g>
          </svg>
        )}
        {theme.precipitation === "thunder" && (
          <svg viewBox="0 0 400 420" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <path d="M180,40 L195,80 L185,86 L205,140" stroke="#fde68a" strokeWidth="2.5" fill="none">
              <animate attributeName="opacity" values="0;0.95;0;0" keyTimes="0;0.05;0.15;1" dur="4s" repeatCount="indefinite" />
            </path>
          </svg>
        )}

        {/* Floating cards layer */}
        <div className="relative h-full w-full">
          {(() => {
            const solar = fmtPower(solarW);
            const grid = fmtPower(estGridW);
            const load = fmtPower(loadW);
            const batPct = Math.round(batterySoc);
            return (
              <>
                {/* Solar — top center */}
                <div className="absolute left-1/2 top-3 -translate-x-1/2 sm:top-5">
                  <FloatCard
                    icon={<WeatherIcon type={theme.weatherType} className="h-5 w-5" />}
                    accent={theme.solarAccent}
                    label="SOLAR"
                    value={solar.value}
                    unit={solar.unit}
                    sub={solarW > 50 ? "Generando" : theme.isDay ? "Baja generación" : "Sin generación"}
                    light={isLight}
                  />
                </div>

                {/* Grid — left middle */}
                <div className="absolute left-2 top-[42%] -translate-y-1/2 sm:left-4">
                  <FloatCard
                    icon={<Zap className="h-5 w-5" />}
                    accent="#38bdf8"
                    label="RED"
                    value={grid.value}
                    unit={grid.unit}
                    sub={!gridConnected ? "Desconectada" : estGridW >= 0 ? "Importando" : "Exportando"}
                    light={isLight}
                  />
                </div>

                {/* Battery — top right (near house upper-right) */}
                <div className="absolute right-2 top-[28%] sm:right-4 sm:top-[30%]">
                  <FloatCard
                    icon={<BatteryLevelIcon pct={batPct} className="h-5 w-5" color="#22c55e" />}
                    accent="#22c55e"
                    label="BATERÍA"
                    value={`${batPct}`}
                    unit="%"
                    sub={batteryKwh != null ? `${batteryKwh.toFixed(1)} kWh` : (batChargeW > 20 ? "Cargando" : batDischargeW > 20 ? "Descargando" : "En espera")}
                    light={isLight}
                  />
                </div>


                {/* Consumo — bottom center */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 sm:bottom-5">
                  <FloatCard
                    icon={<HomeIcon className="h-5 w-5" />}
                    accent="#3b82f6"
                    label="CONSUMO"
                    value={load.value}
                    unit={load.unit}
                    sub="Consumo de casa"
                    light={isLight}
                  />
                </div>
              </>
            );
          })()}
        </div>
      </div>
        </div>

        <div className="space-y-4">
      {/* ============= WEATHER CARD ============= */}
      <div
        className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md"
        style={{ background: isLight ? "rgba(255,255,255,0.82)" : "rgba(8,18,30,0.85)", borderColor: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
            <WeatherIcon type={theme.weatherType} className="h-7 w-7" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold text-foreground">{theme.weatherLabel}</div>
            <div className="text-xl font-bold tabular-nums text-foreground">
              {weather ? Math.round(weather.current.temperature) : "—"}<span className="text-sm font-medium text-muted-foreground">° C</span>
            </div>
            {today && (
              <div className="text-[11px] text-muted-foreground">
                Hoy: Máx. {Math.round(today.max)}° &nbsp; Mín. {Math.round(today.min)}°
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5">
            <WeatherIcon type={theme.weatherType} className="h-4 w-4" />
          </div>
          <div className="max-w-[140px] text-xs font-medium text-muted-foreground">
            {theme.generationQualityLabel}
          </div>
        </div>
      </div>

      {/* ============= FLOW BAR ============= */}

      <div
        className="rounded-2xl border p-4 backdrop-blur-md"
        style={{ background: isLight ? "rgba(255,255,255,0.82)" : "rgba(8,18,30,0.85)", borderColor: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)" }}
      >
        <div className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground">FLUJO DE ENERGÍA</div>
        <div className="grid grid-cols-2 items-center gap-3 sm:grid-cols-4">
          {(() => {
            const s = fmtPower(solarW), g = fmtPower(estGridW), l = fmtPower(loadW), b = fmtPower(Math.abs(batteryW));
            return (
              <>
                <FlowNode icon={<WeatherIcon type={theme.weatherType} className="h-6 w-6" />} value={s.value} unit={s.unit} label="Solar" connector={theme.solarAccent} light={isLight} />
                <FlowNode icon={<Zap className="h-6 w-6" style={{ color: "#38bdf8" }} />} value={g.value} unit={g.unit} label="Red" connector="#38bdf8" light={isLight} />
                <FlowNode icon={<HomeIcon className="h-6 w-6" style={{ color: "#3b82f6" }} />} value={l.value} unit={l.unit} label="Consumo" connector="#22c55e" light={isLight} />
                <FlowNode icon={<BatteryLevelIcon pct={Math.round(batterySoc)} className="h-6 w-6" color="#22c55e" />} value={b.value} unit={b.unit} label="Batería" connector="transparent" light={isLight} last />
              </>
            );
          })()}
        </div>
      </div>

      {/* ============= TODAY SUMMARY ============= */}
      <div
        className="rounded-2xl border p-4 backdrop-blur-md"
        style={{ background: isLight ? "rgba(255,255,255,0.82)" : "rgba(8,18,30,0.85)", borderColor: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)" }}
      >
        <div className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground">RESUMEN DE HOY</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<WeatherIcon type={theme.weatherType} className="h-5 w-5" />}
            accent={theme.solarAccent}
            title="Producción Solar"
            value={fmtKwh(totals.pvKwh)}
            unit="kWh"
            sub="Energía generada"
            light={isLight}
          />
          <SummaryCard
            icon={<Zap className="h-5 w-5" style={{ color: "#38bdf8" }} />}
            accent="#38bdf8"
            title="De la Red"
            value={fmtKwh(totals.gridImportKwh)}
            unit="kWh"
            sub="Importación"
            light={isLight}
          />
          <SummaryCard
            icon={<HomeIcon className="h-5 w-5" style={{ color: "#3b82f6" }} />}
            accent="#3b82f6"
            title="Consumo"
            value={fmtKwh(totals.loadKwh)}
            unit="kWh"
            sub="Uso total"
            light={isLight}
          />
          {showExport ? (
            <SummaryCard
              icon={<Zap className="h-5 w-5" style={{ color: "#22c55e" }} />}
              accent="#22c55e"
              title="A la Red"
              value={fmtKwh(exportToday)}
              unit="kWh"
                sub="Exportación"
                light={isLight}
            />
          ) : (
            <SummaryCard
              icon={<BatteryFull className="h-5 w-5" style={{ color: "#22c55e" }} />}
              accent="#22c55e"
              title="A la Batería"
              value={fmtKwh(totals.batteryChargedKwh)}
              unit="kWh"
                sub="Almacenada"
                light={isLight}
            />
          )}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  icon, value, unit = "kW", label, connector, last = false, light = false,
}: { icon: React.ReactNode; value: string; unit?: string; label: string; connector: string; last?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${light ? "bg-slate-900/5" : "bg-white/5"}`}>{icon}</div>
      </div>
      <div className="min-w-0 leading-tight">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
      {!last && (
        <div className="ml-auto hidden h-px flex-1 sm:block" style={{ background: `linear-gradient(90deg, ${connector}, transparent)` }} />
      )}
    </div>
  );
}

function SummaryCard({
  icon, accent, title, value, unit, sub, light = false,
}: { icon: React.ReactNode; accent: string; title: string; value: string; unit: string; sub: string; light?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${light ? "border-slate-900/10 bg-slate-900/[0.03]" : "border-white/5 bg-white/[0.02]"}`}>
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${accent}1a` }}>
        {icon}
      </div>
      <div className="text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
