import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Home,
  Info,
  Leaf,
  MoreVertical,
  Sun,
  Zap,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PvConfig } from "@/components/PvSystemConfig";

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
              background: `color-mix(in oklab, ${badgeColor ?? "var(--success)"} 14%, white)`,
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
        style={{ background: "color-mix(in oklab, var(--card) 92%, white)" }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className="mt-4 inline-flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold text-muted-foreground"
      style={{ background: "color-mix(in oklab, var(--card) 92%, white)" }}
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
}: {
  label: string;
  value: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border"
        style={{
          color: accent,
          borderColor: `color-mix(in oklab, ${accent} 28%, var(--border))`,
          background: `color-mix(in oklab, ${accent} 8%, white)`,
        }}
      >
        {icon}
      </div>
      <div className="text-[11px] font-semibold leading-none" style={{ color: accent }}>{value}</div>
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
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, var(--muted) 70%, white)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamp(progress, 0, 100)}%`,
            background: `linear-gradient(90deg, ${accent} 0%, color-mix(in oklab, ${accent} 70%, white) 100%)`,
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
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} 74%, white), ${color})`,
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
      style={{ background: "color-mix(in oklab, var(--card) 96%, white)" }}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-bold tabular-nums text-foreground">{value}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}

export function useSolarReferenceWeather(pvConfig?: PvConfig | null) {
  const [data, setData] = useState<DashboardWeatherData | null>(null);

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

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index,weather_code,shortwave_radiation&hourly=temperature_2m,weather_code,shortwave_radiation&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=6&timezone=auto`;
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
        }));

        if (!cancelled) {
          setData({
            city,
            current: {
              temperature: Number(weatherJson.current?.temperature_2m ?? 0),
              apparentTemperature: Number(weatherJson.current?.apparent_temperature ?? 0),
              humidity: Number(weatherJson.current?.relative_humidity_2m ?? 0),
              windSpeed: Number(weatherJson.current?.wind_speed_10m ?? 0),
              uvIndex: Number(weatherJson.current?.uv_index ?? 0),
              weatherCode: Number(weatherJson.current?.weather_code ?? 0),
              radiation: Number(weatherJson.current?.shortwave_radiation ?? 0),
            },
            hourly,
            daily,
          });
        }
      } catch {
        if (!cancelled) setData(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pvConfig?.latitude, pvConfig?.location_label, pvConfig?.longitude]);

  return data;
}

export function SystemStatusCard({
  pv,
  load,
  battery,
  batteryV,
  gridV,
  pvMax,
  loadMax = 5200,
}: {
  pv: number;
  load: number;
  battery: number;
  batteryV: number;
  gridV: number;
  pvMax: number;
  loadMax?: number;
}) {
  const gridConnected = gridV > 50;
  const ringSize = 108;
  const stroke = 9;
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

      <div className="grid grid-cols-[1fr_auto_1fr_auto_1.2fr_auto_1fr] items-center gap-2 pb-5 max-[520px]:grid-cols-2 max-[520px]:gap-y-4">
        <StatusMetric label="Solar" value={formatWatts(pv)} accent="var(--solar)" icon={<Sun className="h-5 w-5" />} />
        <div className="h-px w-12 border-t border-dashed max-[520px]:hidden" style={{ borderColor: "color-mix(in oklab, var(--solar) 60%, white)" }} />
        <StatusMetric label="Consumo" value={formatWatts(load)} accent="var(--load)" icon={<Home className="h-5 w-5" />} />
        <div className="h-px w-12 border-t border-dashed max-[520px]:hidden" style={{ borderColor: "color-mix(in oklab, var(--load) 60%, white)" }} />

        <div className="relative mx-auto h-[108px] w-[108px] max-[520px]:col-span-2">
          <svg viewBox={`0 0 ${ringSize} ${ringSize}`} className="-rotate-[130deg]">
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="color-mix(in oklab, var(--battery) 18%, white)"
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
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[34px] font-bold leading-none" style={{ color: "var(--battery)" }}>{Math.round(battery)}%</div>
            <div className="mt-1 text-[12px] text-muted-foreground">{batteryV.toFixed(1)} v</div>
            <div className="mt-1 text-[12px] text-muted-foreground">Batería</div>
          </div>
        </div>

        <div className="h-px w-12 border-t border-dashed max-[520px]:hidden" style={{ borderColor: "color-mix(in oklab, var(--battery) 60%, white)" }} />
        <StatusMetric
          label="Red"
          value={gridConnected ? `${Math.round(gridV)} v` : "0 w"}
          accent={gridConnected ? "var(--foreground)" : "var(--muted-foreground)"}
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: "color-mix(in oklab, var(--border) 80%, white)" }}>
        <ProgressRow label="Generación solar" value={formatWatts(pv)} progress={(pv / Math.max(pvMax, 1)) * 100} accent="var(--solar)" icon={<Sun className="h-3.5 w-3.5" style={{ color: "var(--solar)" }} />} />
        <ProgressRow label="Consumo de la casa" value={formatWatts(load)} progress={(load / Math.max(loadMax, 1)) * 100} accent="var(--load)" icon={<Home className="h-3.5 w-3.5" style={{ color: "var(--load)" }} />} />
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

  return (
    <div className="dashboard-card p-5 sm:p-6">
      <DashboardCardHeader
        icon={<Zap className="h-4 w-4" strokeWidth={2.2} />}
        title="Flujo de energía"
        badgeColor="var(--load)"
        trailing={<Info className="h-4 w-4 text-muted-foreground" />}
      />

      <svg viewBox="0 0 520 280" className="w-full">
        <defs>
          <marker id="ref-arrow-solar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10z" fill="var(--solar)" />
          </marker>
          <marker id="ref-arrow-load" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10z" fill="var(--load)" />
          </marker>
          <marker id="ref-arrow-battery" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10z" fill="var(--battery)" />
          </marker>
        </defs>

        <path d="M140 165 C160 120 200 120 240 118" fill="none" stroke="var(--battery)" strokeWidth="2.5" markerEnd="url(#ref-arrow-battery)" />
        <path d="M260 95 L260 136" fill="none" stroke="var(--solar)" strokeWidth="2.5" markerEnd="url(#ref-arrow-solar)" />
        <path d="M278 118 C318 118 340 146 340 176" fill="none" stroke="var(--load)" strokeWidth="2.5" markerEnd="url(#ref-arrow-load)" />
        <path d="M315 188 L394 188" fill="none" stroke="color-mix(in oklab, var(--muted-foreground) 70%, white)" strokeWidth="2" strokeDasharray="5 6" />
        <path d="M320 184 L330 188 L320 192" fill="none" stroke="color-mix(in oklab, var(--muted-foreground) 70%, white)" strokeWidth="1.8" />
        <path d="M390 184 L380 188 L390 192" fill="none" stroke="color-mix(in oklab, var(--muted-foreground) 70%, white)" strokeWidth="1.8" />

        <g transform="translate(240 42)">
          <circle cx="0" cy="0" r="32" fill="color-mix(in oklab, var(--solar) 10%, white)" stroke="color-mix(in oklab, var(--solar) 35%, var(--border))" />
          <circle cx="0" cy="-6" r="9" fill="var(--solar)" />
          <g stroke="var(--solar)" strokeWidth="2" strokeLinecap="round">
            <line x1="0" y1="-24" x2="0" y2="-18" />
            <line x1="0" y1="6" x2="0" y2="12" />
            <line x1="-18" y1="-6" x2="-12" y2="-6" />
            <line x1="12" y1="-6" x2="18" y2="-6" />
          </g>
          <g transform="translate(-18 8) skewX(-18)">
            <rect x="0" y="0" width="36" height="16" rx="2" fill="color-mix(in oklab, var(--load) 40%, black)" />
            <path d="M0 5 H36 M0 10 H36 M9 0 V16 M18 0 V16 M27 0 V16" stroke="color-mix(in oklab, white 35%, var(--load))" strokeWidth="0.8" />
          </g>
        </g>
        <text x="286" y="58" className="fill-[var(--solar)] text-[18px] font-bold">{Math.round(pv)} w</text>
        <text x="286" y="78" className="fill-muted-foreground text-[12px]">Generación solar</text>

        <g transform="translate(98 198)">
          <circle cx="0" cy="0" r="30" fill="color-mix(in oklab, var(--battery) 10%, white)" stroke="color-mix(in oklab, var(--battery) 35%, var(--border))" />
          <rect x="-10" y="-10" width="20" height="18" rx="2" fill="none" stroke="var(--battery)" strokeWidth="2" />
          <rect x="-4" y="-14" width="8" height="4" rx="1" fill="var(--battery)" />
          <path d="M-1 -3 L4 -3 L0 6 L5 6" fill="none" stroke="var(--battery)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="66" y="256" className="fill-[var(--battery)] text-[18px] font-bold">{Math.round(dischargeW)} w</text>
        <text x="62" y="274" className="fill-muted-foreground text-[12px]">Batería</text>
        <text x="44" y="292" className="fill-muted-foreground text-[11px]">{Math.round(battery)}% · {batteryV.toFixed(1)} v</text>

        <g transform="translate(248 198)">
          <circle cx="0" cy="0" r="30" fill="color-mix(in oklab, var(--load) 8%, white)" stroke="color-mix(in oklab, var(--load) 35%, var(--border))" />
          <path d="M-12 4 V-5 L0 -15 L12 -5 V4 M-6 4 V-5 H6 V4" fill="none" stroke="var(--load)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="278" y="202" className="fill-[var(--load)] text-[22px] font-bold">{Math.round(load)} w</text>
        <text x="278" y="222" className="fill-muted-foreground text-[12px]">Consumo de la casa</text>

        <g transform="translate(430 198)">
          <circle cx="0" cy="0" r="30" fill="color-mix(in oklab, var(--muted) 55%, white)" stroke="color-mix(in oklab, var(--muted-foreground) 28%, var(--border))" />
          <path d="M0 -18 L-6 16 M0 -18 L6 16 M-10 -8 H10 M-8 0 H8 M-6 8 H6" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <text x="412" y="256" className="fill-foreground text-[18px] font-bold">0 w</text>
        <text x="410" y="274" className="fill-muted-foreground text-[12px]">Red</text>
        <text x="390" y="292" className="fill-muted-foreground text-[11px]">{gridConnected ? `${Math.round(gridV)} v` : "Desconectada"}</text>
      </svg>
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
        <div className="relative min-h-[172px] overflow-hidden rounded-xl border" style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--load) 14%, white), color-mix(in oklab, var(--card) 85%, white))" }}>
          <div className="absolute inset-x-0 top-0 h-[58%]" style={{ background: "linear-gradient(180deg, #bfe1ff 0%, #eaf4ff 100%)" }} />
          <div className="absolute right-5 top-6 h-12 w-12 rounded-full" style={{ background: "radial-gradient(circle at 35% 35%, #fffce8, #ffd54f 58%, #ff9800 100%)", boxShadow: "0 0 24px rgba(255,193,7,.45)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-[48%] bg-white" />
          <div className="absolute bottom-0 left-[18%] h-[72%] w-[36%] bg-white" style={{ clipPath: "polygon(0 100%, 0 56%, 54% 18%, 100% 56%, 100% 100%)", border: "1px solid color-mix(in oklab, var(--border) 80%, white)" }} />
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

      <FooterLink label="Ver análisis de producción" />
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
              <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="color-mix(in oklab, var(--load) 16%, white)" strokeWidth={stroke} strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round" />
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

export function WeatherOverviewCard({ data }: { data: DashboardWeatherData | null }) {
  if (!data) {
    return (
      <div className="dashboard-card p-5 sm:p-6">
        <DashboardCardHeader icon={<Sun className="h-4 w-4" />} title="Clima" badgeColor="var(--solar)" />
        <div className="text-sm text-muted-foreground">Cargando condiciones meteorológicas…</div>
      </div>
    );
  }

  return (
    <div
      className="dashboard-card p-5 sm:p-6"
      style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--load) 8%, white) 0%, color-mix(in oklab, var(--card) 96%, white) 100%)" }}
    >
      <DashboardCardHeader icon={<Sun className="h-4 w-4" />} title={`Clima en ${data.city}`} badgeColor="var(--solar)" />

      <div className="grid grid-cols-[1.2fr_1fr] gap-4 max-[520px]:grid-cols-1">
        <div>
          <div className="text-[58px] font-bold leading-none text-foreground">{Math.round(data.current.temperature)}°C</div>
          <div className="mt-2 flex items-center gap-2 text-[14px] text-muted-foreground">
            <WeatherGlyph code={data.current.weatherCode} className="h-5 w-5" />
            <span>{weatherLabel(data.current.weatherCode)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SmallStat label="Sensación" value={`${Math.round(data.current.apparentTemperature)}°C`} />
          <SmallStat label="Humedad" value={`${Math.round(data.current.humidity)}%`} />
          <SmallStat label="Viento" value={`${Math.round(data.current.windSpeed)} km/h`} />
          <SmallStat label="UV" value={`${Math.round(data.current.uvIndex)} Bajo`} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-2 rounded-xl border p-3 max-[520px]:grid-cols-3" style={{ background: "color-mix(in oklab, var(--card) 94%, white)" }}>
        {data.daily.slice(0, 6).map((day, index) => (
          <div key={day.date} className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: index === 0 ? "var(--load)" : "var(--muted-foreground)" }}>
              {index === 0 ? "Ahora" : new Date(day.date).toLocaleDateString("es-CL", { weekday: "short" })}
            </div>
            <div className="my-2 flex justify-center"><WeatherGlyph code={day.weatherCode} className="h-5 w-5" /></div>
            <div className="text-[12px] text-foreground">{Math.round(day.max)}° / {Math.round(day.min)}°</div>
          </div>
        ))}
      </div>

      <FooterLink label="Ver pronóstico completo" />
    </div>
  );
}

export function SolarRadiationCard({ data, pvConfig, livePv }: { data: DashboardWeatherData | null; pvConfig?: PvConfig | null; livePv: number }) {
  const kwp = pvConfig?.array_kwp ?? 5.2;
  const losses = pvConfig?.system_losses_pct ?? 14;
  const hours = data?.hourly ?? [];
  const currentRadiation = Math.round(data?.current.radiation ?? 0);
  const next12kwh = hours.reduce((sum, hour) => sum + estimateKwh(hour.radiation, kwp, losses), 0);

  const radiationPoints = hours.map((hour, index) => {
    const x = hours.length <= 1 ? 0 : (index / (hours.length - 1)) * 100;
    const y = 100 - clamp((hour.radiation / 1000) * 100, 0, 100);
    return `${index === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  const productionPoints = hours.map((hour, index) => {
    const x = hours.length <= 1 ? 0 : (index / (hours.length - 1)) * 100;
    const estimated = estimateKwh(hour.radiation, kwp, losses);
    const y = 100 - clamp((estimated / 1.2) * 100, 0, 100);
    return `${index === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  return (
    <div
      className="dashboard-card p-5 sm:p-6"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, var(--solar) 92%, white) 0%, color-mix(in oklab, var(--solar) 24%, white) 54%, color-mix(in oklab, var(--card) 97%, white) 54%)`,
      }}
    >
      <DashboardCardHeader icon={<Sun className="h-4 w-4" />} title="Radiación solar" badgeColor="white" />

      <div className="grid grid-cols-[0.95fr_1.45fr] gap-3 max-[640px]:grid-cols-1">
        <div className="text-white">
          <div className="text-[58px] font-bold leading-none">{currentRadiation}</div>
          <div className="mt-1 text-[16px] font-medium">W/m²</div>
          <div className="mt-4 text-[14px]">Actual</div>
          <div className="text-[22px] font-semibold">{currentRadiation > 650 ? "Muy alta" : currentRadiation > 250 ? "Alta" : currentRadiation > 80 ? "Media" : "Baja"}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/50 bg-white p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Producción ahora</div>
            <div className="mt-2 text-[30px] font-bold" style={{ color: "var(--solar)" }}>{Math.round(livePv)} w</div>
            <div className="mt-1 text-[12px] text-muted-foreground">Inversor</div>
          </div>
          <div className="rounded-2xl border border-white/50 bg-white p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Producción estimada 12 h</div>
            <div className="mt-2 text-[30px] font-bold" style={{ color: "var(--solar)" }}>{next12kwh.toFixed(2)} kWh</div>
            <div className="mt-1 text-[12px] text-muted-foreground">{kwp.toFixed(1)} kWp · 14% · ×1.00</div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/50 bg-white/96 p-3">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-foreground">Próximas 12 h — radiación solar y producción estimada</div>
        <div className="mb-2 flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--solar)" }} />Radiación (W/m²)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--load)" }} />Producción (kWh)</span>
        </div>
        <svg viewBox="0 0 100 34" className="h-28 w-full overflow-visible">
          <path d="M0 30 H100" stroke="color-mix(in oklab, var(--border) 80%, white)" strokeWidth="0.5" />
          <path d="M0 20 H100" stroke="color-mix(in oklab, var(--border) 70%, white)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
          <path d="M0 10 H100" stroke="color-mix(in oklab, var(--border) 70%, white)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
          <path d={radiationPoints} fill="none" stroke="var(--solar)" strokeWidth="1.7" strokeDasharray="3 2" />
          <path d={productionPoints} fill="none" stroke="var(--load)" strokeWidth="1.5" />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          {hours.slice(0, 6).map((hour) => (
            <span key={hour.time}>{new Date(hour.time).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SavingsReferenceCard({
  siteId,
  pvW,
  batteryDischargeW,
  energyPrice,
  currency,
}: {
  siteId: string;
  pvW: number;
  batteryDischargeW: number;
  energyPrice: number | null;
  currency?: string | null;
}) {
  const [todayKwh, setTodayKwh] = useState<number | null>(null);
  const [monthKwh, setMonthKwh] = useState<number | null>(null);
  const [yearKwh, setYearKwh] = useState<number | null>(null);
  const currentCurrency = currency ?? "CLP";

  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;

    async function loadTotals() {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      const { data } = await supabase
        .from("daily_totals")
        .select("day, pv_kwh, battery_discharged_kwh")
        .eq("site_id", siteId)
        .gte("day", yearStart)
        .order("day", { ascending: true });

      if (cancelled || !data) return;

      let year = 0;
      let month = 0;
      let day = 0;
      const currentMonth = now.getMonth();

      for (const row of data) {
        const saved = Number(row.pv_kwh ?? 0) + Number(row.battery_discharged_kwh ?? 0);
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

  if (!energyPrice) {
    return (
      <div className="dashboard-card p-5 sm:p-6">
        <DashboardCardHeader icon={<Leaf className="h-4 w-4" />} title="Ahorro económico" badgeColor="var(--success)" />
        <div className="text-sm text-muted-foreground">Configura el precio del kWh para ver el ahorro económico.</div>
      </div>
    );
  }

  const liveW = Math.max(0, pvW) + Math.max(0, batteryDischargeW);
  const perHour = (liveW / 1000) * energyPrice;
  const todayValue = (todayKwh ?? 0) * energyPrice;
  const monthValue = (monthKwh ?? 0) * energyPrice;
  const dayOfYear = Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000));
  const projectedYear = ((yearKwh ?? 0) / dayOfYear) * 365 * energyPrice;

  return (
    <div
      className="dashboard-card p-5 sm:p-6"
      style={{
        borderColor: "color-mix(in oklab, var(--success) 28%, var(--border))",
        background: "linear-gradient(180deg, color-mix(in oklab, var(--success) 7%, white) 0%, color-mix(in oklab, var(--card) 96%, white) 100%)",
      }}
    >
      <DashboardCardHeader icon={<Leaf className="h-4 w-4" />} title="Ahorro económico" badge="● En vivo" badgeColor="var(--success)" />

      <div className="rounded-2xl border p-4" style={{ background: "color-mix(in oklab, var(--success) 8%, white)" }}>
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ahorrando ahora</div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[48px] font-bold leading-none" style={{ color: "var(--success)" }}>{formatCurrency(perHour, currentCurrency)}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">/hora</div>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "color-mix(in oklab, var(--success) 12%, white)" }}>
            <Leaf className="h-8 w-8" style={{ color: "var(--success)" }} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 max-[520px]:grid-cols-1">
        <SmallStat label="Hoy" value={formatCurrency(todayValue, currentCurrency)} subtitle={`${(todayKwh ?? 0).toFixed(1)} kWh`} />
        <SmallStat label="Este mes" value={formatCurrency(monthValue, currentCurrency)} subtitle={`${(monthKwh ?? 0).toFixed(0)} kWh`} />
        <SmallStat label="Año proyectado" value={formatCurrency(projectedYear, currentCurrency)} subtitle={`${(yearKwh ?? 0).toFixed(0)} kWh real`} />
      </div>

      <FooterLink label="Ver historial completo" to="/sites/$siteId/savings" params={{ siteId }} />
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