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
}

/** Estimate produced kWh from radiation Wh/m² using PVWatts-style formula:
 *  E = kWp * (H / 1000) * (1 - losses)
 *  H is plane-of-array radiation in Wh/m². For a hourly W/m² value, hourly Wh/m² ≈ W/m² * 1h.
 */
function estimateKwh(radWhPerM2: number, kwp: number, lossesPct: number): number {
  const losses = Math.max(0, Math.min(50, lossesPct)) / 100;
  return Math.max(0, kwp * (radWhPerM2 / 1000) * (1 - losses));
}

export function SolarForecastWidget({ pvConfig }: { pvConfig?: ForecastPvConfig } = {}) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }>>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    // PV config coords take precedence
    if (pvConfig?.lat != null && pvConfig?.lon != null) {
      const c: Coords = { lat: pvConfig.lat, lon: pvConfig.lon };
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
  }, [pvConfig?.lat, pvConfig?.lon]);

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

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 animate-fade-in">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
            title="Cambiar ubicación"
          >
            <MapPin className="h-3.5 w-3.5" /> {data.city}
          </button>
          <div className="mt-1 flex items-center gap-3">
            {weatherIcon(data.current.weatherCode, "h-10 w-10 sm:h-12 sm:w-12")}
            <div>
              <div className="text-3xl font-bold leading-none sm:text-4xl">
                {Math.round(data.current.temperature)}°
              </div>
              <div className="text-xs text-muted-foreground">{weatherLabel(data.current.weatherCode)}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Radiación</div>
            <div className="text-2xl font-bold text-[var(--solar)]">
              {Math.round(data.current.radiation)}<span className="ml-1 text-sm font-normal text-muted-foreground">W/m²</span>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => void detectAndLoad()}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
              title="Usar mi ubicación"
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => coords && void loadForecast(coords)}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
              title="Actualizar pronóstico"
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

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

      {/* Hourly radiation bars */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Próximas 12 h — radiación solar
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {data.hourly.map((h, i) => {
            const height = (h.radiation / peak) * 100;
            const hour = new Date(h.time).getHours();
            return (
              <div key={h.time} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-[var(--solar)] to-[var(--accent)] transition-all"
                  style={{
                    height: `${Math.max(4, height)}%`,
                    animation: `growUp 0.6s ease-out ${i * 40}ms both`,
                  }}
                  title={`${Math.round(h.radiation)} W/m² · ${Math.round(h.temperature)}°`}
                />
                <div className="text-[10px] text-muted-foreground">{hour}h</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily summary */}
      <div className="grid grid-cols-5 gap-2 border-t pt-3">
        {data.daily.slice(0, 5).map((d, i) => (
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
          </div>
        ))}
      </div>

      <style>{`
        @keyframes growUp { from { height: 0%; opacity: 0; } }
      `}</style>
    </div>
  );
}
