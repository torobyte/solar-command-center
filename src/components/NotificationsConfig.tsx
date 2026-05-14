import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing, BellOff, Plus, Trash2, AlertTriangle, AlertCircle, Info, Smartphone, Zap, ShieldCheck, History } from "lucide-react";
import { toast } from "sonner";
import { RuleListSkeleton } from "@/components/LoadingStates";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ensureNotificationPermission, METRIC_OPTIONS,
  type NotificationRule, type NotificationEvent, type Operator, type Severity,
} from "@/lib/notifications";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, registerServiceWorker } from "@/lib/push";

const NUMERIC_OPS: { value: Operator; label: string }[] = [
  { value: "<", label: "Menor que" },
  { value: "<=", label: "Menor o igual" },
  { value: ">", label: "Mayor que" },
  { value: ">=", label: "Mayor o igual" },
  { value: "==", label: "Igual" },
  { value: "!=", label: "Distinto" },
];
const TEXT_OPS: { value: Operator; label: string }[] = [
  { value: "==", label: "Es igual a" },
  { value: "!=", label: "Es distinto a" },
  { value: "changes_to", label: "Cambia a" },
];

const SEV_META: Record<Severity, { label: string; icon: typeof Info; color: string }> = {
  info: { label: "Info", icon: Info, color: "text-blue-500" },
  warning: { label: "Advertencia", icon: AlertTriangle, color: "text-amber-500" },
  critical: { label: "Crítica", icon: AlertCircle, color: "text-red-500" },
};

