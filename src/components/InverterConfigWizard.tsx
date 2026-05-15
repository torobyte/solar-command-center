import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Zap, BatteryCharging, Settings, Volume2, Activity,
  Sun, Plug, ChevronLeft, ChevronRight, Check, AlertTriangle,
} from "lucide-react";

type SelectOpt = { v: string; l: string; desc?: string };

interface SelectField {
  kind: "select";
  key: string;
  label: string;
  description?: string;
  command: string;
  payloadKey: string;
  options: SelectOpt[];
  defaultValue: string;
}
interface NumberField {
  kind: "number";
  key: string;
  label: string;
  description?: string;
  command: string;
  payloadKey: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
}
interface ToggleField {
  kind: "toggle";
  key: string;
  label: string;
  description?: string;
  command: string;
  defaultValue: boolean;
}
type Field = SelectField | NumberField | ToggleField;

interface Step {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Zap;
  fields: Field[];
}

const STEPS: Step[] = [
  {
    id: "modes",
    title: "Modos de operación",
    subtitle: "Define cómo prioriza la energía el inversor.",
    icon: Activity,
    fields: [
      {
        kind: "select", key: "pop", label: "Prioridad de salida (POP)",
        description: "De dónde toma la energía para alimentar las cargas.",
        command: "set_output_priority", payloadKey: "value", defaultValue: "02",
        options: [
          { v: "00", l: "Utility first", desc: "Red → Solar → Batería" },
          { v: "01", l: "Solar first", desc: "Solar → Red → Batería" },
          { v: "02", l: "SBU", desc: "Solar → Batería → Red" },
        ],
      },
      {
        kind: "select", key: "pcp", label: "Prioridad de carga (PCP)",
        description: "Qué fuente carga la batería.",
        command: "set_charger_priority", payloadKey: "value", defaultValue: "03",
        options: [
          { v: "00", l: "Utility first" },
          { v: "01", l: "Solar first" },
          { v: "02", l: "Solar y Utility" },
          { v: "03", l: "Solo Solar" },
        ],
      },
      {
        kind: "select", key: "range", label: "Rango voltaje AC entrada",
        description: "Tolerancia del voltaje de la red eléctrica.",
        command: "set_input_range", payloadKey: "value", defaultValue: "appliance",
        options: [
          { v: "appliance", l: "Appliance (170–280 V)" },
          { v: "ups", l: "UPS (90–280 V)" },
        ],
      },
      {
        kind: "select", key: "freq", label: "Frecuencia de salida",
        command: "set_output_frequency", payloadKey: "hz", defaultValue: "50",
        options: [
          { v: "50", l: "50 Hz" },
          { v: "60", l: "60 Hz" },
        ],
      },
      {
        kind: "select", key: "voltage", label: "Voltaje de salida AC",
        command: "set_output_voltage", payloadKey: "volts", defaultValue: "230",
        options: [
          { v: "220", l: "220 V" },
          { v: "230", l: "230 V" },
          { v: "240", l: "240 V" },
        ],
      },
    ],
  },
  {
    id: "battery",
    title: "Batería",
    subtitle: "Tipo y umbrales de protección.",
    icon: BatteryCharging,
    fields: [
      {
        kind: "select", key: "btype", label: "Tipo de batería",
        command: "set_battery_type", payloadKey: "value", defaultValue: "USE",
        options: [
          { v: "AGM", l: "AGM" },
          { v: "FLD", l: "Inundada (Flooded)" },
          { v: "USE", l: "Usuario (User)" },
          { v: "LIB", l: "Litio (LiFePO4)" },
        ],
      },
      {
        kind: "number", key: "back_bat", label: "Voltaje volver a batería",
        description: "Cuando la red carga, vuelve a usar batería al alcanzar este voltaje.",
        command: "set_back_to_battery_voltage", payloadKey: "volts",
        min: 44, max: 51, step: 0.1, unit: "V", defaultValue: 48,
      },
      {
        kind: "number", key: "back_grid", label: "Voltaje volver a red",
        description: "Si la batería baja a este voltaje, salta a red.",
        command: "set_back_to_grid_voltage", payloadKey: "volts",
        min: 42, max: 51, step: 0.1, unit: "V", defaultValue: 46,
      },
      {
        kind: "number", key: "cutoff", label: "Voltaje de corte",
        description: "Apaga el inversor por bajo voltaje.",
        command: "set_battery_cutoff_voltage", payloadKey: "volts",
        min: 40, max: 48, step: 0.1, unit: "V", defaultValue: 42,
      },
      {
        kind: "number", key: "bulk", label: "Voltaje carga bulk (CV)",
        command: "set_bulk_charge_voltage", payloadKey: "volts",
        min: 48, max: 61, step: 0.1, unit: "V", defaultValue: 56.4,
      },
      {
        kind: "number", key: "float", label: "Voltaje flotación",
        command: "set_float_charge_voltage", payloadKey: "volts",
        min: 48, max: 58, step: 0.1, unit: "V", defaultValue: 54,
      },
    ],
  },
  {
    id: "charging",
    title: "Corrientes de carga",
    subtitle: "Limita cuánta corriente entra a las baterías.",
    icon: Plug,
    fields: [
      {
        kind: "number", key: "max_chg", label: "Corriente máx. de carga total",
        description: "Suma de Solar + Red.",
        command: "set_max_charge_current", payloadKey: "amps",
        min: 10, max: 120, step: 10, unit: "A", defaultValue: 60,
      },
      {
        kind: "number", key: "max_ac_chg", label: "Corriente máx. carga desde Red",
        command: "set_max_ac_charge_current", payloadKey: "amps",
        min: 2, max: 60, step: 2, unit: "A", defaultValue: 20,
      },
    ],
  },
  {
    id: "alerts",
    title: "Alertas y display",
    subtitle: "Buzzer, retroiluminación y reinicios automáticos.",
    icon: Volume2,
    fields: [
      { kind: "toggle", key: "buzzer", label: "Buzzer (alarma sonora)", command: "set_buzzer_enabled", defaultValue: true },
      { kind: "toggle", key: "overload_bypass", label: "Bypass por sobrecarga", command: "set_overload_bypass", defaultValue: false },
      { kind: "toggle", key: "backlight", label: "Retroiluminación LCD", command: "set_lcd_backlight", defaultValue: true },
      { kind: "toggle", key: "alarm_interrupt", label: "Alarma al interrumpir red", command: "set_alarm_on_interrupt", defaultValue: true },
      { kind: "toggle", key: "auto_restart_overload", label: "Reinicio auto por sobrecarga", command: "set_auto_restart_overload", defaultValue: false },
      { kind: "toggle", key: "auto_restart_overtemp", label: "Reinicio auto por sobre-temperatura", command: "set_auto_restart_overtemp", defaultValue: false },
      { kind: "toggle", key: "lcd_timeout", label: "Auto apagar LCD tras 1 min", command: "set_lcd_timeout", defaultValue: false },
    ],
  },
  {
    id: "advanced",
    title: "Avanzado",
    subtitle: "Solo para usuarios experimentados.",
    icon: Settings,
    fields: [
      {
        kind: "select", key: "parallel", label: "Modo paralelo",
        description: "Configuración para instalaciones con múltiples inversores.",
        command: "set_parallel_mode", payloadKey: "value", defaultValue: "single",
        options: [
          { v: "single", l: "Single (un inversor)" },
          { v: "parallel", l: "Parallel" },
          { v: "L1", l: "Trifásico — L1" },
          { v: "L2", l: "Trifásico — L2" },
          { v: "L3", l: "Trifásico — L3" },
        ],
      },
      {
        kind: "select", key: "pv_ok", label: "Condición PV OK",
        description: "Cuándo se considera que la fuente PV es válida.",
        command: "set_pv_ok_condition", payloadKey: "value", defaultValue: "any",
        options: [
          { v: "any", l: "Si cualquier inversor tiene PV" },
          { v: "all", l: "Solo si todos tienen PV" },
        ],
      },
      {
        kind: "select", key: "solar_power_balance", label: "Balance de potencia solar",
        command: "set_solar_power_balance", payloadKey: "value", defaultValue: "max_charge",
        options: [
          { v: "max_charge", l: "PV = corriente máx de carga" },
          { v: "max_load", l: "PV = corriente de carga + load" },
        ],
      },
    ],
  },
];

