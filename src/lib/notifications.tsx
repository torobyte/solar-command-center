import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Severity = "info" | "warning" | "critical";
export type Operator = "<" | "<=" | ">" | ">=" | "==" | "!=" | "changes_to";

export interface NotificationRule {
  id: string;
  user_id: string;
  site_id: string;
  name: string;
  metric: string;
  operator: Operator;
  threshold: number | null;
  threshold_text: string | null;
  severity: Severity;
  channels: string[];
  cooldown_minutes: number;
  enabled: boolean;
  last_triggered_at: string | null;
}

export interface NotificationEvent {
  id: string;
  user_id: string;
  site_id: string;
  rule_id: string | null;
  title: string;
  body: string | null;
  severity: Severity;
  metric: string | null;
  value: number | null;
  value_text: string | null;
  read_at: string | null;
  created_at: string;
}

export const METRIC_OPTIONS: { value: string; label: string; unit?: string; numeric?: boolean }[] = [
  { value: "battery_capacity", label: "Batería SOC (%)", unit: "%", numeric: true },
  { value: "battery_voltage", label: "Voltaje batería", unit: "V", numeric: true },
  { value: "pv_input_power", label: "Potencia PV", unit: "W", numeric: true },
  { value: "ac_output_active_power", label: "Carga (W)", unit: "W", numeric: true },
  { value: "load_percent", label: "Carga (%)", unit: "%", numeric: true },
  { value: "grid_voltage", label: "Voltaje red", unit: "V", numeric: true },
  { value: "grid_frequency", label: "Frecuencia red", unit: "Hz", numeric: true },
  { value: "ac_output_voltage", label: "Voltaje salida AC", unit: "V", numeric: true },
  { value: "inverter_temperature", label: "Temperatura inversor", unit: "°C", numeric: true },
  { value: "inverter_mode", label: "Modo inversor (texto)", numeric: false },
  { value: "device_status", label: "Estado dispositivo (texto)", numeric: false },
  { value: "offline_minutes", label: "Sitio offline (minutos)", unit: "min", numeric: true },
];

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

function evalRule(r: NotificationRule, value: number | string | null): boolean {
  if (value === null || value === undefined) return false;
  const meta = METRIC_OPTIONS.find((m) => m.value === r.metric);
  const numeric = meta?.numeric !== false;
  if (numeric) {
    const v = Number(value);
    if (Number.isNaN(v)) return false;
    const t = Number(r.threshold ?? 0);
    switch (r.operator) {
      case "<": return v < t;
      case "<=": return v <= t;
      case ">": return v > t;
      case ">=": return v >= t;
      case "==": return v === t;
      case "!=": return v !== t;
      default: return false;
    }
  }
  const v = String(value);
  const t = String(r.threshold_text ?? "");
  if (r.operator === "==" || r.operator === "changes_to") return v === t;
  if (r.operator === "!=") return v !== t;
  return false;
}

function fireBrowserNotification(title: string, body: string, severity: Severity) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const icon = "/icon.svg";
    const n = new Notification(title, { body, icon, badge: icon, tag: `solarops-${severity}` });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    /* ignore */
  }
}

/**
 * Hook that watches incoming telemetry for a site and triggers
 * notifications matching the user's rules.
 */
export function useNotificationWatcher(siteId: string | undefined, userId: string | undefined) {
  const rulesRef = useRef<NotificationRule[]>([]);
  const lastFiredRef = useRef<Record<string, number>>({});
  const lastValuesRef = useRef<Record<string, number | string | null>>({});
  // Edge-trigger state: tracks whether each rule's condition was matching
  // on the previous sample. We only fire on transitions FALSE -> TRUE
  // so a sustained alert doesn't repeat every poll cycle.
  // Initialized to `null` (unknown) so the first sample seeds state
  // without firing — even if the condition is already true.
  const matchedRef = useRef<Record<string, boolean | null>>({});

  const reloadRules = useCallback(async () => {
    if (!siteId || !userId) return;
    const { data } = await (supabase as any)
      .from("notification_rules")
      .select("*")
      .eq("site_id", siteId)
      .eq("user_id", userId)
      .eq("enabled", true);
    rulesRef.current = (data ?? []) as NotificationRule[];
  }, [siteId, userId]);

  useEffect(() => { reloadRules(); }, [reloadRules]);

  useEffect(() => {
    if (!siteId || !userId) return;
    const channel = supabase
      .channel(`telemetry-notif-${siteId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_samples", filter: `site_id=eq.${siteId}` }, (payload) => {
        const sample = payload.new as Record<string, any>;
        evaluateAgainstRules(sample);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };

    function evaluateAgainstRules(sample: Record<string, any>) {
      const rules = rulesRef.current;
      if (!rules.length) return;
      const now = Date.now();
      for (const rule of rules) {
        const raw = sample[rule.metric];
        if (raw === undefined || raw === null) continue;

        const matches = evalRule(rule, raw);
        const prevMatched = matchedRef.current[rule.id];
        const prevValue = lastValuesRef.current[rule.metric];
        lastValuesRef.current[rule.metric] = raw;

        // First sample for this rule: seed state without firing.
        if (prevMatched === undefined || prevMatched === null) {
          matchedRef.current[rule.id] = matches;
          continue;
        }

        // Edge-trigger:
        //  - 'changes_to' requires the VALUE itself to transition this tick.
        //  - everything else fires only on FALSE -> TRUE transitions.
        let shouldFire = false;
        if (rule.operator === "changes_to") {
          shouldFire = matches && prevValue !== raw;
        } else {
          shouldFire = matches && !prevMatched;
        }
        matchedRef.current[rule.id] = matches;

        if (!shouldFire) continue;

        // Defensive cooldown on top of edge-trigger (avoids double-fire from
        // duplicated telemetry inserts within the same second).
        const cdMs = Math.max((rule.cooldown_minutes || 0) * 60 * 1000, 5_000);
        const last = lastFiredRef.current[rule.id] ?? 0;
        if (now - last < cdMs) continue;

        const meta = METRIC_OPTIONS.find((m) => m.value === rule.metric);
        const valueLabel = meta?.numeric === false ? String(raw) : `${raw}${meta?.unit ?? ""}`;
        const title = rule.name || `Alerta: ${meta?.label ?? rule.metric}`;
        const body = `${meta?.label ?? rule.metric}: ${valueLabel} (${rule.operator} ${rule.threshold ?? rule.threshold_text ?? ""})`;

        lastFiredRef.current[rule.id] = now;
        fireBrowserNotification(title, body, rule.severity);

        const numericVal = meta?.numeric === false ? null : Number(raw);
        (supabase as any).from("notification_events").insert({
          user_id: userId, site_id: siteId, rule_id: rule.id,
          title, body, severity: rule.severity,
          metric: rule.metric,
          value: Number.isFinite(numericVal) ? numericVal : null,
          value_text: meta?.numeric === false ? String(raw) : null,
        }).then(() => {});
        (supabase as any).from("notification_rules")
          .update({ last_triggered_at: new Date().toISOString() })
          .eq("id", rule.id).then(() => {});
      }
    }
  }, [siteId, userId]);

  return { reloadRules };
}

export function useUnreadNotifications(userId: string | undefined) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const load = async () => {
      const { count: c } = await (supabase as any)
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (mounted) setCount(c ?? 0);
    };
    load();
    const ch = supabase.channel(`notif-count-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_events", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [userId]);
  return count;
}
