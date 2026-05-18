import { useEffect, useRef, useState } from "react";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Loader2, MapPin, RefreshCw, Search, LocateFixed } from "lucide-react";

interface ForecastHour {
  time: string;
  temperature: number;
  radiation: number;     // W/m²
  cloudCover: number;    // %
  weatherCode: number;
}

interface ForecastData {
  city: string;
  current: { temperature: number; weatherCode: number; radiation: number };
  hourly: ForecastHour[];
  daily: { date: string; max: number; min: number; sunshineHours: number; weatherCode: number }[];
}

interface Coords { lat: number; lon: number; city?: string }

const STORAGE_KEY = "solarforecast.coords.v2";

function weatherIcon(code: number, className = "h-5 w-5") {
  if (code === 0 || code === 1) return <Sun className={`${className} text-[var(--solar)]`} />;
  if (code <= 3) return <Cloud className={className} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={className} />;
  if (code >= 95) return <CloudLightning className={className} />;
  return <CloudRain className={className} />;
}

function weatherLabel(code: number): string {
  if (code === 0) return "Despejado";
  if (code === 1) return "Mayormente despejado";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code >= 45 && code <= 48) return "Niebla";
  if (code >= 51 && code <= 57) return "Llovizna";
  if (code >= 61 && code <= 67) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nieve";
  if (code >= 80 && code <= 82) return "Chubascos";
  if (code >= 95) return "Tormenta";
  return "—";
}

export interface ForecastPvConfig {
  kwp?: number | null;
  lossesPct?: number | null;
  batteryKwh?: number | null;
  lat?: number | null;
  lon?: number | null;
  locationLabel?: string | null;
  manualCalibration?: number | null;
  smoothingAlpha?: number | null;
  siteKey?: string | null;
}

/** Estimate produced kWh from radiation Wh/m² using PVWatts-style formula:
 *  E = kWp * (H / 1000) * (1 - losses)
 *  H is plane-of-array radiation in Wh/m². For a hourly W/m² value, hourly Wh/m² ≈ W/m² * 1h.
 */
function estimateKwh(radWhPerM2: number, kwp: number, lossesPct: number, calibration = 1): number {
  const losses = Math.max(0, Math.min(50, lossesPct)) / 100;
  return Math.max(0, kwp * (radWhPerM2 / 1000) * (1 - losses) * calibration);
}

export interface ForecastLiveSample {
  pv_w?: number | null;
  load_w?: number | null;
  battery_pct?: number | null;
  recorded_at?: string | null;
}

const CALIB_KEY = (k: string) => `solarforecast.calib.${k}`;

