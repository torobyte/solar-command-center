import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle, Clock, Send, Loader2 } from "lucide-react";

interface CommandRow {
  id: string;
  command: string;
  payload: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  acked_at: string | null;
}

const COMMAND_LABELS: Record<string, string> = {
  set_output_priority: "Prioridad salida",
  set_charger_priority: "Prioridad carga",
  set_max_ac_charge_current: "Corriente carga red",
  set_max_charge_current: "Corriente carga total",
  set_battery_type: "Tipo batería",
  set_battery_cutoff_voltage: "Voltaje corte batería",
  set_back_to_battery_voltage: "Voltaje volver batería",
  set_back_to_grid_voltage: "Voltaje volver red",
  set_bulk_charge_voltage: "Voltaje bulk",
  set_float_charge_voltage: "Voltaje flotación",
  set_input_range: "Rango voltaje AC",
  set_output_frequency: "Frecuencia salida",
  set_output_voltage: "Voltaje salida",
  set_buzzer_enabled: "Buzzer",
  set_lcd_backlight: "Retroiluminación",
  set_overload_bypass: "Bypass sobrecarga",
  set_alarm_on_interrupt: "Alarma al interrumpir",
  set_auto_restart_overload: "Reinicio sobrecarga",
  set_auto_restart_overtemp: "Reinicio sobre-temp",
  set_lcd_timeout: "Auto apagar LCD",
  set_parallel_mode: "Modo paralelo",
  set_pv_ok_condition: "Condición PV OK",
  set_solar_power_balance: "Balance solar",
};

function summarizePayload(cmd: string, payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  if (typeof payload.amps === "number") return `${payload.amps} A`;
  if (typeof payload.volts === "number") return `${payload.volts} V`;
  if (typeof payload.hz === "string") return `${payload.hz} Hz`;
  if (typeof payload.value === "string") return payload.value;
  if (typeof payload.enabled === "boolean") return payload.enabled ? "ON" : "OFF";
  return "";
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  const s = status.toLowerCase();
  if (s === "pending") return (
    <Badge variant="outline" className="gap-1 border-warning/40 bg-warning/10 text-warning">
      <Clock className="h-3 w-3" /> Pendiente
    </Badge>
  );
  if (s === "sent") return (
    <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
      <Send className="h-3 w-3 animate-pulse" /> Enviando
    </Badge>
  );
  if (s === "done" || s === "ok" || s === "success" || s === "acked") return (
    <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 text-success">
      <CheckCircle2 className="h-3 w-3" /> ACK
    </Badge>
  );
  if (s === "failed" || s === "error" || s === "nak") return (
    <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive" title={error ?? ""}>
      <XCircle className="h-3 w-3" /> NAK
    </Badge>
  );
  return <Badge variant="outline">{status}</Badge>;
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.max(1, Math.floor(d))}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

export function CommandStatusFeed({ siteId, limit = 8, compact = false }: { siteId: string; limit?: number; compact?: boolean }) {
  const [rows, setRows] = useState<CommandRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("device_commands")
        .select("id,command,payload,status,result,error,created_at,sent_at,acked_at")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!cancelled) {
        setRows((data ?? []) as unknown as CommandRow[]);
        setLoading(false);
      }
    }
    load();
    const ch = supabase
      .channel(`cmdfeed-${siteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_commands", filter: `site_id=eq.${siteId}` }, () => load())
      .subscribe();
    // Refresh "time ago" labels
    const t = window.setInterval(() => setRows((r) => [...r]), 10000);
    return () => { cancelled = true; supabase.removeChannel(ch); window.clearInterval(t); };
  }, [siteId, limit]);

  const inFlight = rows.filter((r) => r.status === "pending" || r.status === "sent").length;

  return (
    <div className={`dashboard-card animate-fade-in ${compact ? "p-3" : "p-4 sm:p-5"} h-full flex flex-col`}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Activity className="h-4 w-4" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold sm:text-base">Estado de comandos</h3>
          <p className="text-[11px] text-muted-foreground">Envío en tiempo real al inversor</p>
        </div>
        {inFlight > 0 && (
          <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" /> {inFlight} en curso
          </Badge>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Aún no se ha enviado ningún comando.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-border/60 overflow-auto">
          {rows.map((r) => {
            const label = COMMAND_LABELS[r.command] ?? r.command;
            const value = summarizePayload(r.command, r.payload);
            const reply = (r.result && typeof r.result === "object" && "reply" in r.result) ? String((r.result as Record<string, unknown>).reply) : null;
            return (
              <li key={r.id} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">{label}</span>
                    {value && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{value}</span>}
                    <StatusBadge status={r.status} error={r.error} />
                  </div>
                  {(r.error || reply) && (
                    <p className={`mt-0.5 truncate font-mono text-[10px] ${r.error ? "text-destructive" : "text-muted-foreground"}`}>
                      {r.error ?? reply}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {timeAgo(r.acked_at ?? r.sent_at ?? r.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
