import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BatteryCharging,
  CalendarDays,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Home,
  Info,
  Leaf,
  Loader2,
  MapPin,
  MoreVertical,
  Search,
  Sun,
  TreePine,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PvConfig } from "@/components/PvSystemConfig";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type WeatherHour = {
  time: string;
  radiation: number;
  temperature: number;
  weatherCode: number;
};

type WeatherDay = {
  date: string;
  max: number;
  min: number;
  weatherCode: number;
  sunshineHours: number;
};

export type DashboardWeatherData = {
  city: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    uvIndex: number;
    weatherCode: number;
    radiation: number;
    isDay: boolean;
    sunrise?: string;
    sunset?: string;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
};

const WEATHER_STORAGE_KEY = "dashboard.reference.weather.coords.v1";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatWatts(value: number) {
  return `${Math.round(value).toLocaleString("es-CL")} w`;
}

function formatCurrency(value: number, currency: string) {
  try {
    const zeroDecimals = ["CLP", "JPY", "KRW", "COP", "VND"].includes(currency);
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: zeroDecimals ? 0 : 2,
      minimumFractionDigits: zeroDecimals ? 0 : 0,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function estimateKwh(radWhPerM2: number, kwp: number, lossesPct: number, calibration = 1) {
  const losses = clamp(lossesPct, 0, 50) / 100;
  return Math.max(0, kwp * (radWhPerM2 / 1000) * (1 - losses) * calibration);
}

function weatherLabel(code: number) {
  if (code === 0) return "Despejado";
  if (code === 1) return "Mayormente despejado";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code >= 45 && code <= 48) return "Niebla";
  if (code >= 51 && code <= 67) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nieve";
  if (code >= 80 && code <= 82) return "Chubascos";
  if (code >= 95) return "Tormenta";
  return "—";
}

function WeatherGlyph({ code, className = "h-5 w-5" }: { code: number; className?: string }) {
  if (code === 0 || code === 1) return <Sun className={className} style={{ color: "var(--solar)" }} />;
  if (code <= 3) return <Cloud className={className} style={{ color: "var(--load)" }} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={className} style={{ color: "var(--load)" }} />;
  if (code >= 95) return <CloudLightning className={className} style={{ color: "var(--load)" }} />;
  return <CloudRain className={className} style={{ color: "var(--load)" }} />;
}

function DashboardCardHeader({
  icon,
  title,
  badge,
  badgeColor,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="dashboard-icon-chip h-8 w-8 shrink-0" style={{ color: badgeColor ?? "var(--load)" }}>
          {icon}
        </div>
        <h3 className="truncate text-[15px] font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {badge ? (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{
              color: badgeColor ?? "var(--success)",
              background: `color-mix(in oklab, ${badgeColor ?? "var(--success)"} 14%, var(--tint-base))`,
            }}
          >
            {badge}
          </span>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}

function FooterLink({ label, to, params }: { label: string; to?: string; params?: Record<string, string> }) {
  const content = (
    <>
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5" />
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        params={params as never}
        className="mt-4 inline-flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        style={{ background: "color-mix(in oklab, var(--card) 92%, var(--tint-base))" }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className="mt-4 inline-flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold text-muted-foreground"
      style={{ background: "color-mix(in oklab, var(--card) 92%, var(--tint-base))" }}
    >
      {content}
    </div>
  );
}

function StatusMetric({
  label,
  value,
  accent,
  icon,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  icon: ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border"
        style={{
          color: accent,
          borderColor: `color-mix(in oklab, ${accent} 28%, var(--border))`,
          background: `color-mix(in oklab, ${accent} 8%, var(--tint-base))`,
        }}
      >
        {icon}
      </div>
      <div className="text-[11px] font-semibold leading-none" style={{ color: accent }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}


function ProgressRow({ label, value, progress, accent, icon }: {
  label: string;
  value: string;
  progress: number;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, var(--muted) 70%, var(--tint-base))" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamp(progress, 0, 100)}%`,
            background: `linear-gradient(90deg, ${accent} 0%, color-mix(in oklab, ${accent} 70%, var(--tint-base)) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

function SparkBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-16 items-end gap-1.5">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="flex-1 rounded-t-[3px]"
          style={{
            height: `${Math.max(10, (value / max) * 100)}%`,
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} 74%, var(--tint-base)), ${color})`,
          }}
        />
      ))}
    </div>
  );
}

function SmallStat({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "color-mix(in oklab, var(--card) 96%, var(--tint-base))" }}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-bold tabular-nums text-foreground">{value}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}

const WEATHER_PAYLOAD_KEY = "dashboard.reference.weather.payload.v1";
const WEATHER_TTL_MS = 15 * 60 * 1000;

