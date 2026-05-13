import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sun, Save, Wand2, Search, Loader2, MapPin } from "lucide-react";

export interface PvConfig {
  site_id: string;
  array_kwp: number | null;
  panel_count: number | null;
  panel_watts: number | null;
  azimuth: number | null;
  tilt: number | null;
  battery_kwh: number | null;
  system_losses_pct: number | null;
  latitude: number | null;
  longitude: number | null;
  battery_count: number | null;
  battery_type: string | null;
  battery_voltage_each: number | null;
  battery_ah_each: number | null;
  battery_usable_dod_pct: number | null;
}

const BATTERY_TYPES: { v: string; l: string; dod: number }[] = [
  { v: "lithium", l: "Litio (LiFePO4)", dod: 90 },
  { v: "lithium_nmc", l: "Litio (NMC)", dod: 80 },
  { v: "agm", l: "AGM (sellada)", dod: 50 },
  { v: "gel", l: "Gel", dod: 50 },
  { v: "lead_acid", l: "Plomo-ácido (inundada)", dod: 50 },
  { v: "other", l: "Otra", dod: 60 },
];

export function defaultDodFor(type: string | null | undefined): number {
  return BATTERY_TYPES.find((b) => b.v === type)?.dod ?? 80;
}

export function usePvConfig(siteId: string) {
  const [config, setConfig] = useState<PvConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // Allow callers to opt out (e.g. local agent passes a sentinel when it
    // already has the config object from /api/pvconfig).
    if (!siteId || siteId.startsWith("__")) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("pv_system_config").select("*").eq("site_id", siteId).maybeSingle();
      if (!cancelled) { setConfig((data ?? null) as PvConfig | null); setLoaded(true); }
    })();
    const ch = supabase.channel(`pvcfg-${siteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pv_system_config", filter: `site_id=eq.${siteId}` },
        (p) => setConfig(p.new as PvConfig))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [siteId]);
  return { config, loaded };
}

export function PvSystemConfigCard({ siteId, maxAcOutputPower, nominalBatteryV }: {
  siteId: string;
  maxAcOutputPower?: number | null;
  nominalBatteryV?: number | null;
}) {
  const { config } = usePvConfig(siteId);
  const [form, setForm] = useState<PvConfig>({
    site_id: siteId,
    array_kwp: null, panel_count: null, panel_watts: null,
    azimuth: 180, tilt: 30, battery_kwh: null, system_losses_pct: 14,
    latitude: null, longitude: null,
    battery_count: null, battery_type: "lithium",
    battery_voltage_each: null, battery_ah_each: null, battery_usable_dod_pct: 90,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (config) setForm({ ...form, ...config }); /* eslint-disable-next-line */ }, [config]);

  function set<K extends keyof PvConfig>(k: K, v: PvConfig[K]) { setForm({ ...form, [k]: v }); }

  function autoFromInverter() {
    const next = { ...form };
    // Reasonable PV array sizing rule: PV ≈ 1.0–1.3× AC output
    if (maxAcOutputPower && !next.array_kwp) next.array_kwp = +(maxAcOutputPower / 1000).toFixed(2);
    // Battery capacity guess from nominal voltage (assume 100Ah common bank)
    if (nominalBatteryV && !next.battery_kwh) next.battery_kwh = +(nominalBatteryV * 100 / 1000).toFixed(1);
    setForm(next);
    toast.success("Valores precargados desde el inversor — ajusta y guarda");
  }

  function geolocate() {
    if (!navigator.geolocation) { toast.error("Geolocalización no disponible"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { set("latitude", +pos.coords.latitude.toFixed(4)); set("longitude", +pos.coords.longitude.toFixed(4)); toast.success("Ubicación capturada"); },
      () => toast.error("No se pudo obtener la ubicación"),
    );
  }

  async function save() {
    setSaving(true);
    const payload = { ...form, site_id: siteId };
    const { error } = await supabase.from("pv_system_config").upsert(payload as never, { onConflict: "site_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configuración fotovoltaica guardada");
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Sun className="h-4 w-4 text-[var(--solar)]" /> Sistema fotovoltaico</h3>
        <Button variant="outline" size="sm" onClick={autoFromInverter}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Auto desde inversor
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Estos datos se usan para estimar la producción solar diaria/horaria a partir de la previsión meteorológica.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Potencia del array (kWp)" hint="Suma de la potencia pico de todos los paneles">
          <Input type="number" step="0.01" value={form.array_kwp ?? ""} onChange={(e) => set("array_kwp", parseFloat(e.target.value) || null)} placeholder="ej. 5.20" />
        </Field>
        <Field label="Capacidad total batería (kWh)" hint="Se calcula automáticamente desde el banco si está configurado">
          <Input type="number" step="0.1" value={form.battery_kwh ?? ""} onChange={(e) => set("battery_kwh", parseFloat(e.target.value) || null)} placeholder="ej. 4.8" />
        </Field>

        <div className="sm:col-span-2 mt-2 rounded-lg border border-dashed bg-muted/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Banco de baterías</h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              const n = form.battery_count ?? 0;
              const v = form.battery_voltage_each ?? 0;
              const ah = form.battery_ah_each ?? 0;
              if (n > 0 && v > 0 && ah > 0) {
                const kwh = +((n * v * ah) / 1000).toFixed(2);
                set("battery_kwh", kwh);
                toast.success(`Capacidad calculada: ${kwh} kWh`);
              } else toast.error("Completa nº, voltaje y Ah primero");
            }}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Calcular kWh
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tipo de batería" hint="La química define la profundidad de descarga útil">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.battery_type ?? "lithium"}
                onChange={(e) => {
                  const v = e.target.value;
                  set("battery_type", v);
                  set("battery_usable_dod_pct", defaultDodFor(v));
                }}
              >
                {BATTERY_TYPES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </Field>
            <Field label="Nº de baterías en el banco" hint="Cuenta total de baterías (serie × paralelo)">
              <Input type="number" min={1} value={form.battery_count ?? ""} onChange={(e) => set("battery_count", parseInt(e.target.value) || null)} placeholder="ej. 4" />
            </Field>
            <Field label="Voltaje por batería (V)" hint="ej. 12, 24, 48">
              <Input type="number" step="0.1" value={form.battery_voltage_each ?? ""} onChange={(e) => set("battery_voltage_each", parseFloat(e.target.value) || null)} placeholder="ej. 12" />
            </Field>
            <Field label="Capacidad por batería (Ah)" hint="Amperios-hora nominales">
              <Input type="number" step="1" value={form.battery_ah_each ?? ""} onChange={(e) => set("battery_ah_each", parseFloat(e.target.value) || null)} placeholder="ej. 100" />
            </Field>
            <Field label="Profundidad de descarga útil (%)" hint="Litio ~90%, AGM/Gel ~50%, plomo ~50%">
              <Input type="number" min={10} max={100} step={1} value={form.battery_usable_dod_pct ?? ""} onChange={(e) => set("battery_usable_dod_pct", parseFloat(e.target.value) || null)} placeholder="ej. 90" />
            </Field>
          </div>
        </div>
        <Field label="Nº paneles" hint="Opcional">
          <Input type="number" value={form.panel_count ?? ""} onChange={(e) => set("panel_count", parseInt(e.target.value) || null)} placeholder="ej. 12" />
        </Field>
        <Field label="W por panel" hint="Opcional">
          <Input type="number" value={form.panel_watts ?? ""} onChange={(e) => set("panel_watts", parseFloat(e.target.value) || null)} placeholder="ej. 450" />
        </Field>
        <Field label="Azimut (°)" hint="0=N, 90=E, 180=S, 270=O">
          <Input type="number" value={form.azimuth ?? ""} onChange={(e) => set("azimuth", parseFloat(e.target.value) || null)} />
        </Field>
        <Field label="Inclinación (°)" hint="Ángulo respecto al suelo">
          <Input type="number" value={form.tilt ?? ""} onChange={(e) => set("tilt", parseFloat(e.target.value) || null)} />
        </Field>
        <Field label="Pérdidas del sistema (%)" hint="Cableado, suciedad, inversor (~14% típico)">
          <Input type="number" value={form.system_losses_pct ?? ""} onChange={(e) => set("system_losses_pct", parseFloat(e.target.value) || null)} />
        </Field>
        <div className="sm:col-span-2">
          <AddressPicker
            lat={form.latitude}
            lon={form.longitude}
            onPick={(lat, lon) => { set("latitude", +lat.toFixed(4)); set("longitude", +lon.toFixed(4)); }}
            onGeolocate={geolocate}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" /> {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface GeoResult { name: string; country?: string; admin1?: string; admin2?: string; latitude: number; longitude: number }

function AddressPicker({ lat, lon, onPick, onGeolocate }: {
  lat: number | null; lon: number | null;
  onPick: (lat: number, lon: number, label?: string) => void;
  onGeolocate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const debRef = useRef<number | null>(null);

  // Reverse-geocode current lat/lon to display a friendly address.
  useEffect(() => {
    let cancelled = false;
    if (lat == null || lon == null) { setResolvedLabel(null); return; }
    (async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=es`);
        const j = await r.json();
        const top = j.results?.[0];
        if (!cancelled && top) {
          setResolvedLabel([top.name, top.admin1, top.country].filter(Boolean).join(", "));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [lat, lon]);

  function search(q: string) {
    setQuery(q);
    if (debRef.current) window.clearTimeout(debRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=es&format=json`);
        const j = await r.json();
        setResults(j.results ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  function pick(r: GeoResult) {
    onPick(r.latitude, r.longitude, r.name);
    setQuery("");
    setResults([]);
    setResolvedLabel([r.name, r.admin1, r.country].filter(Boolean).join(", "));
    toast.success(`Ubicación: ${r.name}`);
  }

  return (
    <div>
      <Label className="text-xs">Ubicación</Label>
      <p className="mb-2 text-[10px] text-muted-foreground">
        Escribe tu dirección o ciudad (ej: "Chillán, Chile") para una previsión solar precisa.
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-md border bg-background px-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Buscar dirección o ciudad…"
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
          {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button type="button" variant="ghost" size="sm" onClick={onGeolocate} title="Usar mi ubicación actual">
            <MapPin className="h-4 w-4" />
          </Button>
        </div>
        {results.length > 0 && (
          <ul className="max-h-48 overflow-auto rounded-md border bg-card text-sm">
            {results.map((r, i) => (
              <li key={`${r.latitude}-${r.longitude}-${i}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.admin1, r.country].filter(Boolean).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(lat != null && lon != null) && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <MapPin className="h-3.5 w-3.5 text-[var(--solar)]" />
            <span className="font-medium">{resolvedLabel ?? "Ubicación seleccionada"}</span>
            <span className="text-muted-foreground">· {lat.toFixed(4)}, {lon.toFixed(4)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number" step="0.0001" value={lat ?? ""} placeholder="Latitud"
            onChange={(e) => onPick(parseFloat(e.target.value) || 0, lon ?? 0)}
          />
          <Input
            type="number" step="0.0001" value={lon ?? ""} placeholder="Longitud"
            onChange={(e) => onPick(lat ?? 0, parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );
}
