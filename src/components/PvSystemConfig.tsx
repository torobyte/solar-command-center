import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sun, Save, Wand2 } from "lucide-react";

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
}

export function usePvConfig(siteId: string) {
  const [config, setConfig] = useState<PvConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
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
        <Field label="Capacidad batería (kWh)" hint="Capacidad útil del banco">
          <Input type="number" step="0.1" value={form.battery_kwh ?? ""} onChange={(e) => set("battery_kwh", parseFloat(e.target.value) || null)} placeholder="ej. 4.8" />
        </Field>
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
        <Field label="Ubicación" hint="Latitud / Longitud para previsión solar">
          <div className="flex gap-2">
            <Input type="number" step="0.0001" value={form.latitude ?? ""} onChange={(e) => set("latitude", parseFloat(e.target.value) || null)} placeholder="Lat" />
            <Input type="number" step="0.0001" value={form.longitude ?? ""} onChange={(e) => set("longitude", parseFloat(e.target.value) || null)} placeholder="Lon" />
            <Button type="button" variant="outline" size="sm" onClick={geolocate}>📍</Button>
          </div>
        </Field>
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