export function useSolarReferenceWeather(pvConfig?: PvConfig | null) {
  const [data, setData] = useState<DashboardWeatherData | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(WEATHER_PAYLOAD_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: DashboardWeatherData };
      return parsed?.data ?? null;
    } catch { return null; }
  });
  // Bump para forzar recarga cuando cambia la ubicación sin recargar la página.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setReloadTick((t) => t + 1);
    window.addEventListener("solarops:location-changed", onChange);
    // También escuchar cambios de localStorage desde otras pestañas.
    const onStorage = (e: StorageEvent) => {
      if (e.key === WEATHER_STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("solarops:location-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);


  useEffect(() => {
    let cancelled = false;

    async function resolveCoords() {
      if (pvConfig?.latitude != null && pvConfig?.longitude != null) {
        return {
          lat: pvConfig.latitude,
          lon: pvConfig.longitude,
          city: pvConfig.location_label ?? null,
        };
      }

      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(WEATHER_STORAGE_KEY);
        if (cached) {
          try {
            return JSON.parse(cached) as { lat: number; lon: number; city: string | null };
          } catch {
            // ignore parse issues
          }
        }
      }

      try {
        const coords = await new Promise<{ lat: number; lon: number }>((resolve, reject) => {
          if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("geo"));
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
            reject,
            { timeout: 4000 },
          );
        });

        return { ...coords, city: null };
      } catch {
        const response = await fetch("https://ipapi.co/json/");
        const payload = await response.json();
        return { lat: payload.latitude as number, lon: payload.longitude as number, city: payload.city as string | null };
      }
    }

    async function load() {
      try {
        const coords = await resolveCoords();
        if (typeof window !== "undefined") {
          localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(coords));
        }

        // Hydrate instantly from payload cache if fresh enough for same coords
        if (typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem(WEATHER_PAYLOAD_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as { data: DashboardWeatherData; ts: number; lat: number; lon: number };
              const sameCoords = Math.abs((parsed.lat ?? 0) - coords.lat) < 0.05 && Math.abs((parsed.lon ?? 0) - coords.lon) < 0.05;
              if (sameCoords && !cancelled) {
                setData(parsed.data);
                if (Date.now() - (parsed.ts ?? 0) < WEATHER_TTL_MS) return;
              }
            }
          } catch { /* ignore */ }
        }

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index,weather_code,shortwave_radiation,is_day&hourly=temperature_2m,weather_code,shortwave_radiation&daily=weather_code,temperature_2m_max,temperature_2m_min,sunshine_duration,sunrise,sunset&forecast_days=6&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const weatherJson = await weatherRes.json();

        let city = coords.city ?? "Mi ubicación";
        if (!coords.city) {
          try {
            const reverseRes = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${coords.lat}&longitude=${coords.lon}&language=es`);
            const reverseJson = await reverseRes.json();
            city = reverseJson.results?.[0]?.name ?? city;
          } catch {
            // ignore reverse lookup failures
          }
        }

        const now = new Date();
        const hourly: WeatherHour[] = [];
        const times: string[] = weatherJson.hourly?.time ?? [];
        for (let index = 0; index < times.length; index += 1) {
          const hourDate = new Date(times[index]);
          if (hourDate < now) continue;
          if (hourly.length >= 12) break;
          hourly.push({
            time: times[index],
            radiation: Number(weatherJson.hourly.shortwave_radiation[index] ?? 0),
            temperature: Number(weatherJson.hourly.temperature_2m[index] ?? 0),
            weatherCode: Number(weatherJson.hourly.weather_code[index] ?? 0),
          });
        }

        const daily: WeatherDay[] = (weatherJson.daily?.time ?? []).slice(0, 6).map((date: string, index: number) => ({
          date,
          max: Number(weatherJson.daily.temperature_2m_max[index] ?? 0),
          min: Number(weatherJson.daily.temperature_2m_min[index] ?? 0),
          weatherCode: Number(weatherJson.daily.weather_code[index] ?? 0),
          sunshineHours: Number(weatherJson.daily.sunshine_duration?.[index] ?? 0) / 3600,
        }));

        const next: DashboardWeatherData = {
          city,
          current: {
            temperature: Number(weatherJson.current?.temperature_2m ?? 0),
            apparentTemperature: Number(weatherJson.current?.apparent_temperature ?? 0),
            humidity: Number(weatherJson.current?.relative_humidity_2m ?? 0),
            windSpeed: Number(weatherJson.current?.wind_speed_10m ?? 0),
            uvIndex: Number(weatherJson.current?.uv_index ?? 0),
            weatherCode: Number(weatherJson.current?.weather_code ?? 0),
            radiation: Number(weatherJson.current?.shortwave_radiation ?? 0),
            isDay: Number(weatherJson.current?.is_day ?? 1) === 1,
            sunrise: weatherJson.daily?.sunrise?.[0],
            sunset: weatherJson.daily?.sunset?.[0],
          },
          hourly,
          daily,
        };

        if (!cancelled) setData(next);
        try {
          localStorage.setItem(WEATHER_PAYLOAD_KEY, JSON.stringify({ data: next, ts: Date.now(), lat: coords.lat, lon: coords.lon }));
        } catch { /* ignore */ }
      } catch {
        if (!cancelled) setData((prev) => prev);
      }
    }

    void load();
    // Refrescar cada 10 minutos para que la animación refleje la condición actual
    const interval = setInterval(() => { void load(); }, 10 * 60 * 1000);
    // Reanudar al volver el foco para reflejar el clima al momento
    const onFocus = () => { void load(); };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [pvConfig?.latitude, pvConfig?.location_label, pvConfig?.longitude, reloadTick]);

  return data;
}

export function SystemStatusCard({
  pv,
  load,
  battery,
  batteryV,
  batteryW = 0,
  gridV,
  gridW = 0,
  pvMax,
  loadMax = 5200,
}: {
  pv: number;
  load: number;
  battery: number;
  batteryV: number;
  /** Potencia neta de la batería (W). Positivo = descarga, negativo = carga. */
  batteryW?: number;
  gridV: number;
  /** Potencia tomada de la red (W) — incluye consumo casa + carga batería. */
  gridW?: number;
  pvMax: number;
  loadMax?: number;
}) {
  const gridConnected = gridV > 50;
  const ringSize = 132;
  const stroke = 11;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringProgress = circumference * (1 - clamp(battery, 0, 100) / 100);

  return (
    <div className="dashboard-card p-5 sm:p-6">
      <DashboardCardHeader
        icon={<Zap className="h-4 w-4" strokeWidth={2.2} />}
        title="Estado general del sistema"
        badge="● EN VIVO"
        badgeColor="var(--success)"
        trailing={<MoreVertical className="h-4 w-4 text-muted-foreground" />}
      />

      <div className="grid grid-cols-[1fr_auto_1fr_auto_auto_auto_1fr] items-center gap-3 pb-5 max-[520px]:grid-cols-2 max-[520px]:gap-y-5">
        <StatusMetric label="Solar" value={formatWatts(pv)} accent="var(--solar)" icon={<Sun className="h-5 w-5" />} />
        <div className="h-px w-10 border-t border-dashed max-[520px]:hidden" style={{ borderColor: "color-mix(in oklab, var(--solar) 60%, var(--tint-base))" }} />
        <StatusMetric label="Consumo" value={formatWatts(load)} accent="var(--load)" icon={<Home className="h-5 w-5" />} />
        <div className="h-px w-10 border-t border-dashed max-[520px]:hidden" style={{ borderColor: "color-mix(in oklab, var(--load) 60%, var(--tint-base))" }} />

        <div className="flex flex-col items-center max-[520px]:col-span-2">
          <div className="relative" style={{ width: ringSize, height: ringSize }}>
            <svg viewBox={`0 0 ${ringSize} ${ringSize}`} className="-rotate-[130deg]">
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="color-mix(in oklab, var(--battery) 16%, var(--tint-base))"
                strokeWidth={stroke}
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="var(--battery)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={ringProgress}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[34px] font-bold leading-none tabular-nums" style={{ color: "var(--battery)" }}>{Math.round(battery)}%</div>
            </div>
          </div>
          <div className="mt-2 text-[12px] font-semibold tabular-nums text-foreground">
            {batteryW > 25 ? `↓ ${formatWatts(batteryW)}` : batteryW < -25 ? `↑ ${formatWatts(Math.abs(batteryW))}` : formatWatts(0)}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Batería · {batteryW > 25 ? "descargando" : batteryW < -25 ? "cargando" : "reposo"}
          </div>
        </div>

        <div className="h-px w-10 border-t border-dashed max-[520px]:hidden" style={{ borderColor: "color-mix(in oklab, var(--battery) 60%, var(--tint-base))" }} />
        <StatusMetric
          label="Red"
          value={gridConnected ? formatWatts(gridW) : "0 w"}
          sub={gridConnected ? `${Math.round(gridV)} V` : "desconectada"}
          accent={gridConnected ? "var(--foreground)" : "var(--muted-foreground)"}
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: "color-mix(in oklab, var(--border) 80%, var(--tint-base))" }}>
        <ProgressRow label="Generación solar" value={formatWatts(pv)} progress={(pv / Math.max(pvMax, 1)) * 100} accent="var(--solar)" icon={<Sun className="h-3.5 w-3.5" style={{ color: "var(--solar)" }} />} />
        <ProgressRow label="Consumo de la casa" value={formatWatts(load)} progress={(load / Math.max(loadMax, 1)) * 100} accent="var(--load)" icon={<Home className="h-3.5 w-3.5" style={{ color: "var(--load)" }} />} />
        <ProgressRow label="Consumo desde la red" value={gridConnected ? formatWatts(gridW) : "0 w"} progress={gridConnected ? (gridW / Math.max(loadMax, 1)) * 100 : 0} accent="var(--muted-foreground)" icon={<Zap className="h-3.5 w-3.5 text-muted-foreground" />} />
        <ProgressRow label="Estado de carga (SOC)" value={`${Math.round(battery)} %`} progress={battery} accent="var(--battery)" icon={<Zap className="h-3.5 w-3.5" style={{ color: "var(--battery)" }} />} />
      </div>
    </div>
  );
}


export function EnergyFlowReferenceCard({
  pv,
  load,
  gridV,
  battery,
  batteryV,
  batteryNetW,
}: {
  pv: number;
  load: number;
  gridV: number;
  battery: number;
  batteryV: number;
  batteryNetW: number;
}) {
  const gridConnected = gridV > 50;
  const dischargeW = Math.max(0, batteryNetW);
  const chargeW = Math.max(0, -batteryNetW);
  const batteryFlowW = Math.max(dischargeW, chargeW);
  const solarToHouse = Math.min(pv, load);
  const batteryToHouse = dischargeW > 5;
  const solarToBattery = chargeW > 5;

  // La red suministra el consumo de la casa MÁS lo que se está entregando a la batería (carga).
  // Solo se cuenta como aporte de red el déficit no cubierto por PV ni por descarga de batería.
  const gridW = gridConnected ? Math.max(0, load + chargeW - pv - dischargeW) : 0;

  return (
    <div className="dashboard-card p-5 sm:p-6">
      <DashboardCardHeader
        icon={<Zap className="h-4 w-4" strokeWidth={2.2} />}
        title="Flujo de energía"
        badgeColor="var(--load)"
        trailing={<Info className="h-4 w-4 text-muted-foreground" />}
      />

      <svg viewBox="0 0 640 420" className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="ef-arr-solar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--solar)" />
          </marker>
          <marker id="ef-arr-battery" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--success)" />
          </marker>
          <marker id="ef-arr-load" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="ef-arr-grid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8" />
          </marker>
          <radialGradient id="sun-grad" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#fffbe6" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f97316" />
          </radialGradient>
        </defs>

        {/* ===== SOLAR (top) — circle r=46 at (320,75) ===== */}
        <g transform="translate(320 75)">
          <circle cx="0" cy="0" r="46" fill="color-mix(in oklab, var(--solar) 14%, var(--tint-base))" stroke="color-mix(in oklab, var(--solar) 40%, var(--border))" strokeWidth="1.2" />
          {/* Sun */}
          <circle cx="0" cy="-6" r="11" fill="url(#sun-grad)" />
          <g stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round">
            <line x1="0" y1="-24" x2="0" y2="-19" />
            <line x1="-18" y1="-6" x2="-13" y2="-6" />
            <line x1="13" y1="-6" x2="18" y2="-6" />
            <line x1="-13" y1="-18" x2="-9" y2="-14" />
            <line x1="13" y1="-18" x2="9" y2="-14" />
          </g>
          {/* Solar panel below sun */}
          <g transform="translate(-22 10) skewX(-20)">
            <rect x="0" y="0" width="44" height="20" rx="2" fill="#1e3a5f" stroke="#0f1f3d" />
            <line x1="11" y1="0" x2="11" y2="20" stroke="#3b5a8a" />
            <line x1="22" y1="0" x2="22" y2="20" stroke="#3b5a8a" />
            <line x1="33" y1="0" x2="33" y2="20" stroke="#3b5a8a" />
            <line x1="0" y1="10" x2="44" y2="10" stroke="#3b5a8a" />
          </g>
        </g>
        {/* Solar label to the RIGHT of icon, no overlap */}
        <text x="385" y="68" className="fill-[var(--solar)] text-[20px] font-bold">{Math.round(pv)} W</text>
        <text x="385" y="86" className="fill-muted-foreground text-[11px]">Generación solar</text>

        {/* ===== FLOWS — all routed through clear empty space ===== */}
        {/* Solar -> House (vertical down center) */}
        <path
          d="M 320 125 L 320 230"
          fill="none" stroke="var(--solar)" strokeWidth="3" strokeDasharray="7 6"
          markerEnd="url(#ef-arr-solar)"
          className={pv > 5 ? "flow-line flow-solar" : ""}
          opacity={pv > 5 ? 1 : 0.2}
        />
        {/* Battery -> House (curve from left) */}
        <path
          d="M 130 280 C 200 280, 240 270, 285 265"
          fill="none" stroke="var(--success)" strokeWidth="3" strokeDasharray="7 6"
          markerEnd="url(#ef-arr-battery)"
          className={batteryToHouse ? "flow-line flow-battery" : ""}
          opacity={batteryToHouse ? 1 : 0.2}
        />
        {/* Solar -> Battery (cargando) */}
        <path
          d="M 285 100 C 220 110, 160 180, 130 235"
          fill="none" stroke="var(--solar)" strokeWidth="2.4" strokeDasharray="6 6"
          markerEnd="url(#ef-arr-battery)"
          className={solarToBattery ? "flow-line" : ""}
          opacity={solarToBattery ? 1 : 0.15}
        />
        {/* Grid -> House */}
        <path
          d="M 510 280 C 440 280, 400 270, 355 265"
          fill="none" stroke="#94a3b8" strokeWidth="2.4" strokeDasharray="6 6"
          markerEnd="url(#ef-arr-grid)"
          className={gridW > 5 ? "flow-line" : ""}
          opacity={gridW > 5 ? 1 : 0.2}
        />

        {/* ===== BATTERY (left) — circle r=42 at (90,280) ===== */}
        <g transform="translate(90 280)">
          <circle cx="0" cy="0" r="42" fill="color-mix(in oklab, var(--success) 12%, var(--tint-base))" stroke="color-mix(in oklab, var(--success) 40%, var(--border))" strokeWidth="1.2" />
          {/* Real battery shape */}
          <rect x="-15" y="-18" width="30" height="34" rx="4" fill="white" stroke="var(--success)" strokeWidth="2.4" />
          <rect x="-6" y="-22" width="12" height="4" rx="1.5" fill="var(--success)" />
          {/* Fill level */}
          <rect x="-12" y={-15 + (30 * (1 - clamp(battery, 0, 100) / 100))} width="24" height={30 * clamp(battery, 0, 100) / 100} rx="2" fill="var(--success)" opacity="0.85" />
          {/* Lightning bolt overlay */}
          <path d="M 3 -8 L -5 4 L 1 4 L -3 14 L 6 0 L 0 0 L 4 -8 Z" fill="white" stroke="var(--success)" strokeWidth="0.8" strokeLinejoin="round" />
        </g>
        <text x="90" y="345" textAnchor="middle" className="fill-[var(--success)] text-[16px] font-bold">{Math.round(batteryFlowW)} W</text>
        <text x="90" y="362" textAnchor="middle" className="fill-muted-foreground text-[11px]">Batería</text>
        <text x="90" y="378" textAnchor="middle" className="fill-muted-foreground text-[10px]">{Math.round(battery)}% · {batteryV.toFixed(1)} V{solarToBattery ? " · cargando" : ""}</text>

        {/* ===== HOUSE (center) — circle r=46 at (320,275) ===== */}
        <g transform="translate(320 275)">
          <circle cx="0" cy="0" r="46" fill="color-mix(in oklab, var(--load) 10%, var(--tint-base))" stroke="color-mix(in oklab, var(--load) 40%, var(--border))" strokeWidth="1.2" />
          {/* Realistic house */}
          <path d="M -22 -2 L 0 -22 L 22 -2 L 22 20 L -22 20 Z" fill="white" stroke="var(--load)" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M -24 -2 L 0 -24 L 24 -2" fill="none" stroke="var(--load)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Door */}
          <rect x="-6" y="6" width="12" height="14" fill="color-mix(in oklab, var(--load) 30%, var(--tint-base))" stroke="var(--load)" strokeWidth="1.4" />
          {/* Window */}
          <rect x="-17" y="2" width="8" height="8" fill="color-mix(in oklab, var(--load) 18%, var(--tint-base))" stroke="var(--load)" strokeWidth="1.2" />
          <rect x="9" y="2" width="8" height="8" fill="color-mix(in oklab, var(--load) 18%, var(--tint-base))" stroke="var(--load)" strokeWidth="1.2" />
        </g>
        <text x="320" y="345" textAnchor="middle" className="fill-[var(--load)] text-[16px] font-bold">{Math.round(load)} W</text>
        <text x="320" y="362" textAnchor="middle" className="fill-muted-foreground text-[11px]">Consumo casa</text>

        {/* ===== GRID (right) — circle r=42 at (550,280) — torre eléctrica ===== */}
        <g transform="translate(550 280)">
          <circle cx="0" cy="0" r="42" fill="color-mix(in oklab, var(--muted) 40%, var(--tint-base))" stroke="color-mix(in oklab, var(--muted-foreground) 30%, var(--border))" strokeWidth="1.2" />
          {/* Tower legs */}
          <g stroke="#475569" strokeWidth="2.2" strokeLinecap="round" fill="none">
            <line x1="-12" y1="20" x2="-4" y2="-20" />
            <line x1="12" y1="20" x2="4" y2="-20" />
            {/* Cross beams */}
            <line x1="-10" y1="10" x2="10" y2="10" />
            <line x1="-7" y1="-2" x2="7" y2="-2" />
            <line x1="-5" y1="-14" x2="5" y2="-14" />
            {/* Diagonal bracing */}
            <line x1="-10" y1="10" x2="0" y2="-2" />
            <line x1="10" y1="10" x2="0" y2="-2" />
            <line x1="-7" y1="-2" x2="0" y2="-14" />
            <line x1="7" y1="-2" x2="0" y2="-14" />
            {/* Top antenna */}
            <line x1="0" y1="-14" x2="0" y2="-22" />
          </g>
          {/* Insulators */}
          <circle cx="-8" cy="-7" r="1.6" fill="#475569" />
          <circle cx="8" cy="-7" r="1.6" fill="#475569" />
        </g>
        <text x="550" y="345" textAnchor="middle" className="fill-foreground text-[16px] font-bold">{Math.round(gridW)} W</text>
        <text x="550" y="362" textAnchor="middle" className="fill-muted-foreground text-[11px]">Red</text>
        <text x="550" y="378" textAnchor="middle" className="fill-muted-foreground text-[10px]">{gridConnected ? `${Math.round(gridV)} V` : "Desconectada"}</text>
      </svg>

      <style>{`
        @keyframes flow-dash { to { stroke-dashoffset: -52; } }
        .flow-line { animation: flow-dash 1.6s linear infinite; }
        .flow-solar { animation-duration: 1.4s; }
        .flow-battery { animation-duration: 2s; }
      `}</style>
    </div>
  );
}

export function SolarProductionReferenceCard({ pv, pvMax = 5200 }: { pv: number; pvMax?: number }) {
  const ratio = clamp((pv / Math.max(pvMax, 1)) * 100, 0, 100);
  const energyToday = (pv / 1000) * 0.18;

  return (
    <div className="dashboard-card p-5 sm:p-6">
      <DashboardCardHeader
        icon={<Sun className="h-4 w-4" />}
        title="Producción solar"
        badge="⚡ Generando"
        badgeColor="var(--solar)"
      />

      <div className="grid grid-cols-[1fr_1.1fr] gap-4 max-[520px]:grid-cols-1">
        <div className="relative min-h-[172px] overflow-hidden rounded-xl border" style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--load) 14%, var(--tint-base)), color-mix(in oklab, var(--card) 85%, var(--tint-base)))" }}>
          <div className="absolute inset-x-0 top-0 h-[58%]" style={{ background: "linear-gradient(180deg, #bfe1ff 0%, #eaf4ff 100%)" }} />
          <div className="absolute right-5 top-6 h-12 w-12 rounded-full" style={{ background: "radial-gradient(circle at 35% 35%, #fffce8, #ffd54f 58%, #ff9800 100%)", boxShadow: "0 0 24px rgba(255,193,7,.45)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-[48%] bg-white" />
          <div className="absolute bottom-0 left-[18%] h-[72%] w-[36%] bg-white" style={{ clipPath: "polygon(0 100%, 0 56%, 54% 18%, 100% 56%, 100% 100%)", border: "1px solid color-mix(in oklab, var(--border) 80%, var(--tint-base))" }} />
          <div className="absolute bottom-[16%] left-[4%] h-[32%] w-[58%] origin-bottom-left -skew-x-[22deg] rounded-sm border border-slate-700 bg-slate-900 shadow-lg">
            <div className="grid h-full grid-cols-4 gap-[2px] p-1">
              {Array.from({ length: 12 }).map((_, index) => (
                <span key={index} className="rounded-[2px]" style={{ background: "linear-gradient(180deg, #224a8f, #0d1c38)" }} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SmallStat label="Potencia actual" value={formatWatts(pv)} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <MetricLine label="Capacidad instalada" value={`${Math.round(pvMax).toLocaleString("es-CL")} w`} />
            <MetricLine label="Aprovechamiento" value={`${ratio.toFixed(0)} %`} />
            <MetricLine label="Energía hoy" value={`${energyToday.toFixed(2)} kWh`} />
            <MetricLine label="Estado" value={pv > 0 ? "Produciendo" : "En espera"} />
          </div>
        </div>
      </div>

      
    </div>
  );
}

export function HouseConsumptionReferenceCard({ load, contractedPower = 5200 }: { load: number; contractedPower?: number }) {
  const usage = clamp((load / Math.max(contractedPower, 1)) * 100, 0, 100);
  const chart = [48, 76, 84, 68, 52, 42, 36, 31, 27, 39, 44, 51, 66, 58, 43, 35, 28, 24, 22, 24, 26, 25, 29, 32];
  const ringSize = 154;
  const stroke = 12;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.78;
  const progress = arc * (1 - usage / 100);

  return (
    <div className="dashboard-card p-5 sm:p-6">
      <DashboardCardHeader
        icon={<Home className="h-4 w-4" />}
        title="Consumo de la casa"
        badge="⚡ Consumiendo"
        badgeColor="var(--load)"
      />

      <div className="grid grid-cols-[170px_1fr] gap-5 max-[520px]:grid-cols-1">
        <div className="flex items-center justify-center">
          <div className="relative h-[154px] w-[154px]">
            <svg viewBox={`0 0 ${ringSize} ${ringSize}`} className="-rotate-[138deg]">
              <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="color-mix(in oklab, var(--load) 16%, var(--tint-base))" strokeWidth={stroke} strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round" />
              <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="var(--load)" strokeWidth={stroke} strokeDasharray={`${arc - progress} ${circumference}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-[36px] font-bold leading-none" style={{ color: "var(--load)" }}>{Math.round(load)}</div>
              <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--load)" }}>w</div>
              <div className="mt-1 text-[12px] text-muted-foreground">Consumo actual</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-[13px]">
            <MetricLine label="Capacidad contratada" value={`${Math.round(contractedPower).toLocaleString("es-CL")} w`} />
            <MetricLine label="Uso" value={`${usage.toFixed(0)} %`} />
            <MetricLine label="Nivel de consumo" value={usage > 70 ? "Alto" : usage > 35 ? "Medio" : "Bajo"} />
          </div>

          <div>
            <div className="mb-2 text-[12px] text-muted-foreground">Consumo últimas 24 h</div>
            <div className="mb-2 text-[11px] text-muted-foreground">1.5 kW</div>
            <SparkBars values={chart} color="var(--load)" />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>00:00</span>
              <span>04:00</span>
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GeoResult { name: string; country?: string; admin1?: string; latitude: number; longitude: number }

function LocationPicker({ currentLabel, siteId }: { currentLabel: string; siteId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debRef = useRef<number | null>(null);

  function search(q: string) {
    setQuery(q);
    if (debRef.current) window.clearTimeout(debRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es&format=json`);
        const j = await r.json();
        setResults(j.results ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  async function persist(lat: number, lon: number, label: string) {
    if (typeof window !== "undefined") {
      try { localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ lat, lon, city: label })); } catch { /* ignore */ }
      // Notifica a `useSolarReferenceWeather` (y a cualquier otro listener)
      // para que recarguen la previsión sin necesidad de refrescar la página.
      try {
        window.dispatchEvent(new CustomEvent("solarops:location-changed", { detail: { lat, lon, city: label } }));
      } catch { /* ignore */ }
    }
    const isUuid = /^[0-9a-f-]{36}$/i.test(siteId);
    if (isUuid) {
      const { error } = await supabase
        .from("pv_system_config")
        .upsert({ site_id: siteId, latitude: lat, longitude: lon, location_label: label }, { onConflict: "site_id" });
      if (error) toast.error(error.message);
      else toast.success(`Ubicación: ${label}`);
    } else {
      toast.success(`Ubicación: ${label}`);
    }
  }


  async function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { toast.error("Geolocalización no disponible"); return; }
    setSearching(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&language=es`);
        const j = await r.json();
        const top = j.results?.[0];
        const label = top ? [top.name, top.admin1, top.country].filter(Boolean).join(", ") : "Mi ubicación";
        await persist(pos.coords.latitude, pos.coords.longitude, label);
        setOpen(false);
      } finally { setSearching(false); }
    }, () => { setSearching(false); toast.error("No se pudo obtener tu ubicación"); }, { timeout: 6000 });
  }

  async function pick(r: GeoResult) {
    const fullLabel = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    await persist(r.latitude, r.longitude, fullLabel);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border bg-card/80 dark:bg-card/40 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-white"
          title="Cambiar ubicación"
        >
          <MapPin className="h-3 w-3" />
          <span className="max-w-[140px] truncate">{currentLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="z-50 w-72 p-3">
        <div className="flex items-center gap-2 rounded-md border bg-background px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Buscar ciudad…"
            className="w-full bg-transparent py-1.5 text-[12px] outline-none"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-44 overflow-auto rounded-md border bg-card text-[12px]">
            {results.map((r, i) => (
              <li key={`${r.latitude}-${r.longitude}-${i}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-muted"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground">{[r.admin1, r.country].filter(Boolean).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={useMyLocation}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"
        >
          <MapPin className="h-3 w-3" /> Usar mi ubicación actual
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function WeatherAndRadiationCard({
  data,
  pvConfig,
  livePv,
  siteId,
  batterySoc,
  batteryChargingW,
}: {
  data: DashboardWeatherData | null;
  pvConfig?: PvConfig | null;
  livePv: number;
  siteId: string;
  batterySoc?: number;
  batteryChargingW?: number;
}) {
  const kwp = pvConfig?.array_kwp ?? 5.2;
  const losses = pvConfig?.system_losses_pct ?? 14;
  const manualCalib = pvConfig?.manual_calibration ?? null;
  const calibration = manualCalib && manualCalib > 0 ? clamp(manualCalib, 0.2, 3) : 1;
  const calibrated = calibration !== 1;
  const hours = (data?.hourly ?? []).slice(0, 12);
  const currentRadiation = Math.round(data?.current.radiation ?? 0);
  const next12kwh = hours.reduce((sum, hour) => sum + estimateKwh(hour.radiation, kwp, losses, calibration), 0);
  const peakRad = Math.max(1, ...hours.map((h) => h.radiation));
  const liveKw = Math.max(0, livePv) / 1000;
  const pctOfPeak = kwp > 0 ? clamp((liveKw / kwp) * 100, 0, 100) : 0;
  const city = data?.city ?? "Mi ubicación";

  const batteryKwh = pvConfig?.battery_kwh ?? null;
  const usableDod = (pvConfig?.battery_usable_dod_pct ?? 80) / 100;
  const soc = clamp(batterySoc ?? 0, 0, 100) / 100;
  const chargeW = Math.max(0, batteryChargingW ?? 0);
  let chargeTimeLabel: string | null = null;
  if (batteryKwh && batteryKwh > 0 && soc < 1) {
    const kwhNeeded = batteryKwh * usableDod * (1 - soc);
    if (chargeW > 50) {
      const hoursToFull = kwhNeeded / (chargeW / 1000);
      const h = Math.floor(hoursToFull);
      const m = Math.round((hoursToFull - h) * 60);
      chargeTimeLabel = h > 0 ? `${h} h ${m} min` : `${m} min`;
    } else if (next12kwh > 0.1) {
      const hoursWithSun = kwhNeeded / (next12kwh / 12);
      const h = Math.floor(hoursWithSun);
      const m = Math.round((hoursWithSun - h) * 60);
      chargeTimeLabel = `~${h} h ${m} min (sol)`;
    }
  }

  const kwhSeries = hours.map((h) => estimateKwh(h.radiation, kwp, losses, calibration));
  const maxKwh = Math.max(0.2, ...kwhSeries);
  const chartWidth = 920;
  const chartHeight = 260;
  const padLeft = 56;
  const padRight = 56;
  const padTop = 24;
  const padBottom = 38;
  const innerWidth = chartWidth - padLeft - padRight;
  const innerHeight = chartHeight - padTop - padBottom;
  const baseY = chartHeight - padBottom;
  const xFor = (index: number) => padLeft + (hours.length <= 1 ? innerWidth / 2 : (index / (hours.length - 1)) * innerWidth);
  const radYFor = (value: number) => padTop + innerHeight - (value / peakRad) * innerHeight;
  const kwhYFor = (value: number) => padTop + innerHeight - (value / maxKwh) * innerHeight;
  const radiationPoints = hours.map((hour, index) => `${xFor(index)},${radYFor(hour.radiation)}`).join(" ");
  const kwhPoints = kwhSeries.map((value, index) => `${xFor(index)},${kwhYFor(value)}`).join(" ");
  const radiationArea = hours.length
    ? `${radiationPoints} ${xFor(hours.length - 1)},${baseY} ${xFor(0)},${baseY}`
    : "";
  const kwhArea = hours.length
    ? `${kwhPoints} ${xFor(hours.length - 1)},${baseY} ${xFor(0)},${baseY}`
    : "";

  const forecastCards = [
    {
      icon: <Zap className="h-5 w-5" />,
      label: "PRODUCCIÓN AHORA",
      value: `${Math.round(livePv).toLocaleString("es-CL")}`,
      unit: "W",
      meta: `${pctOfPeak.toFixed(0)}%`,
      accent: "var(--success)",
      progress: pctOfPeak,
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      label: `ESTIMADA 12 H${calibrated ? " · CAL" : ""}`,
      value: next12kwh.toFixed(2),
      unit: "kWh",
      meta: `${kwp.toFixed(1)} kWp · ${losses}%`,
      accent: "var(--solar)",
      progress: Math.min(100, (next12kwh / Math.max(kwp * 2.4, 1)) * 100),
    },
    {
      icon: <BatteryCharging className="h-5 w-5" />,
      label: "CARGA BATERÍA",
      value: chargeTimeLabel ?? (!batteryKwh ? "Sin datos" : soc * 100 >= 99 ? "Completa" : "Sin carga"),
      unit: "",
      meta: batteryKwh ? `${Math.round(soc * 100)}% → 100%` : "Configura batería",
      accent: "var(--success)",
      progress: Math.round(soc * 100),
    },
  ];

  return (
    <div
      className="dashboard-card overflow-hidden p-0"
      style={{
        background: "var(--card)",
        borderColor: "color-mix(in oklab, var(--load) 32%, var(--border))",
        boxShadow: "0 0 0 1px color-mix(in oklab, var(--load) 16%, transparent), 0 24px 60px -30px color-mix(in oklab, black 62%, transparent)",
      }}
    >
      <div
        className="relative overflow-hidden px-5 pb-5 pt-5 sm:px-7 sm:pb-6"
        style={{
          background: "linear-gradient(180deg, color-mix(in oklab, var(--load) 44%, black 56%) 0%, color-mix(in oklab, var(--load) 28%, black 72%) 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background: "radial-gradient(circle at 12% 0%, color-mix(in oklab, white 26%, var(--load)) 0%, transparent 24%), radial-gradient(circle at 72% 18%, color-mix(in oklab, white 10%, var(--load)) 0%, transparent 16%), radial-gradient(circle at 78% 28%, color-mix(in oklab, white 7%, var(--load)) 0%, transparent 12%)",
          }}
        />

        {!data ? (
          <div className="py-6 text-center text-xs text-white/80">Cargando clima y radiación…</div>
        ) : (
          <>
            <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="text-[44px] font-semibold leading-[0.9] tracking-tight text-white sm:text-[56px]">{Math.round(data.current.temperature)}°</div>
                  <div className="pt-1.5 sm:pt-2">
                    <div className="flex items-center gap-2 text-white">
                      <WeatherGlyph code={data.current.weatherCode} className="h-5 w-5" />
                      <div className="text-[15px] font-medium sm:text-[17px]">{weatherLabel(data.current.weatherCode)}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-white/80">
                      Sens {Math.round(data.current.apparentTemperature)}° · Hum {Math.round(data.current.humidity)}% · {Math.round(data.current.windSpeed)} km/h
                    </div>
                  </div>
                </div>
                <div className="self-start">
                  <LocationPicker currentLabel={city} siteId={siteId} />
                </div>

              </div>

              <div className="flex flex-col gap-2 lg:items-end">

                <div
                  className="w-full rounded-xl border px-3 py-2 text-center text-white lg:w-[160px]"
                  style={{
                    background: "color-mix(in oklab, var(--card) 18%, transparent)",
                    borderColor: "color-mix(in oklab, white 18%, transparent)",
                  }}
                >
                  <div className="text-[9px] uppercase tracking-[0.16em] text-white/70">Radiación</div>
                  <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums">{currentRadiation} <span className="text-[10px] font-normal text-white/80">W/m²</span></div>
                  <div className="mt-1 text-[10px] text-white/75">
                    {currentRadiation > 650 ? "Muy alta" : currentRadiation > 250 ? "Alta" : currentRadiation > 80 ? "Media" : "Baja"}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-4 grid gap-2.5 lg:grid-cols-3">
              {forecastCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border px-3 py-2.5 text-white"
                  style={{
                    background: "color-mix(in oklab, var(--card) 8%, transparent)",
                    borderColor: "color-mix(in oklab, white 12%, transparent)",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        color: card.accent,
                        borderColor: `color-mix(in oklab, ${card.accent} 38%, transparent)`,
                        background: `color-mix(in oklab, ${card.accent} 10%, transparent)`,
                      }}
                    >
                      {card.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium tracking-[0.03em] text-white/88">{card.label}</div>
                      <div className="mt-1 flex items-end gap-1.5">
                        <div className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: card.accent }}>{card.value}</div>
                        {card.unit ? <div className="pb-0.5 text-[11px] text-white/80">{card.unit}</div> : null}
                        {card.label === "PRODUCCIÓN AHORA" ? <div className="ml-auto pb-0.5 text-[11px] text-white/85">{card.meta}</div> : null}
                      </div>
                      {card.label !== "PRODUCCIÓN AHORA" ? <div className="mt-1 text-[10px] text-white/72">{card.meta}</div> : null}
                    </div>
                  </div>
                  {card.label === "PRODUCCIÓN AHORA" ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, white 10%, transparent)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${card.progress}%`, background: "linear-gradient(90deg, var(--success) 0%, var(--solar) 100%)" }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {data && (
        <div className="p-4 sm:p-5">
          <div
            className="rounded-2xl border p-3 sm:p-4"
            style={{
              background: "var(--card)",
              borderColor: "color-mix(in oklab, var(--border) 58%, transparent)",
            }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Próximas 12 h — radiación y producción estimada</div>
              <div className="flex gap-3 text-[10px] text-foreground/80">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--solar)" }} />W/m²</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />kWh</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[520px] w-full">
                {[0, 1, 2].map((tick) => {
                  const y = padTop + (innerHeight / 2) * tick;
                  return (
                    <line
                      key={tick}
                      x1={padLeft}
                      y1={y}
                      x2={chartWidth - padRight}
                      y2={y}
                      stroke="color-mix(in oklab, var(--border) 42%, transparent)"
                      strokeDasharray="4 6"
                    />
                  );
                })}

                <text x={10} y={padTop + 4} fill="var(--solar)" fontSize="14" fontWeight="600">W/m²</text>
                <text x={10} y={padTop + 36} fill="var(--solar)" fontSize="12">{Math.round(peakRad)}</text>
                <text x={10} y={padTop + innerHeight + 2} fill="var(--solar)" fontSize="12">0</text>
                <text x={chartWidth - 24} y={padTop + 4} fill="var(--success)" fontSize="14" fontWeight="600" textAnchor="end">kWh</text>
                <text x={chartWidth - 24} y={padTop + 36} fill="var(--success)" fontSize="12" textAnchor="end">{maxKwh.toFixed(1)}</text>
                <text x={chartWidth - 24} y={padTop + innerHeight + 2} fill="var(--success)" fontSize="12" textAnchor="end">0</text>

                {hours.length > 1 && (
                  <>
                    <polygon points={radiationArea} fill="color-mix(in oklab, var(--solar) 20%, transparent)" />
                    <polygon points={kwhArea} fill="color-mix(in oklab, var(--success) 18%, transparent)" />
                    <polyline points={radiationPoints} fill="none" stroke="var(--solar)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={kwhPoints} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}

                {hours.map((hour, index) => {
                  const x = xFor(index);
                  const radY = radYFor(hour.radiation);
                  const kwhY = kwhYFor(kwhSeries[index]);
                  const hourLabel = `${new Date(hour.time).getHours()}h`;
                  return (
                    <g key={hour.time}>
                      <circle cx={x} cy={radY} r="3.5" fill="var(--solar)" />
                      <circle cx={x} cy={kwhY} r="3.5" fill="var(--success)" />
                      {kwhSeries[index] > 0.05 ? (
                        <text x={x} y={kwhY - 10} textAnchor="middle" fill="var(--success)" fontSize="11" fontWeight="600">
                          {kwhSeries[index].toFixed(1)}
                        </text>
                      ) : null}
                      <text x={x} y={chartHeight - 6} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{hourLabel}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2 max-[760px]:grid-cols-3 max-[480px]:grid-cols-2">
            {data.daily.slice(0, 5).map((day, index) => {
              const dailyKwh = kwp * day.sunshineHours * 0.65 * (1 - losses / 100) * calibration;
              const active = index === 0;
              return (
                <div
                  key={day.date}
                  className="rounded-xl border px-2 py-2.5 text-center"
                  style={{
                    background: active
                      ? "color-mix(in oklab, var(--success) 10%, var(--card))"
                      : "var(--card)",
                    borderColor: active
                      ? "color-mix(in oklab, var(--success) 36%, var(--border))"
                      : "color-mix(in oklab, var(--border) 58%, transparent)",
                  }}
                >
                  <div className="text-[10px] font-semibold tracking-wide" style={{ color: active ? "var(--success)" : "var(--foreground)" }}>
                    {index === 0 ? "HOY" : new Date(day.date).toLocaleDateString("es-CL", { weekday: "short" }).toUpperCase()}
                  </div>
                  <div className="mt-1.5 flex justify-center"><WeatherGlyph code={day.weatherCode} className="h-6 w-6" /></div>
                  <div className="mt-1.5 text-[13px] font-semibold text-foreground">{Math.round(day.max)}°<span className="text-[11px] font-normal text-muted-foreground"> / {Math.round(day.min)}°</span></div>
                  <div className="mt-1 text-[10px]" style={{ color: "var(--solar)" }}>{day.sunshineHours.toFixed(1)} h ☀</div>
                  <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--success)" }}>{dailyKwh.toFixed(1)} kWh</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


export function SavingsReferenceCard({
  siteId,
  pvW,
  batteryDischargeW,
  loadW,
  gridV,
  energyPrice,
  currency,
}: {
  siteId: string;
  pvW: number;
  batteryDischargeW: number;
  loadW: number;
  gridV: number;
  energyPrice: number | null;
  currency?: string | null;
}) {
  const [todayKwh, setTodayKwh] = useState<number | null>(null);
  const [monthKwh, setMonthKwh] = useState<number | null>(null);
  const [yearKwh, setYearKwh] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<{ today: number; month: number; year: number } | null>(null);
  const currentCurrency = currency ?? "CLP";
  const baselineKey = `savings_baseline_${siteId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(baselineKey);
      if (raw) setBaseline(JSON.parse(raw));
      else setBaseline(null);
    } catch { setBaseline(null); }
  }, [baselineKey]);

  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;

    async function loadTotals() {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      const { data } = await supabase
        .from("daily_totals")
        .select("day, load_kwh, grid_used_kwh, pv_kwh, battery_discharged_kwh")
        .eq("site_id", siteId)
        .gte("day", yearStart)
        .order("day", { ascending: true });

      if (cancelled || !data) return;

      let year = 0;
      let month = 0;
      let day = 0;
      const currentMonth = now.getMonth();

      for (const row of data) {
        const loadKwh = Number(row.load_kwh ?? 0);
        const gridKwh = Number(row.grid_used_kwh ?? 0);
        let saved = loadKwh - gridKwh;
        if (saved <= 0) {
          const pvOnly = Number(row.pv_kwh ?? 0);
          saved = loadKwh > 0 ? Math.min(pvOnly, loadKwh) : pvOnly;
        }
        saved = Math.max(0, saved);
        year += saved;
        const rowDate = new Date(`${row.day}T00:00:00`);
        if (rowDate.getMonth() === currentMonth) month += saved;
        if (row.day === today) day += saved;
      }

      setTodayKwh(day);
      setMonthKwh(month);
      setYearKwh(year);
    }

    void loadTotals();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Reset/restore is controlled from the Savings tab; this card just reflects baseline if set.


  if (!energyPrice) {
    return (
      <div className="dashboard-card p-5 sm:p-6">
        <DashboardCardHeader icon={<Leaf className="h-4 w-4" />} title="Ahorro económico" badgeColor="var(--success)" />
        <div className="text-sm text-muted-foreground">Configura el precio del kWh para ver el ahorro económico.</div>
      </div>
    );
  }

  const adjToday = Math.max(0, (todayKwh ?? 0) - (baseline?.today ?? 0));
  const adjMonth = Math.max(0, (monthKwh ?? 0) - (baseline?.month ?? 0));
  const adjYear = Math.max(0, (yearKwh ?? 0) - (baseline?.year ?? 0));

  const nonGridW = Math.max(0, pvW) + Math.max(0, batteryDischargeW);
  const coveredW = loadW > 0 ? Math.min(loadW, nonGridW) : nonGridW;
  const perHour = (coveredW / 1000) * energyPrice;
  const todayValue = adjToday * energyPrice;
  const monthValue = adjMonth * energyPrice;
  const dayOfYear = Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000));
  const projectedYear = dayOfYear >= 7 && adjYear > 0
    ? (adjYear / dayOfYear) * 365 * energyPrice
    : adjYear * energyPrice;

  return (
    <div
      className="dashboard-card p-5 sm:p-6"
      style={{ borderColor: "color-mix(in oklab, var(--success) 28%, var(--border))" }}
    >
      <div className="flex items-start justify-between gap-2">
        <DashboardCardHeader icon={<Leaf className="h-4 w-4" />} title="Ahorro económico" badge="● En vivo" badgeColor="var(--success)" />
      </div>


      <div className="rounded-2xl border p-4" style={{ background: "color-mix(in oklab, var(--success) 8%, var(--tint-base))" }}>
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ahorrando ahora</div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[48px] font-bold leading-none" style={{ color: "var(--success)" }}>{formatCurrency(perHour, currentCurrency)}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">/hora</div>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "color-mix(in oklab, var(--success) 12%, var(--tint-base))" }}>
            <Leaf className="h-8 w-8" style={{ color: "var(--success)" }} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 max-[520px]:grid-cols-1">
        <SmallStat label="Hoy" value={formatCurrency(todayValue, currentCurrency)} subtitle={`${adjToday.toFixed(1)} kWh`} />
        <SmallStat label="Este mes" value={formatCurrency(monthValue, currentCurrency)} subtitle={`${adjMonth.toFixed(0)} kWh`} />
        <SmallStat label="Año proyectado" value={formatCurrency(projectedYear, currentCurrency)} subtitle={`${adjYear.toFixed(0)} kWh real`} />
      </div>

      {baseline && (
        <div className="mt-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          Contadores reiniciados. Pulsa <strong>Restaurar</strong> para ver el histórico completo.
        </div>
      )}

      <FooterLink label="Ver historial completo" to="/sites/$siteId/savings" params={{ siteId }} />
    </div>
  );
}

export function EnvironmentalImpactCard({
  siteId,
  emissionFactor = 0.4,
}: {
  siteId: string;
  emissionFactor?: number;
}) {
  const [todayKwh, setTodayKwh] = useState<number | null>(null);
  const [monthKwh, setMonthKwh] = useState<number | null>(null);
  const [yearKwh, setYearKwh] = useState<number | null>(null);

  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;

    async function loadTotals() {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      const monthPrefix = today.slice(0, 7);

      const { data } = await supabase
        .from("daily_totals")
        .select("day, pv_kwh")
        .eq("site_id", siteId)
        .gte("day", yearStart)
        .order("day", { ascending: true });

      if (cancelled || !data) return;

      let year = 0;
      let month = 0;
      let day = 0;

      for (const row of data) {
        const pvKwh = Math.max(0, Number(row.pv_kwh ?? 0));
        year += pvKwh;
        if (String(row.day).startsWith(monthPrefix)) month += pvKwh;
        if (row.day === today) day += pvKwh;
      }

      setTodayKwh(day);
      setMonthKwh(month);
      setYearKwh(year);
    }

    void loadTotals();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const co2Today = Math.max(0, (todayKwh ?? 0) * emissionFactor);
  const co2Month = Math.max(0, (monthKwh ?? 0) * emissionFactor);
  const co2Year = Math.max(0, (yearKwh ?? 0) * emissionFactor);
  const treesEquivalent = co2Year / 22;

  const statCards = [
    {
      label: "HOY",
      value: `${co2Today.toFixed(2)} kg`,
      subtitle: `${(todayKwh ?? 0).toFixed(1)} kWh`,
      icon: <CalendarDays className="h-4 w-4" />,
    },
    {
      label: "ESTE MES",
      value: `${co2Month.toFixed(1)} kg`,
      subtitle: `${(monthKwh ?? 0).toFixed(1)} kWh`,
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      label: "ÁRBOLES EQUIV.",
      value: treesEquivalent.toFixed(1),
      subtitle: `${co2Year.toFixed(0)} kg/año ÷ 22`,
      icon: <TreePine className="h-4 w-4" />,
    },
  ];

  return (
    <div
      className="dashboard-card p-5 sm:p-6"
      style={{
        background: "var(--card)",
        borderColor: "color-mix(in oklab, var(--success) 28%, var(--border))",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{
              color: "var(--success)",
              borderColor: "color-mix(in oklab, var(--success) 28%, var(--border))",
              background: "color-mix(in oklab, var(--success) 10%, transparent)",
            }}
          >
            <Leaf className="h-4 w-4" />
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Impacto ambiental</h3>
        </div>

        <span
          className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold"
          style={{
            color: "var(--success)",
            borderColor: "color-mix(in oklab, var(--success) 24%, var(--border))",
            background: "color-mix(in oklab, var(--success) 12%, transparent)",
          }}
        >
          CO₂ evitado
        </span>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border px-4 py-4"
        style={{
          background: "linear-gradient(180deg, color-mix(in oklab, var(--success) 12%, var(--card)) 0%, var(--card) 100%)",
          borderColor: "color-mix(in oklab, var(--success) 22%, var(--border))",
        }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[44%]"
          style={{ background: "radial-gradient(circle at 40% 50%, color-mix(in oklab, var(--success) 20%, transparent) 0%, transparent 58%)" }}
        />
        <div className="relative z-10 grid items-center gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/70">Acumulado anual</div>
            <div className="mt-1 text-[36px] font-semibold leading-none tracking-tight sm:text-[44px]" style={{ color: "var(--success)" }}>
              {co2Year.toFixed(1)}
            </div>
            <div className="mt-1 text-[13px] text-foreground">kg CO₂ evitados</div>
          </div>

          <div className="relative flex items-center justify-center sm:h-[90px] sm:w-[90px]">
            <Leaf className="h-16 w-16 sm:h-20 sm:w-20" style={{ color: "var(--success)", filter: "drop-shadow(0 0 10px color-mix(in oklab, var(--success) 35%, transparent))" }} strokeWidth={1.6} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 md:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border px-3 py-2.5"
            style={{
              background: "var(--card)",
              borderColor: "color-mix(in oklab, var(--border) 58%, transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border"
                style={{
                  color: "var(--success)",
                  borderColor: "color-mix(in oklab, var(--success) 24%, var(--border))",
                  background: "color-mix(in oklab, var(--success) 10%, transparent)",
                }}
              >
                {card.icon}
              </div>
              <div className="text-[10px] font-semibold tracking-[0.03em] text-muted-foreground">{card.label}</div>
            </div>
            <div className="mt-2 text-[20px] font-semibold leading-none tracking-tight text-foreground">{card.value}</div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{card.subtitle}</div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
        style={{
          background: "var(--card)",
          borderColor: "color-mix(in oklab, var(--border) 58%, transparent)",
        }}
      >
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          CO₂ evitado = Energía generada (kWh) × {emissionFactor.toFixed(2)} kg CO₂/kWh · Árboles equivalentes = CO₂ anual ÷ 22.
        </p>
      </div>
    </div>
  );
}


function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className="text-right font-semibold text-foreground">{value}</div>
    </>
  );
}