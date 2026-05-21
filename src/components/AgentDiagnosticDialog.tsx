import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AgentFetcher } from "@/routes/local";

interface SystemdUnit { name: string; active: string; enabled: string; error?: string }
interface StatusPayload {
  agent?: { started_at?: string; version?: string; hardware_id?: string; board?: string; uptime_seconds?: number };
  transport?: { connected?: boolean; port?: string | null; kind?: string | null; preferred?: string | null; candidates?: string[]; usb_devices?: string[] };
  data?: { last_sample_at?: string | null; read_count?: number; error_count?: number; latest?: Record<string, number | string | null> };
  errors?: { last?: string | null; last_at?: string | null };
  systemd?: SystemdUnit[];
  pairing?: { code?: string | null; linked?: boolean };
  agent_time?: string;
}

function StatusPill({ state }: { state: string }) {
  const ok = state === "active" || state === "enabled";
  const bad = state === "failed" || state === "inactive";
  const Icon = ok ? CheckCircle2 : bad ? XCircle : AlertTriangle;
  const tone = ok ? "bg-success/15 text-success" : bad ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      <Icon className="h-3 w-3" />{state}
    </span>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{k}</span>
      <span className="text-xs font-mono text-right break-all max-w-[60%]">{v ?? "—"}</span>
    </div>
  );
}

export function AgentDiagnosticDialog({
  open, onOpenChange, agentFetch,
}: { open: boolean; onOpenChange: (v: boolean) => void; agentFetch: AgentFetcher }) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    const r = await agentFetch("/api/status");
    setLoading(false);
    if (r.ok) setData((r.json as StatusPayload) ?? null);
    else setErr(r.error || `HTTP ${r.status}`);
  }, [agentFetch]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Diagnóstico del agente
          </DialogTitle>
          <DialogDescription>Estado en vivo del equipo local — se actualiza cada 5 s.</DialogDescription>
        </DialogHeader>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {err}
          </div>
        )}

        {!data && !err && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <section className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agente</h3>
              <Row k="Versión" v={data.agent?.version} />
              <Row k="Board" v={data.agent?.board} />
              <Row k="Hardware ID" v={data.agent?.hardware_id} />
              <Row k="Arranque" v={data.agent?.started_at} />
              <Row k="Uptime" v={data.agent?.uptime_seconds ? `${Math.round(data.agent.uptime_seconds / 60)} min` : null} />
            </section>

            <section className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transporte (inversor)</h3>
              <Row k="Conectado" v={data.transport?.connected ? "sí" : "no"} />
              <Row k="Puerto" v={data.transport?.port} />
              <Row k="Tipo" v={data.transport?.kind} />
              <Row k="Preferido" v={data.transport?.preferred} />
              <Row k="Candidatos" v={(data.transport?.candidates || []).join(", ") || "—"} />
            </section>

            <section className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos</h3>
              <Row k="Última muestra" v={data.data?.last_sample_at} />
              <Row k="Lecturas OK" v={data.data?.read_count} />
              <Row k="Errores" v={data.data?.error_count} />
              <Row k="SOC" v={data.data?.latest?.battery_capacity != null ? `${data.data.latest.battery_capacity}%` : null} />
              <Row k="PV" v={data.data?.latest?.pv_input_power != null ? `${data.data.latest.pv_input_power} W` : null} />
              <Row k="Carga" v={data.data?.latest?.ac_output_active_power != null ? `${data.data.latest.ac_output_active_power} W` : null} />
            </section>

            <section className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Errores recientes</h3>
              <Row k="Último error" v={data.errors?.last || "ninguno"} />
              <Row k="Cuándo" v={data.errors?.last_at} />
            </section>

            <section className="rounded-lg border bg-card p-3 md:col-span-2">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Servicios (systemd)</h3>
              <div className="space-y-1.5">
                {(data.systemd || []).map((u) => (
                  <div key={u.name} className="flex items-center justify-between text-xs">
                    <span className="font-mono">{u.name}</span>
                    <div className="flex items-center gap-1.5">
                      <StatusPill state={u.active} />
                      <StatusPill state={u.enabled} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Actualizar
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