export function SolarForecastWidget({ pvConfig, live }: { pvConfig?: ForecastPvConfig; live?: ForecastLiveSample } = {}) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }>>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // --- Calibration state (must be declared before any early return) ---
  const calibSiteKey = pvConfig?.siteKey
    ?? (pvConfig?.lat != null && pvConfig?.lon != null ? `${pvConfig.lat},${pvConfig.lon}` : "global");
  const calibStorageKey = CALIB_KEY(calibSiteKey);
  const [persistedCalib, setPersistedCalib] = useState<number>(1);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = parseFloat(localStorage.getItem(calibStorageKey) ?? "1");
    setPersistedCalib(isFinite(v) && v > 0 ? v : 1);
  }, [calibStorageKey]);


  useEffect(() => {
    // PV config coords take precedence
    if (pvConfig?.lat != null && pvConfig?.lon != null) {
      const c: Coords = { lat: pvConfig.lat, lon: pvConfig.lon, city: pvConfig.locationLabel ?? undefined };
      setCoords(c);
      void loadForecast(c);
      return;
    }
    const cached = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (cached) {
      try {
        const c = JSON.parse(cached) as Coords;
        setCoords(c);
        void loadForecast(c);
        return;
      } catch { /* ignore */ }
    }
    void detectAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvConfig?.lat, pvConfig?.lon, pvConfig?.locationLabel]);

  async function detectAndLoad() {
    setLoading(true);
    try {
      const c = await detectCoords();
      setCoords(c);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      await loadForecast(c);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  async function detectCoords(): Promise<Coords> {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("no geo"));
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
      });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      const r = await fetch("https://ipapi.co/json/");
      const j = await r.json();
      return { lat: j.latitude, lon: j.longitude, city: j.city };
    }
  }

  async function loadForecast(c: Coords) {
    setLoading(true);
    setError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
        `&current=temperature_2m,weather_code,shortwave_radiation` +
        `&hourly=temperature_2m,weather_code,cloud_cover,shortwave_radiation` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunshine_duration` +
        `&forecast_days=5&timezone=auto`;
      const res = await fetch(url);
      const j = await res.json();
      let city = c.city ?? "Mi ubicación";
      if (!c.city) {
        try {
          const g = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${c.lat}&longitude=${c.lon}&language=es`);
          const gj = await g.json();
          if (gj.results?.[0]?.name) city = gj.results[0].name;
        } catch { /* ignore */ }
      }
      const now = new Date();
      const hourly: ForecastHour[] = [];
      const times: string[] = j.hourly?.time ?? [];
      for (let i = 0; i < times.length; i++) {
        const dt = new Date(times[i]);
        if (dt < now) continue;
        if (hourly.length >= 12) break;
        hourly.push({
          time: times[i],
          temperature: j.hourly.temperature_2m[i],
          radiation: j.hourly.shortwave_radiation[i],
          cloudCover: j.hourly.cloud_cover[i],
          weatherCode: j.hourly.weather_code[i],
        });
      }
      const daily = (j.daily?.time ?? []).map((d: string, i: number) => ({
        date: d,
        max: j.daily.temperature_2m_max[i],
        min: j.daily.temperature_2m_min[i],
        sunshineHours: (j.daily.sunshine_duration[i] ?? 0) / 3600,
        weatherCode: j.daily.weather_code[i],
      }));
      setData({
        city,
        current: {
          temperature: j.current.temperature_2m,
          weatherCode: j.current.weather_code,
          radiation: j.current.shortwave_radiation,
        },
        hourly, daily,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function searchCity(q: string) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=es&format=json`);
        const j = await r.json();
        setResults(j.results ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  function pickCity(r: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }) {
    const c: Coords = { lat: r.latitude, lon: r.longitude, city: r.name };
    setCoords(c);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    setPickerOpen(false);
    setSearch("");
    setResults([]);
    void loadForecast(c);
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground animate-pulse">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando previsión solar…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        No se pudo obtener la previsión solar.{" "}
        <button onClick={() => void detectAndLoad()} className="text-primary underline">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;
  const peak = Math.max(1, ...data.hourly.map((h) => h.radiation));

  // Calibration values (state already declared near top of component).
  const kwpForCalib = pvConfig?.kwp ?? null;
  const lossesForCalib = pvConfig?.lossesPct ?? 14;
  const liveKwForCalib = live?.pv_w != null ? Math.max(0, Number(live.pv_w)) / 1000 : null;
  const manual = pvConfig?.manualCalibration != null && pvConfig.manualCalibration > 0
    ? Math.max(0.2, Math.min(3, Number(pvConfig.manualCalibration)))
    : null;
  const calibration = manual ?? persistedCalib;



  // Dynamic gradient based on weather
  const wc = data.current.weatherCode;
  const isSunny = wc <= 1;
  const isCloudy = wc >= 2 && wc <= 3;
  const isRainy = wc >= 51 && wc <= 82;
  const isStormy = wc >= 95;
  const heroGradient = isStormy
    ? "from-slate-900 via-slate-800 to-indigo-950"
    : isRainy
    ? "from-slate-700 via-slate-600 to-blue-900"
    : isCloudy
    ? "from-slate-500 via-slate-400 to-blue-700"
    : isSunny
    ? "from-amber-500 via-orange-500 to-rose-600"
    : "from-sky-500 via-blue-600 to-indigo-700";

  return (
    <div className="@container relative overflow-hidden rounded-2xl border bg-card shadow-lg animate-fade-in">
      {/* Hero header with weather-themed gradient */}
      <div className={`relative overflow-hidden bg-gradient-to-br ${heroGradient} p-4 sm:p-5 text-white`}>
        {/* Animated decorative elements */}
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/20 blur-3xl animate-pulse" />
          <div className="absolute -bottom-10 left-1/3 h-32 w-32 rounded-full bg-white/10 blur-2xl" style={{ animation: "pulse 4s ease-in-out infinite" }} />
        </div>
        {isSunny && (
          <div className="pointer-events-none absolute top-2 right-4 opacity-40">
            <Sun className="h-32 w-32 text-white" style={{ animation: "spin 60s linear infinite" }} />
          </div>
        )}

        <div className="relative flex flex-col gap-3 @[420px]:flex-row @[420px]:items-start @[420px]:justify-between">
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              title="Cambiar ubicación"
            >
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{data.city}</span>
            </button>
            <div className="mt-3 flex items-end gap-3">
              <div className="text-5xl font-extrabold leading-none tracking-tighter @[420px]:text-6xl">
                {Math.round(data.current.temperature)}<span className="text-3xl">°</span>
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex items-center gap-1.5">
                  {weatherIcon(data.current.weatherCode, "h-5 w-5 text-white")}
                  <div className="truncate text-sm font-medium">{weatherLabel(data.current.weatherCode)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 @[420px]:flex-col @[420px]:items-end">
            <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur-md @[420px]:text-right">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-white/80">Radiación</div>
              <div className="text-2xl font-bold tabular-nums">
                {Math.round(data.current.radiation)}<span className="ml-1 text-xs font-normal text-white/80">W/m²</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => void detectAndLoad()}
                className="inline-flex items-center gap-1 rounded-full bg-white/20 p-2 text-xs text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                title="Usar mi ubicación"
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => coords && void loadForecast(coords)}
                className="inline-flex items-center gap-1 rounded-full bg-white/20 p-2 text-xs text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                title="Actualizar pronóstico"
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5">

      {pickerOpen && (
        <div className="mb-4 rounded-lg border bg-background p-3 animate-fade-in">
          <div className="flex items-center gap-2 rounded-md border bg-card px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => { setSearch(e.target.value); searchCity(e.target.value); }}
              placeholder="Buscar ciudad…"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
            {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {results.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-auto rounded-md border bg-card text-sm">
              {results.map((r, i) => (
                <li key={`${r.latitude}-${r.longitude}-${i}`}>
                  <button
                    onClick={() => pickCity(r)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted"
                  >
                    <span>{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[r.admin1, r.country].filter(Boolean).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Production: live from inverter + 12h forecast */}
      {(pvConfig?.kwp || live?.pv_w != null) ? (() => {
        const kwp = pvConfig?.kwp ?? null;
        const losses = pvConfig?.lossesPct ?? 14;
        const liveW = live?.pv_w != null ? Math.max(0, Number(live.pv_w)) : null;
        const liveKw = liveW != null ? liveW / 1000 : null;
        const calibrated = calibration !== 1;
        const next12kwh = kwp
          ? data.hourly.reduce((acc, h) => acc + estimateKwh(h.radiation, kwp, losses, calibration), 0)
          : 0;
        const batteryKwh = pvConfig?.batteryKwh ?? 0;
        const batteryFillH = batteryKwh > 0 && next12kwh > 0
          ? batteryKwh / Math.max(0.01, next12kwh / 12)
          : 0;
        const pctOfPeak = liveKw != null && kwp ? Math.min(100, (liveKw / kwp) * 100) : null;
        const ageSec = live?.recorded_at
          ? Math.max(0, Math.round((Date.now() - new Date(live.recorded_at).getTime()) / 1000))
          : null;
        const fresh = ageSec != null && ageSec < 120;
        return (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {liveW != null && (
              <div className="rounded-lg border bg-gradient-to-br from-emerald-500/10 to-transparent p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Producción ahora <span className="text-emerald-600">(inversor)</span>
                  </div>
                  {ageSec != null && (
                    <div className={`text-[10px] ${fresh ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {fresh ? "en vivo" : `hace ${ageSec < 60 ? `${ageSec}s` : `${Math.round(ageSec / 60)}min`}`}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-2xl font-bold text-emerald-600 tabular-nums @[420px]:text-3xl">
                    {liveKw! < 1 ? Math.round(liveW) : liveKw!.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">{liveKw! < 1 ? "W" : "kW"}</div>
                  {pctOfPeak != null && (
                    <div className="ml-auto text-[10px] text-muted-foreground">{pctOfPeak.toFixed(0)}% del pico</div>
                  )}
                </div>
                {pctOfPeak != null && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-[var(--solar)] transition-all"
                      style={{ width: `${pctOfPeak}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {kwp && (
              <div className="rounded-lg border bg-gradient-to-br from-[var(--solar)]/10 to-transparent p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Producción estimada 12 h
                    {calibrated && (
                      <span className="ml-1 text-emerald-600" title={`Calibrado con tu inversor (×${calibration.toFixed(2)})`}>
                        · calibrado
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {kwp} kWp · {losses}%{calibrated ? ` · ×${calibration.toFixed(2)}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-2xl font-bold text-[var(--solar)] tabular-nums @[420px]:text-3xl">{next12kwh.toFixed(2)}</div>
                  <div className="text-sm text-muted-foreground">kWh</div>
                  {batteryKwh > 0 && batteryFillH > 0 && (
                    <div className="basis-full text-[10px] text-muted-foreground @[420px]:basis-auto @[420px]:ml-auto">
                      ≈ {batteryFillH.toFixed(1)} h para llenar {batteryKwh} kWh
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })() : null}

      {/* Hourly radiation bars (with production overlay) */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Próximas 12 h — radiación solar{pvConfig?.kwp ? " y producción estimada" : ""}
        </div>
        <div className="flex h-28 items-end gap-1.5">
          {data.hourly.map((h, i) => {
            const height = (h.radiation / peak) * 100;
            const hour = new Date(h.time).getHours();
            const kwh = pvConfig?.kwp ? estimateKwh(h.radiation, pvConfig.kwp, pvConfig.lossesPct ?? 14, calibration) : 0;
            return (
              <div key={h.time} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="relative w-full rounded-t bg-gradient-to-t from-[var(--solar)] to-[var(--accent)] transition-all"
                  style={{
                    height: `${Math.max(4, height)}%`,
                    animation: `growUp 0.6s ease-out ${i * 40}ms both`,
                  }}
                  title={`${Math.round(h.radiation)} W/m² · ${Math.round(h.temperature)}°${kwh ? ` · ${kwh.toFixed(2)} kWh` : ""}`}
                >
                  {kwh > 0 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-[var(--solar)]">
                      {kwh.toFixed(1)}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">{hour}h</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily summary */}
      <div className="grid grid-cols-5 gap-2 border-t pt-3">
        {data.daily.slice(0, 5).map((d, i) => {
          // Daily kWh estimate: sunshine hours × kWp × (1 - losses) × capacity factor × inverter calibration
          const dailyKwh = pvConfig?.kwp
            ? pvConfig.kwp * d.sunshineHours * 0.65 * (1 - (pvConfig.lossesPct ?? 14) / 100) * calibration
            : null;
          return (
            <div
              key={d.date}
              className="flex flex-col items-center gap-1 rounded-lg p-2 text-center transition-colors hover:bg-muted/50"
              style={{ animation: `fade-in 0.4s ease-out ${i * 80}ms both` }}
            >
              <div className="text-[10px] font-medium uppercase text-muted-foreground">
                {i === 0 ? "Hoy" : new Date(d.date).toLocaleDateString("es", { weekday: "short" })}
              </div>
              {weatherIcon(d.weatherCode)}
              <div className="text-xs font-semibold">{Math.round(d.max)}°<span className="text-muted-foreground"> / {Math.round(d.min)}°</span></div>
              <div className="text-[10px] text-[var(--solar)]">{d.sunshineHours.toFixed(1)} h ☀</div>
              {dailyKwh != null && (
                <div className="text-[10px] font-bold text-[var(--accent)]">{dailyKwh.toFixed(1)} kWh</div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes growUp { from { height: 0%; opacity: 0; } }
      `}</style>
      </div>
    </div>
  );
}
