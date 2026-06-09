import { useEffect, useMemo, useState } from "react";
import { Bell, MoreVertical, Menu, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog, Home as HomeIcon, BatteryFull, Zap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePvConfig, type PvConfig } from "@/components/PvSystemConfig";
import { useSolarReferenceWeather, type DashboardWeatherData } from "@/components/ReferenceDashboardCards";
import { formatInverterMode, type DashboardSample } from "@/components/SiteDashboardView";
import { useTheme } from "@/lib/theme";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SavingsCard } from "@/components/SavingsCard";
import sceneSunnyDay from "@/assets/scene-sunny-day.jpg";
import sceneCloudyDay from "@/assets/scene-cloudy-day.jpg";
import sceneRainyNight from "@/assets/scene-rainy-night.jpg";
import sceneSnowyNight from "@/assets/scene-snowy-night.jpg";
import detailSolarImg from "@/assets/detail-solar.jpg";
import detailGridImg from "@/assets/detail-grid.jpg";

import detailConsumoImg from "@/assets/detail-consumo.jpg";

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

function useSavingsKwh(siteId: string): { todayKwh: number; monthKwh: number; yearKwh: number } {
  const [s, setS] = useState({ todayKwh: 0, monthKwh: 0, yearKwh: 0 });
  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_totals")
        .select("day, pv_kwh, battery_discharged_kwh")
        .eq("site_id", siteId)
        .gte("day", yearStart);
      if (cancelled || !data) return;
      const month = now.getMonth();
      let y = 0, m = 0, t = 0;
      for (const row of data as Array<{ day: string; pv_kwh: number | null; battery_discharged_kwh: number | null }>) {
        const saved = Number(row.pv_kwh || 0) + Number(row.battery_discharged_kwh || 0);
        y += saved;
        const d = new Date(`${row.day}T00:00:00`);
        if (d.getMonth() === month) m += saved;
        if (row.day === todayStr) t += saved;
      }
      setS({ todayKwh: t, monthKwh: m, yearKwh: y });
    })();
    return () => { cancelled = true; };
  }, [siteId]);
  return s;
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