export function NotificationsConfig({ siteId, userId }: { siteId: string; userId: string }) {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"
  );
  const [loading, setLoading] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [r, e, ps] = await Promise.all([
      (supabase as any).from("notification_rules").select("*").eq("site_id", siteId).eq("user_id", userId).order("created_at", { ascending: false }),
      (supabase as any).from("notification_events").select("*").eq("site_id", siteId).eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      (supabase as any).from("push_subscriptions").select("id").eq("user_id", userId).limit(1),
    ]);
    setRules((r.data ?? []) as NotificationRule[]);
    setEvents((e.data ?? []) as NotificationEvent[]);
    setPushOn((ps.data?.length ?? 0) > 0);
    setLoading(false);
  }
  useEffect(() => { load(); registerServiceWorker(); }, [siteId, userId]);

  async function togglePush() {
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush(userId);
        setPushOn(false);
        toast.success("Notificaciones push desactivadas");
      } else {
        const ok = await subscribeToPush(userId);
        if (ok) { setPushOn(true); toast.success("Push activado: recibirás alertas con la app cerrada"); }
        else toast.error("No se pudo activar push (permisos o navegador no soportado)");
      }
    } finally { setPushBusy(false); }
  }

  async function requestPerm() {
    const p = await ensureNotificationPermission();
    setPermission(p);
    if (p === "granted") toast.success("Notificaciones activadas");
    else if (p === "denied") toast.error("Permiso denegado por el navegador");
  }

  async function addPreset(preset: Partial<NotificationRule> & { name: string; metric: string; operator: Operator }) {
    const payload = {
      user_id: userId, site_id: siteId,
      name: preset.name, metric: preset.metric, operator: preset.operator,
      threshold: preset.threshold ?? null, threshold_text: preset.threshold_text ?? null,
      severity: preset.severity ?? "warning",
      channels: ["browser"],
      cooldown_minutes: preset.cooldown_minutes ?? 15,
      enabled: true,
    };
    const { error } = await (supabase as any).from("notification_rules").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Regla creada");
    load();
  }

  async function addBlank() {
    addPreset({ name: "Nueva alerta", metric: "battery_capacity", operator: "<", threshold: 20, severity: "warning" });
  }

  async function update(id: string, patch: Partial<NotificationRule>) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("notification_rules").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta regla?")) return;
    const { error } = await (supabase as any).from("notification_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRules((rs) => rs.filter((r) => r.id !== id));
  }

  async function markAllRead() {
    await (supabase as any).from("notification_events").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    load();
  }

  async function testNotification() {
    const p = await ensureNotificationPermission();
    setPermission(p);
    if (p !== "granted") return toast.error("Activa los permisos primero");
    new Notification("SolarOps · Prueba", { body: "Las notificaciones funcionan correctamente.", icon: "/icon.svg" });
  }

  return (
    <div className="space-y-3 sm:space-y-4 animate-fade-up">
      <Card className="overflow-hidden rounded-xl border shadow-sm">
        <CardHeader className="flex flex-col gap-2.5 border-b bg-gradient-to-br from-accent/5 to-transparent p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent/25 to-accent/5 text-accent ring-1 ring-accent/20">
              <BellRing className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm sm:text-base tracking-tight">Notificaciones</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Avisos cuando la batería, la red o el inversor cumplan condiciones.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {permission === "granted" ? (
              <Badge variant="secondary" className="h-7 gap-1 rounded-full px-2"><ShieldCheck className="h-3 w-3" strokeWidth={2.4} /> Permitidas</Badge>
            ) : (
              <Button size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={requestPerm}>
                <BellOff className="mr-1 h-3.5 w-3.5" strokeWidth={2.2} /> Activar
              </Button>
            )}
            {isPushSupported() && (
              <Button size="sm" variant={pushOn ? "secondary" : "default"} className="h-7 rounded-full px-2.5 text-xs" onClick={togglePush} disabled={pushBusy}>
                <Smartphone className="mr-1 h-3.5 w-3.5" strokeWidth={2.2} />
                {pushOn ? "Push activo" : "Activar push"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs" onClick={testNotification}>
              <Zap className="mr-1 h-3 w-3" strokeWidth={2.4} /> Probar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { l: "Batería < 20%", o: () => addPreset({ name: "Batería baja", metric: "battery_capacity", operator: "<", threshold: 20, severity: "warning" }) },
              { l: "Batería < 10%", o: () => addPreset({ name: "Batería crítica", metric: "battery_capacity", operator: "<", threshold: 10, severity: "critical", cooldown_minutes: 5 }) },
              { l: "Pérdida de red", o: () => addPreset({ name: "Sin red eléctrica", metric: "grid_voltage", operator: "<", threshold: 50, severity: "warning" }) },
              { l: "Temp > 70°C", o: () => addPreset({ name: "Sobretemperatura inversor", metric: "inverter_temperature", operator: ">", threshold: 70, severity: "critical" }) },
              { l: "Carga > 90%", o: () => addPreset({ name: "Sobrecarga", metric: "load_percent", operator: ">", threshold: 90, severity: "warning" }) },
              { l: "Pasa a Batería", o: () => addPreset({ name: "Modo batería", metric: "inverter_mode", operator: "changes_to", threshold_text: "B", severity: "info" }) },
            ].map((b) => (
              <Button key={b.l} size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs" onClick={b.o}>
                <Plus className="mr-0.5 h-3 w-3" strokeWidth={2.6} />{b.l}
              </Button>
            ))}
            <Button size="sm" className="h-7 rounded-full px-2.5 text-xs shadow-glow" onClick={addBlank}>
              <Plus className="mr-0.5 h-3.5 w-3.5" strokeWidth={2.4} /> Regla en blanco
            </Button>
          </div>

          {loading ? (
            <RuleListSkeleton rows={3} />
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center animate-fade-in">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <BellOff className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Aún no tienes reglas. Usa los botones de arriba para empezar.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => <RuleRow key={r.id} rule={r} onChange={(p) => update(r.id, p)} onDelete={() => remove(r.id)} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-xl border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b p-3 sm:p-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.2} /> Historial reciente
          </CardTitle>
          {events.some((e) => !e.read_at) && (
            <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-xs" onClick={markAllRead}>Marcar leído</Button>
          )}
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">Sin notificaciones todavía.</div>
          ) : (
            <ul className="divide-y">
              {events.map((e) => {
                const Sev = SEV_META[e.severity] ?? SEV_META.info;
                const Icon = Sev.icon;
                return (
                  <li key={e.id} className="flex items-start gap-2.5 py-2 animate-fade-in">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${e.severity === "critical" ? "bg-red-500/10" : e.severity === "warning" ? "bg-amber-500/10" : "bg-blue-500/10"}`}>
                      <Icon className={`h-3.5 w-3.5 ${Sev.color}`} strokeWidth={2.2} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{e.title}</span>
                        {!e.read_at && <Badge variant="default" className="h-4 rounded-full px-1.5 text-[10px]">Nuevo</Badge>}
                      </div>
                      {e.body && <p className="text-xs text-muted-foreground line-clamp-2">{e.body}</p>}
                      <p className="text-[10px] text-muted-foreground/70">{new Date(e.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({ rule, onChange, onDelete }: { rule: NotificationRule; onChange: (p: Partial<NotificationRule>) => void; onDelete: () => void }) {
  const meta = METRIC_OPTIONS.find((m) => m.value === rule.metric);
  const isNumeric = meta?.numeric !== false;
  const ops = isNumeric ? NUMERIC_OPS : TEXT_OPS;
  return (
    <div className="rounded-lg border bg-card p-2 sm:p-2.5">
      <div className="flex items-center gap-2">
        <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
        <Input
          value={rule.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-8 flex-1 text-sm font-medium"
        />
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <div className="space-y-0.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Métrica</Label>
          <Select value={rule.metric} onValueChange={(v) => {
            const m = METRIC_OPTIONS.find((x) => x.value === v);
            const num = m?.numeric !== false;
            onChange({ metric: v, operator: num ? ">" : "==" });
          }}>
            <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Operador</Label>
          <Select value={rule.operator} onValueChange={(v) => onChange({ operator: v as Operator })}>
            <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Umbral{meta?.unit ? ` (${meta.unit})` : ""}
          </Label>
          {isNumeric ? (
            <Input
              type="number" inputMode="decimal" step="any"
              className="h-8 w-full text-xs"
              value={rule.threshold ?? ""}
              onChange={(e) => onChange({ threshold: e.target.value === "" ? null : Number(e.target.value) })}
            />
          ) : (
            <Input
              className="h-8 w-full text-xs font-mono"
              value={rule.threshold_text ?? ""}
              placeholder="B / G / S"
              onChange={(e) => onChange({ threshold_text: e.target.value })}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Severidad</Label>
            <Select value={rule.severity} onValueChange={(v) => onChange({ severity: v as Severity })}>
              <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["info", "warning", "critical"] as Severity[]).map((s) => (
                  <SelectItem key={s} value={s}>{SEV_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cooldown</Label>
            <Input
              type="number" min={1}
              className="h-8 w-full text-xs"
              value={rule.cooldown_minutes}
              onChange={(e) => onChange({ cooldown_minutes: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
        </div>
      </div>
      {rule.last_triggered_at && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Último disparo: {new Date(rule.last_triggered_at).toLocaleString()}</p>
      )}
    </div>
  );
}
