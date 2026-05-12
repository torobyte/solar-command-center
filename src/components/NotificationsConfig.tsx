import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, BellOff, Plus, Trash2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  ensureNotificationPermission, METRIC_OPTIONS,
  type NotificationRule, type NotificationEvent, type Operator, type Severity,
} from "@/lib/notifications";

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

  async function load() {
    setLoading(true);
    const [r, e] = await Promise.all([
      (supabase as any).from("notification_rules").select("*").eq("site_id", siteId).eq("user_id", userId).order("created_at", { ascending: false }),
      (supabase as any).from("notification_events").select("*").eq("site_id", siteId).eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);
    setRules((r.data ?? []) as NotificationRule[]);
    setEvents((e.data ?? []) as NotificationEvent[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [siteId, userId]);

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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notificaciones</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Recibe avisos del navegador / PWA cuando la batería, la red o el inversor cumplan condiciones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {permission === "granted" ? (
              <Badge variant="secondary" className="gap-1"><Bell className="h-3 w-3" /> Permitidas</Badge>
            ) : (
              <Button size="sm" onClick={requestPerm}>
                <BellOff className="mr-2 h-4 w-4" /> Activar permisos
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={testNotification}>Probar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => addPreset({ name: "Batería baja", metric: "battery_capacity", operator: "<", threshold: 20, severity: "warning" })}>+ Batería &lt; 20%</Button>
            <Button size="sm" variant="outline" onClick={() => addPreset({ name: "Batería crítica", metric: "battery_capacity", operator: "<", threshold: 10, severity: "critical", cooldown_minutes: 5 })}>+ Batería &lt; 10%</Button>
            <Button size="sm" variant="outline" onClick={() => addPreset({ name: "Sin red eléctrica", metric: "grid_voltage", operator: "<", threshold: 50, severity: "warning" })}>+ Pérdida de red</Button>
            <Button size="sm" variant="outline" onClick={() => addPreset({ name: "Sobretemperatura inversor", metric: "inverter_temperature", operator: ">", threshold: 70, severity: "critical" })}>+ Temp &gt; 70°C</Button>
            <Button size="sm" variant="outline" onClick={() => addPreset({ name: "Sobrecarga", metric: "load_percent", operator: ">", threshold: 90, severity: "warning" })}>+ Carga &gt; 90%</Button>
            <Button size="sm" variant="outline" onClick={() => addPreset({ name: "Modo batería", metric: "inverter_mode", operator: "changes_to", threshold_text: "B", severity: "info" })}>+ Pasa a modo Batería</Button>
            <Button size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" /> Regla en blanco</Button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : rules.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no tienes reglas. Usa los botones de arriba para empezar.
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((r) => <RuleRow key={r.id} rule={r} onChange={(p) => update(r.id, p)} onDelete={() => remove(r.id)} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Historial reciente</CardTitle>
          {events.some((e) => !e.read_at) && (
            <Button size="sm" variant="ghost" onClick={markAllRead}>Marcar todo como leído</Button>
          )}
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sin notificaciones todavía.</div>
          ) : (
            <ul className="divide-y">
              {events.map((e) => {
                const Sev = SEV_META[e.severity] ?? SEV_META.info;
                const Icon = Sev.icon;
                return (
                  <li key={e.id} className="flex items-start gap-3 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${Sev.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{e.title}</span>
                        {!e.read_at && <Badge variant="default" className="h-4 px-1.5 text-[10px]">Nuevo</Badge>}
                      </div>
                      {e.body && <p className="text-sm text-muted-foreground">{e.body}</p>}
                      <p className="text-xs text-muted-foreground/70">{new Date(e.created_at).toLocaleString()}</p>
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
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
        <Input
          value={rule.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-8 max-w-[200px] text-sm font-medium"
        />
        <Select value={rule.metric} onValueChange={(v) => {
          const m = METRIC_OPTIONS.find((x) => x.value === v);
          const num = m?.numeric !== false;
          onChange({ metric: v, operator: num ? ">" : "==" });
        }}>
          <SelectTrigger className="h-8 w-[200px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {METRIC_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={rule.operator} onValueChange={(v) => onChange({ operator: v as Operator })}>
          <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        {isNumeric ? (
          <Input
            type="number" inputMode="decimal" step="any"
            className="h-8 w-24 text-sm"
            value={rule.threshold ?? ""}
            onChange={(e) => onChange({ threshold: e.target.value === "" ? null : Number(e.target.value) })}
          />
        ) : (
          <Input
            className="h-8 w-28 text-sm font-mono"
            value={rule.threshold_text ?? ""}
            placeholder="B / G / S"
            onChange={(e) => onChange({ threshold_text: e.target.value })}
          />
        )}
        {meta?.unit && <span className="text-xs text-muted-foreground">{meta.unit}</span>}
        <Select value={rule.severity} onValueChange={(v) => onChange({ severity: v as Severity })}>
          <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["info", "warning", "critical"] as Severity[]).map((s) => (
              <SelectItem key={s} value={s}>{SEV_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">Cooldown</Label>
          <Input
            type="number" min={1}
            className="h-8 w-16 text-sm"
            value={rule.cooldown_minutes}
            onChange={(e) => onChange({ cooldown_minutes: Math.max(1, Number(e.target.value) || 1) })}
          />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive ml-auto" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {rule.last_triggered_at && (
        <p className="mt-2 text-xs text-muted-foreground">Último disparo: {new Date(rule.last_triggered_at).toLocaleString()}</p>
      )}
    </div>
  );
}