/** Hyperrealistic animated battery hero — liquid wave fill, bubbles when charging, glowing bolt. */
function BatteryAnimated({ pct, charging, discharging }: { pct: number; charging: boolean; discharging: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  const innerX = 18, innerY = 26, innerW = 232, innerH = 88;
  const fillW = (p / 100) * innerW;
  const fillColor = p < 20 ? "#ef4444" : p < 40 ? "#f59e0b" : "#22c55e";
  const glowColor = p < 20 ? "#fecaca" : p < 40 ? "#fde68a" : "#bbf7d0";
  const surfaceX = innerX + fillW;
  return (
    <svg viewBox="0 0 280 140" className="h-full w-full max-w-[420px] drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
      <defs>
        <linearGradient id="bat-shell" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="55%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="bat-bezel" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
        <linearGradient id="bat-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fillColor} stopOpacity="1" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="bat-gloss" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bat-glow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor={glowColor} stopOpacity="0.65" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>
        <clipPath id="bat-clip">
          <rect x={innerX} y={innerY} width={innerW} height={innerH} rx="10" />
        </clipPath>
      </defs>

      {/* Outer shell */}
      <rect x="4" y="10" width="252" height="120" rx="22" fill="url(#bat-shell)" stroke="#0b1220" strokeWidth="2" />
      <rect x="8" y="14" width="244" height="112" rx="18" fill="none" stroke="#334155" strokeOpacity="0.4" strokeWidth="1" />
      {/* Cap */}
      <rect x="256" y="48" width="20" height="44" rx="6" fill="url(#bat-shell)" stroke="#0b1220" strokeWidth="2" />
      {/* Inner well */}
      <rect x={innerX - 2} y={innerY - 2} width={innerW + 4} height={innerH + 4} rx="12" fill="url(#bat-bezel)" />
      <rect x={innerX} y={innerY} width={innerW} height={innerH} rx="10" fill="#020617" />

      {/* Liquid fill */}
      <g clipPath="url(#bat-clip)">
        <rect x={innerX} y={innerY} width={Math.max(fillW, 0)} height={innerH} fill="url(#bat-fill)" />
        {/* Surface wave */}
        {fillW > 6 && (
          <path
            fill={fillColor}
            opacity="0.85"
            d={`M ${surfaceX - 50} ${innerY} q 10 8 20 0 t 20 0 t 20 0 v ${innerH} h -60 z`}
          >
            <animate
              attributeName="d"
              dur={charging ? "1.6s" : "3.4s"}
              repeatCount="indefinite"
              values={`
                M ${surfaceX - 50} ${innerY + 0} q 10 6 20 0 t 20 0 t 20 0 v ${innerH} h -60 z;
                M ${surfaceX - 50} ${innerY - 4} q 10 -6 20 0 t 20 0 t 20 0 v ${innerH + 4} h -60 z;
                M ${surfaceX - 50} ${innerY + 0} q 10 6 20 0 t 20 0 t 20 0 v ${innerH} h -60 z
              `}
            />
          </path>
        )}
        {/* Inner glow */}
        <rect x={innerX} y={innerY} width={Math.max(fillW, 0)} height={innerH} fill="url(#bat-glow)" />
        {/* Bubbles while charging */}
        {charging && Array.from({ length: 7 }).map((_, i) => {
          const cx = innerX + 18 + (i * 28) % Math.max(20, fillW - 10);
          const r = 1.5 + (i % 3) * 0.6;
          const dur = 1.4 + (i % 4) * 0.5;
          return (
            <circle key={i} cx={cx} cy={innerY + innerH - 4} r={r} fill="#fff" opacity="0.7">
              <animate attributeName="cy" from={innerY + innerH - 4} to={innerY + 6} dur={`${dur}s`} repeatCount="indefinite" begin={`${i * 0.2}s`} />
              <animate attributeName="opacity" values="0;0.8;0" dur={`${dur}s`} repeatCount="indefinite" begin={`${i * 0.2}s`} />
              <animate attributeName="r" values={`${r};${r * 1.4};${r * 0.6}`} dur={`${dur}s`} repeatCount="indefinite" begin={`${i * 0.2}s`} />
            </circle>
          );
        })}
        {/* Discharge "drain" lines */}
        {discharging && Array.from({ length: 4 }).map((_, i) => (
          <line key={i} x1={innerX + 8 + i * 18} y1={innerY + 10} x2={innerX + 8 + i * 18} y2={innerY + innerH - 10}
            stroke="#fca5a5" strokeWidth="1" opacity="0.4">
            <animate attributeName="opacity" values="0;0.5;0" dur={`${1.2 + i * 0.2}s`} repeatCount="indefinite" begin={`${i * 0.15}s`} />
          </line>
        ))}
      </g>

      {/* Top gloss */}
      <rect x={innerX} y={innerY} width={innerW} height="22" rx="10" fill="url(#bat-gloss)" />

      {/* SOC text */}
      <text x={innerX + innerW / 2} y={innerY + innerH / 2 + 10} textAnchor="middle"
        fontFamily="system-ui,sans-serif" fontWeight="800" fontSize="36"
        fill="#fff" stroke="rgba(0,0,0,0.4)" strokeWidth="1" paintOrder="stroke">
        {Math.round(p)}%
      </text>

      {/* Charging bolt overlay */}
      {charging && (
        <g transform="translate(126, 44)">
          <path d="M14 0 L0 30 L11 30 L7 52 L26 18 L14 18 Z"
            fill="#fde68a" stroke="#a16207" strokeWidth="1.4">
            <animate attributeName="opacity" values="0.65;1;0.65" dur="1.1s" repeatCount="indefinite" />
          </path>
        </g>
      )}
    </svg>
  );
}

/* =========================================================================
   Floating card
   ========================================================================= */
function FloatCard({
  label, value, unit, sub, icon, accent, className = "", light = false, onClick,
}: {
  label: string; value: string; unit?: string; sub?: string;
  icon: React.ReactNode; accent: string; className?: string; light?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`pointer-events-auto inline-flex items-center gap-1 sm:gap-3 rounded-lg sm:rounded-2xl border px-1.5 py-1 sm:px-3.5 sm:py-2.5 backdrop-blur-md shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] transition-all duration-200 ${onClick ? "cursor-pointer hover:scale-105 active:scale-95" : ""} ${className}`}
      style={{
        background: light ? "rgba(255,255,255,0.92)" : "rgba(8,18,30,0.85)",
        borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex h-5 w-5 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-md sm:rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
        {icon}
      </div>
      <div className="leading-tight text-left">
        <div className={`text-[7px] sm:text-[10px] font-semibold tracking-wider ${light ? "text-slate-500" : "text-white/60"}`}>{label}</div>
        <div className="flex items-baseline gap-0.5 sm:gap-1">
          <span className={`text-[11px] sm:text-lg font-bold tabular-nums ${light ? "text-slate-900" : "text-white"}`}>{value}</span>
          {unit && <span className={`text-[8px] sm:text-[11px] font-medium ${light ? "text-slate-500" : "text-white/60"}`}>{unit}</span>}
        </div>
        {sub && <div className="text-[7px] sm:text-[10px] font-medium leading-tight" style={{ color: accent }}>{sub}</div>}
      </div>
    </Tag>
  );
}

/* =========================================================================
   Widget detail dialog
   ========================================================================= */
interface DetailStat { label: string; value: string; unit?: string; accent?: string; hint?: string }
function WidgetDetailDialog({
  open, onOpenChange, image, heroNode, title, subtitle, accent, icon, stats, description, light,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  image?: string;
  heroNode?: React.ReactNode;
  title: string; subtitle: string; accent: string;
  icon: React.ReactNode; stats: DetailStat[]; description: string; light: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg overflow-hidden border-0 p-0 sm:rounded-3xl max-h-[92vh] flex flex-col"
        style={{ background: light ? "rgba(255,255,255,0.98)" : "rgba(8,18,30,0.96)" }}
      >
        {/* Hero */}
        <div
          className="relative h-52 w-full overflow-hidden sm:h-60 shrink-0"
          style={heroNode ? { background: light ? "linear-gradient(135deg,#e2e8f0 0%,#94a3b8 100%)" : "linear-gradient(135deg,#0b1325 0%,#020617 100%)" } : undefined}
        >
          {heroNode ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 animate-[scale-in_0.4s_ease-out]">
              {heroNode}
            </div>
          ) : (
            <img
              src={image}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover animate-[scale-in_0.5s_ease-out]"
              loading="lazy"
              width={1024}
              height={512}
            />
          )}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, transparent 0%, transparent 45%, ${light ? "rgba(255,255,255,0.95)" : "rgba(8,18,30,0.95)"} 100%)` }}
          />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl backdrop-blur-md" style={{ background: `${accent}33`, color: accent, border: `1px solid ${accent}55` }}>
                {icon}
              </div>
              <div>
                <DialogTitle className={`text-xl font-bold ${light ? "text-slate-900" : "text-white"}`}>{title}</DialogTitle>
                <DialogDescription className={`text-xs ${light ? "text-slate-600" : "text-white/70"}`}>{subtitle}</DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5 p-4 sm:p-5">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="rounded-xl border p-2.5 backdrop-blur-md animate-fade-in"
                style={{
                  background: light ? "rgba(248,250,252,0.9)" : "rgba(15,23,42,0.6)",
                  borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)",
                  animationDelay: `${i * 50}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <div className={`text-[9px] font-semibold uppercase tracking-wider ${light ? "text-slate-500" : "text-white/50"}`}>{s.label}</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-base font-bold tabular-nums sm:text-lg" style={{ color: s.accent ?? accent }}>{s.value}</span>
                  {s.unit && <span className={`text-[10px] ${light ? "text-slate-500" : "text-white/60"}`}>{s.unit}</span>}
                </div>
                {s.hint && <div className={`mt-0.5 text-[9px] ${light ? "text-slate-400" : "text-white/40"}`}>{s.hint}</div>}
              </div>
            ))}
          </div>

          <div className={`px-4 pb-5 text-xs leading-relaxed sm:px-5 ${light ? "text-slate-600" : "text-white/70"}`}>
            {description}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const batteryCapKwh = pv?.battery_kwh ?? null;

  const exportToday = Math.max(0, totals.gridExportKwh);
  const showExport = exportToday > 0;

  // Derived metrics for popups
  const inverter = formatInverterMode(latest?.inverter_mode);
  const selfFromSolar = Math.max(0, totals.pvKwh - exportToday);
  const selfSufficiencyPct = totals.loadKwh > 0 ? Math.round((selfFromSolar / totals.loadKwh) * 100) : 0;
  const solarEffPct = pv?.array_kwp && pv.array_kwp > 0 ? Math.round((solarW / (pv.array_kwp * 1000)) * 100) : null;
  const currency = pv?.currency ?? "";
  const energyPrice = Number(pv?.energy_price ?? 0);
  const feedInPrice = Number(pv?.feed_in_price ?? 0);
  const gridCostToday = totals.gridImportKwh * energyPrice;
  const exportRevenueToday = exportToday * feedInPrice;
  const savedToday = selfFromSolar * energyPrice;
  const netBalanceToday = exportRevenueToday + savedToday - gridCostToday;
  // Backup time: remaining battery energy / current load
  const backupHours = batteryKwh != null && loadW > 50 ? (batteryKwh * 1000) / loadW : null;
  const batCurrentA = Math.max(
    Number(latest?.battery_charging_current ?? 0),
    Number(latest?.battery_discharge_current ?? 0),
  );
  const batStateLabel = batChargeW > 20 ? "Cargando" : batDischargeW > 20 ? "Descargando" : "En espera";
  const co2Saved = (totals.pvKwh * 0.4).toFixed(1); // ~0.4 kg CO2 per kWh avoided
  const panelLabel = pv?.panel_count && pv?.panel_watts
    ? `${pv.panel_count}×${pv.panel_watts}W`
    : pv?.panel_count ? `${pv.panel_count}` : "—";
  const orientationLabel = pv?.azimuth != null && pv?.tilt != null
    ? `${Math.round(pv.azimuth)}°/${Math.round(pv.tilt)}°`
    : "—";
  const fmtMoney = (v: number) => `${currency ? currency + " " : ""}${Math.round(v).toLocaleString()}`;
  const savings = useSavingsKwh(siteId);
  const liveSavingsW = Math.max(0, solarW) + Math.max(0, batDischargeW);
  const savingsPerHour = (liveSavingsW / 1000) * energyPrice;
  const savingsToday = savings.todayKwh * energyPrice;
  const savingsMonth = savings.monthKwh * energyPrice;
  const dayOfYear = Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000));
  const projectedYearKwh = savings.yearKwh > 0 ? (savings.yearKwh / dayOfYear) * 365 : 0;
  const savingsYear = projectedYearKwh * energyPrice;


  const [openDetail, setOpenDetail] = useState<null | "solar" | "grid" | "battery" | "consumo">(null);

  return (
    <div className="space-y-4">
      {/* Header eliminado por solicitud del usuario */}


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
                <div className="absolute left-1/2 top-2 -translate-x-1/2 sm:top-5">
                  <FloatCard
                    icon={<WeatherIcon type={theme.weatherType} className="h-5 w-5" />}
                    accent={theme.solarAccent}
                    label="SOLAR"
                    value={solar.value}
                    unit={solar.unit}
                    sub={solarW > 50 ? "Generando" : theme.isDay ? "Baja generación" : "Sin generación"}
                    light={isLight}
                    onClick={() => setOpenDetail("solar")}
                  />
                </div>

                {/* Grid — left middle */}
                <div className="absolute left-1.5 top-[38%] -translate-y-1/2 sm:left-4 sm:top-[42%]">
                  <FloatCard
                    icon={<Zap className="h-5 w-5" />}
                    accent="#38bdf8"
                    label="RED"
                    value={grid.value}
                    unit={grid.unit}
                    sub={!gridConnected ? "Desconectada" : estGridW >= 0 ? "Importando" : "Exportando"}
                    light={isLight}
                    onClick={() => setOpenDetail("grid")}
                  />
                </div>

                {/* Battery — bottom right (over battery cabinet) */}
                <div className="absolute right-1.5 bottom-[12%] sm:right-4 sm:bottom-[18%]">
                  <FloatCard
                    icon={<BatteryLevelIcon pct={batPct} className="h-5 w-5" color="#22c55e" />}
                    accent="#22c55e"
                    label="BATERÍA"
                    value={`${batPct}`}
                    unit="%"
                    sub={batteryKwh != null ? `${batteryKwh.toFixed(1)} kWh` : (batChargeW > 20 ? "Cargando" : batDischargeW > 20 ? "Descargando" : "En espera")}
                    light={isLight}
                    onClick={() => setOpenDetail("battery")}
                  />
                </div>

                {/* Consumo — bottom center */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 sm:bottom-5">
                  <FloatCard
                    icon={<HomeIcon className="h-5 w-5" />}
                    accent="#3b82f6"
                    label="CONSUMO"
                    value={load.value}
                    unit={load.unit}
                    sub="Consumo de casa"
                    light={isLight}
                    onClick={() => setOpenDetail("consumo")}
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

      {/* ============= ECONOMIC SAVINGS ============= */}
      <div
        className="rounded-2xl border p-3 backdrop-blur-md"
        style={{ background: isLight ? "rgba(255,255,255,0.82)" : "rgba(8,18,30,0.85)", borderColor: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)" }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground">AHORRO ECONÓMICO</div>
          {energyPrice > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {fmtMoney(energyPrice)}/kWh{feedInPrice > 0 ? ` · ${fmtMoney(feedInPrice)}/kWh inj.` : ""}
            </div>
          )}
        </div>
        {energyPrice > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryCard
              icon={<Zap className="h-5 w-5" style={{ color: "#22c55e" }} />}
              accent="#22c55e"
              title="Ahora"
              value={fmtMoney(savingsPerHour)}
              unit="/h"
              sub="Ahorrando ahora"
              light={isLight}
            />
            <SummaryCard
              icon={<Sun className="h-5 w-5" style={{ color: "#f59e0b" }} />}
              accent="#f59e0b"
              title="Hoy"
              value={fmtMoney(savingsToday)}
              unit=""
              sub={`${savings.todayKwh.toFixed(1)} kWh evitados`}
              light={isLight}
            />
            <SummaryCard
              icon={<HomeIcon className="h-5 w-5" style={{ color: "#3b82f6" }} />}
              accent="#3b82f6"
              title="Este mes"
              value={fmtMoney(savingsMonth)}
              unit=""
              sub={`${savings.monthKwh.toFixed(0)} kWh evitados`}
              light={isLight}
            />
            <SummaryCard
              icon={<BatteryFull className="h-5 w-5" style={{ color: "#a78bfa" }} />}
              accent="#a78bfa"
              title="Año proj."
              value={fmtMoney(savingsYear)}
              unit=""
              sub={savings.yearKwh > 0 ? `${savings.yearKwh.toFixed(0)} kWh reales` : "estimado"}
              light={isLight}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Configura el <strong>precio del kWh</strong> en el sistema fotovoltaico para ver cuánto dinero estás ahorrando.
          </p>
        )}
      </div>
    </div>
  </div>

      {/* ============= DETAIL DIALOGS ============= */}
      <WidgetDetailDialog
        open={openDetail === "solar"}
        onOpenChange={(v) => !v && setOpenDetail(null)}
        image={detailSolarImg}
        title="Generación Solar"
        subtitle={theme.weatherLabel + " · " + theme.generationQualityLabel}
        accent={theme.solarAccent}
        icon={<WeatherIcon type={theme.weatherType} className="h-6 w-6" />}
        light={isLight}
        stats={[
          { label: "Potencia actual", value: fmtPower(solarW).value, unit: fmtPower(solarW).unit },
          { label: "Generado hoy", value: fmtKwh(totals.pvKwh), unit: "kWh" },
          { label: "Eficiencia", value: solarEffPct != null ? `${solarEffPct}` : "—", unit: "%", hint: "vs capacidad pico" },
          { label: "Calidad climática", value: `${Math.round(theme.solarMultiplier * 100)}`, unit: "%" },
          { label: "Capacidad PV", value: pv?.array_kwp ? `${pv.array_kwp}` : "—", unit: "kWp" },
          { label: "Paneles", value: panelLabel, hint: pv?.panel_count ? `${pv.panel_count} módulos` : undefined },
          { label: "Orientación / tilt", value: orientationLabel, hint: "azimut / inclinación" },
          { label: "Temperatura", value: weather ? `${Math.round(weather.current.temperature)}` : "—", unit: "°C" },
          { label: "Ahorrado hoy", value: energyPrice > 0 ? fmtMoney(savedToday) : "—", hint: "autoconsumo evitó comprar" },
          { label: "CO₂ evitado", value: co2Saved, unit: "kg", hint: "estimado hoy" },
        ]}
        description="Energía generada por tus paneles fotovoltaicos en tiempo real. La eficiencia compara la potencia instantánea con la capacidad pico instalada; la calidad climática refleja cuánto del potencial solar se aprovecha con el clima actual."
      />
      <WidgetDetailDialog
        open={openDetail === "grid"}
        onOpenChange={(v) => !v && setOpenDetail(null)}
        image={detailGridImg}
        title="Red Eléctrica"
        subtitle={!gridConnected ? "Desconectada" : estGridW >= 0 ? "Importando energía" : "Exportando energía"}
        accent="#38bdf8"
        icon={<Zap className="h-6 w-6" />}
        light={isLight}
        stats={[
          { label: "Flujo actual", value: fmtPower(Math.abs(estGridW)).value, unit: fmtPower(Math.abs(estGridW)).unit, hint: estGridW >= 0 ? "Importando" : "Exportando" },
          { label: "Voltaje", value: gridV ? `${Math.round(gridV)}` : "—", unit: "V" },
          { label: "Estado", value: gridConnected ? "Conectada" : "Desconectada", accent: gridConnected ? "#22c55e" : "#ef4444" },
          { label: "Modo inversor", value: inverter.code || "—", hint: inverter.label !== "—" ? inverter.label : undefined },
          { label: "Importado hoy", value: fmtKwh(totals.gridImportKwh), unit: "kWh" },
          { label: "Exportado hoy", value: fmtKwh(exportToday), unit: "kWh" },
          { label: "Costo importación", value: energyPrice > 0 ? fmtMoney(gridCostToday) : "—", hint: energyPrice > 0 ? `${energyPrice}/kWh` : "sin tarifa configurada" },
          { label: "Ingreso exportación", value: feedInPrice > 0 ? fmtMoney(exportRevenueToday) : "—", hint: feedInPrice > 0 ? `${feedInPrice}/kWh` : "sin tarifa configurada" },
          { label: "Balance neto hoy", value: energyPrice > 0 || feedInPrice > 0 ? fmtMoney(netBalanceToday) : "—", accent: netBalanceToday >= 0 ? "#22c55e" : "#ef4444", hint: "ahorro + venta − compra" },
        ]}
        description="Estado de la conexión a la red eléctrica pública. El balance neto combina lo que la red te aporta (importación), lo que le entregas (exportación) y el ahorro por autoconsumo solar."
      />
      <WidgetDetailDialog
        open={openDetail === "battery"}
        onOpenChange={(v) => !v && setOpenDetail(null)}
        heroNode={<BatteryAnimated pct={Math.round(batterySoc)} charging={batChargeW > 20} discharging={batDischargeW > 20} />}
        title="Batería"
        subtitle={batStateLabel + (batteryCapKwh ? ` · ${batteryCapKwh} kWh totales` : "")}
        accent="#22c55e"
        icon={<BatteryLevelIcon pct={Math.round(batterySoc)} className="h-6 w-6" color="#22c55e" />}
        light={isLight}
        stats={[
          { label: "Carga (SOC)", value: `${Math.round(batterySoc)}`, unit: "%" },
          { label: "Energía disponible", value: batteryKwh != null ? batteryKwh.toFixed(1) : "—", unit: "kWh", hint: batteryCapKwh ? `de ${batteryCapKwh} kWh` : undefined },
          { label: "Voltaje", value: batteryV ? batteryV.toFixed(1) : "—", unit: "V" },
          { label: "Corriente", value: batCurrentA > 0 ? batCurrentA.toFixed(1) : "—", unit: "A" },
          { label: "Potencia", value: fmtPower(Math.abs(batteryW)).value, unit: fmtPower(Math.abs(batteryW)).unit, hint: batStateLabel },
          { label: "Estado", value: batStateLabel, accent: batChargeW > 20 ? "#22c55e" : batDischargeW > 20 ? "#f59e0b" : "#94a3b8" },
          { label: "Respaldo estimado", value: backupHours != null ? (backupHours >= 1 ? `${backupHours.toFixed(1)}` : `${Math.round(backupHours * 60)}`) : "—", unit: backupHours != null ? (backupHours >= 1 ? "h" : "min") : undefined, hint: "al consumo actual" },
          { label: "Almacenado hoy", value: fmtKwh(totals.batteryChargedKwh), unit: "kWh" },
          { label: "Tipo", value: pv?.battery_type ? pv.battery_type.replace("_", " ") : "—", hint: pv?.battery_count ? `${pv.battery_count} unidades` : undefined },
          { label: "DOD útil", value: pv?.battery_usable_dod_pct ? `${pv.battery_usable_dod_pct}` : "—", unit: "%", hint: "profundidad de descarga" },
        ]}
        description="Banco de baterías del sistema. El respaldo estimado indica cuánto podría sostener el consumo actual usando sólo la energía almacenada disponible."
      />
      <WidgetDetailDialog
        open={openDetail === "consumo"}
        onOpenChange={(v) => !v && setOpenDetail(null)}
        image={detailConsumoImg}
        title="Consumo del Hogar"
        subtitle={`Modo ${inverter.code || "—"} · ${inverter.label}`}
        accent="#3b82f6"
        icon={<HomeIcon className="h-6 w-6" />}
        light={isLight}
        stats={[
          { label: "Consumo actual", value: fmtPower(loadW).value, unit: fmtPower(loadW).unit },
          { label: "Total hoy", value: fmtKwh(totals.loadKwh), unit: "kWh" },
          { label: "Desde solar", value: fmtKwh(selfFromSolar), unit: "kWh", accent: theme.solarAccent },
          { label: "Desde red", value: fmtKwh(totals.gridImportKwh), unit: "kWh", accent: "#38bdf8" },
          { label: "Autoconsumo", value: `${selfSufficiencyPct}`, unit: "%", hint: "% cubierto por solar", accent: selfSufficiencyPct >= 70 ? "#22c55e" : selfSufficiencyPct >= 40 ? "#f59e0b" : "#ef4444" },
          { label: "Costo evitado", value: energyPrice > 0 ? fmtMoney(savedToday) : "—", hint: "gracias al solar" },
          { label: "Costo desde red", value: energyPrice > 0 ? fmtMoney(gridCostToday) : "—" },
          { label: "Modo inversor", value: inverter.code || "—", hint: inverter.label },
        ]}
        description="Energía total que tu casa está usando ahora mismo y cómo se reparte entre las fuentes disponibles. El autoconsumo indica qué porcentaje del consumo fue cubierto directamente por los paneles solares."
      />
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