export function InverterConfigWizard({ siteId, agentBase }: { siteId: string; agentBase?: string }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const v: Record<string, string | number | boolean> = {};
    for (const s of STEPS) for (const f of s.fields) v[f.key] = f.defaultValue;
    return v;
  });
  const [pending, setPending] = useState<string | null>(null);

  const current = STEPS[step];
  const Icon = current.icon;

  async function postLocal(rows: { command: string; payload: Record<string, unknown> }[]) {
    const r = await fetch(`${agentBase}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: rows }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `HTTP ${r.status}`);
    }
  }

  async function applyField(field: Field) {
    setPending(field.key);
    try {
      let payload: Record<string, unknown> = {};
      if (field.kind === "select" || field.kind === "number") {
        payload = { [field.payloadKey]: values[field.key] };
      } else {
        payload = { enabled: !!values[field.key] };
      }
      if (agentBase) {
        await postLocal([{ command: field.command, payload }]);
        toast.success(`${field.label} enviado al inversor`);
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { toast.error("Sesión expirada"); return; }
        const { error } = await supabase.from("device_commands").insert({
          site_id: siteId, command: field.command, payload: payload as never, created_by: u.user.id,
        });
        if (error) toast.error(error.message);
        else toast.success(`${field.label} encolado`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  async function applyAll() {
    setPending("__all__");
    try {
      const rows = current.fields.map((f) => {
        let payload: Record<string, unknown>;
        if (f.kind === "toggle") payload = { enabled: !!values[f.key] };
        else payload = { [f.payloadKey]: values[f.key] };
        return { command: f.command, payload };
      });
      if (agentBase) {
        await postLocal(rows);
        toast.success(`${rows.length} comando(s) enviados`);
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { toast.error("Sesión expirada"); return; }
        const { error } = await supabase.from("device_commands").insert(
          rows.map((r) => ({ site_id: siteId, command: r.command, payload: r.payload as never, created_by: u.user!.id }))
        );
        if (error) toast.error(error.message);
        else toast.success(`${rows.length} comando(s) encolado(s)`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }



  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const SIcon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : done
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                active ? "bg-primary-foreground/20" : done ? "bg-success/20" : "bg-muted"
              }`}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <SIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent border-b">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">{current.title}</CardTitle>
              <CardDescription className="text-xs sm:text-sm">{current.subtitle}</CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0">Paso {step + 1} de {STEPS.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {current.fields.map((field) => (
              <div key={field.key} className="rounded-xl border bg-card/50 p-3 sm:p-4 transition-colors hover:border-primary/40">
                <div className="mb-2">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  {field.description && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{field.description}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {field.kind === "select" && (
                    <select
                      value={String(values[field.key])}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {field.options.map((o) => (
                        <option key={o.v} value={o.v}>{o.l}{o.desc ? ` — ${o.desc}` : ""}</option>
                      ))}
                    </select>
                  )}
                  {field.kind === "number" && (
                    <div className="flex flex-1 items-center gap-1.5">
                      <Input
                        type="number"
                        min={field.min} max={field.max} step={field.step}
                        value={Number(values[field.key])}
                        onChange={(e) => setValues((v) => ({ ...v, [field.key]: parseFloat(e.target.value) || field.defaultValue }))}
                        className="h-9"
                      />
                      <span className="text-xs text-muted-foreground w-8">{field.unit}</span>
                    </div>
                  )}
                  {field.kind === "toggle" && (
                    <label className="flex flex-1 items-center gap-2 cursor-pointer rounded-md border bg-background px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!values[field.key]}
                        onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">{values[field.key] ? "Habilitado" : "Deshabilitado"}</span>
                    </label>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyField(field)}
                    disabled={pending === field.key}
                    className="sm:w-auto"
                  >
                    {pending === field.key ? "..." : "Aplicar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            Los cambios se envían como comandos al equipo local. La aplicación al inversor puede tardar unos segundos.
          </div>
        </CardContent>
      </Card>

      {/* Footer nav */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <Button variant="outline" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <Button onClick={applyAll} disabled={pending !== null}>
          <Zap className="h-4 w-4 mr-1.5" />
          {pending === "__all__" ? "Enviando..." : `Aplicar todo este paso (${current.fields.length})`}
        </Button>
      </div>
    </div>
  );
}
