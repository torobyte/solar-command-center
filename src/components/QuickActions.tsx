import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap, Power, BatteryCharging, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* -------------------- Config (per site, local) -------------------- */

export interface QuickActionsConfig {
  amps: boolean;
  outputPriority: boolean;
  chargerPriority: boolean;
  buzzer: boolean;
}
const DEFAULT_CONFIG: QuickActionsConfig = {
  amps: true, outputPriority: true, chargerPriority: true, buzzer: true,
};
const CFG_KEY = (siteId: string) => `quickactions.cfg.${siteId}`;

export function useQuickActionsConfig(siteId: string) {
  const [config, setConfigState] = useState<QuickActionsConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CFG_KEY(siteId));
      if (raw) setConfigState({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, [siteId]);
  function setConfig(next: Partial<QuickActionsConfig>) {
    setConfigState((prev) => {
      const merged = { ...prev, ...next };
      try { localStorage.setItem(CFG_KEY(siteId), JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
  }
  return { config, setConfig };
}

/* -------------------- QuickActions card -------------------- */

interface QuickActionsProps {
  siteId: string;
  agentBase?: string | null;
  config?: QuickActionsConfig;
}

const AC_AMPS = [2, 10, 20, 30] as const;
const POP_OPTS = [
  { v: "02", l: "SBU" },
  { v: "01", l: "Solar" },
  { v: "00", l: "Utility" },
] as const;
const PCP_OPTS = [
  { v: "03", l: "Solo Solar" },
  { v: "00", l: "Utility" },
  { v: "02", l: "Solar+Utility" },
] as const;

interface CurrentValues {
  amps?: number;
  outputPriority?: string;
  chargerPriority?: string;
  buzzerEnabled?: boolean;
}

interface PendingConfirm {
  command: string;
  payload: Record<string, unknown>;
  key: string;
  title: string;
  description: string;
  warning?: boolean;
  actionLabel: string;
}

export function QuickActions({ siteId, agentBase, config = DEFAULT_CONFIG }: QuickActionsProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [current, setCurrent] = useState<CurrentValues>({});

  // Fetch current values from latest successful commands
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cmds = ["set_max_ac_charge_current", "set_output_priority", "set_charger_priority", "set_buzzer_enabled"];
      const { data } = await supabase
        .from("device_commands")
        .select("command,payload,status,created_at")
        .eq("site_id", siteId)
        .in("command", cmds)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled || !data) return;
      const next: CurrentValues = {};
      for (const row of data) {
        const p = (row.payload ?? {}) as Record<string, unknown>;
        if (next.amps == null && row.command === "set_max_ac_charge_current" && typeof p.amps === "number") next.amps = p.amps;
        if (next.outputPriority == null && row.command === "set_output_priority" && typeof p.value === "string") next.outputPriority = p.value;
        if (next.chargerPriority == null && row.command === "set_charger_priority" && typeof p.value === "string") next.chargerPriority = p.value;
        if (next.buzzerEnabled == null && row.command === "set_buzzer_enabled" && typeof p.enabled === "boolean") next.buzzerEnabled = p.enabled;
      }
      setCurrent(next);
    }
    load();
    // refresh on new commands
    const ch = supabase
      .channel(`qa-cmds-${siteId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "device_commands", filter: `site_id=eq.${siteId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [siteId]);

  async function execute(cmd: PendingConfirm) {
    setPending(cmd.key);
    try {
      if (agentBase) {
        const r = await fetch(`${agentBase}/api/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: [{ command: cmd.command, payload: cmd.payload }] }),
        });
        if (!r.ok) throw new Error(await r.text().catch(() => `HTTP ${r.status}`));
        toast.success("Comando enviado al inversor");
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { toast.error("Sesión expirada"); return; }
        const { error } = await supabase.from("device_commands").insert({
          site_id: siteId, command: cmd.command, payload: cmd.payload as never, created_by: u.user.id,
        });
        if (error) throw error;
        toast.success("Comando encolado");
      }
      // optimistic local update
      setCurrent((c) => {
        const n = { ...c };
        if (cmd.command === "set_max_ac_charge_current") n.amps = cmd.payload.amps as number;
        if (cmd.command === "set_output_priority") n.outputPriority = cmd.payload.value as string;
        if (cmd.command === "set_charger_priority") n.chargerPriority = cmd.payload.value as string;
        if (cmd.command === "set_buzzer_enabled") n.buzzerEnabled = cmd.payload.enabled as boolean;
        return n;
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  function ask(cmd: PendingConfirm) { setConfirm(cmd); }

  const noneEnabled = !config.amps && !config.outputPriority && !config.chargerPriority && !config.buzzer;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 animate-fade-in h-full">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
          <Zap className="h-4 w-4" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold sm:text-base">Acciones rápidas</h3>
          <p className="text-[11px] text-muted-foreground">Configuración remota inmediata · valores actuales del inversor</p>
        </div>
      </div>

      {noneEnabled ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          No hay acciones habilitadas. Actívalas en Configuración → Inversor → Acciones rápidas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 @[520px]:grid-cols-2">
          {config.amps && (
            <ActionGroup
              icon={<BatteryCharging className="h-3.5 w-3.5" />}
              title="Carga desde red (A)"
              hint={current.amps != null ? `Actual: ${current.amps} A` : "Limita cuánta corriente toma de la red"}
            >
              {AC_AMPS.map((a) => (
                <Chip
                  key={a}
                  label={`${a} A`}
                  active={current.amps === a}
                  warning={a < 10}
                  loading={pending === `amps-${a}`}
                  onClick={() => ask({
                    command: "set_max_ac_charge_current",
                    payload: { amps: a },
                    key: `amps-${a}`,
                    title: `Limitar carga a ${a} A`,
                    description: a < 10
                      ? `Una corriente de carga muy baja (${a} A) puede impedir que la batería se recargue completamente desde la red. Úsalo solo si quieres priorizar la carga solar o reducir consumo eléctrico.`
                      : `Cambiar la corriente máxima de carga desde la red a ${a} A. ${current.amps != null ? `Valor actual: ${current.amps} A.` : ""}`,
                    warning: a < 10,
                    actionLabel: `Aplicar ${a} A`,
                  })}
                />
              ))}
            </ActionGroup>
          )}

          {config.outputPriority && (
            <ActionGroup
              icon={<Power className="h-3.5 w-3.5" />}
              title="Prioridad de salida"
              hint={current.outputPriority ? `Actual: ${POP_OPTS.find((o) => o.v === current.outputPriority)?.l ?? current.outputPriority}` : "De dónde alimentar las cargas"}
            >
              {POP_OPTS.map((o) => (
                <Chip
                  key={o.v}
                  label={o.l}
                  active={current.outputPriority === o.v}
                  loading={pending === `pop-${o.v}`}
                  onClick={() => ask({
                    command: "set_output_priority",
                    payload: { value: o.v },
                    key: `pop-${o.v}`,
                    title: `Prioridad de salida: ${o.l}`,
                    description: `Cambiar la prioridad de salida del inversor a "${o.l}". ${current.outputPriority ? `Actual: ${POP_OPTS.find((x) => x.v === current.outputPriority)?.l}.` : ""}`,
                    actionLabel: `Aplicar ${o.l}`,
                  })}
                />
              ))}
            </ActionGroup>
          )}

          {config.chargerPriority && (
            <ActionGroup
              icon={<Zap className="h-3.5 w-3.5" />}
              title="Prioridad de carga"
              hint={current.chargerPriority ? `Actual: ${PCP_OPTS.find((o) => o.v === current.chargerPriority)?.l ?? current.chargerPriority}` : "Qué fuente carga la batería"}
            >
              {PCP_OPTS.map((o) => (
                <Chip
                  key={o.v}
                  label={o.l}
                  active={current.chargerPriority === o.v}
                  loading={pending === `pcp-${o.v}`}
                  onClick={() => ask({
                    command: "set_charger_priority",
                    payload: { value: o.v },
                    key: `pcp-${o.v}`,
                    title: `Prioridad de carga: ${o.l}`,
                    description: `Cambiar la prioridad de carga del inversor a "${o.l}". ${current.chargerPriority ? `Actual: ${PCP_OPTS.find((x) => x.v === current.chargerPriority)?.l}.` : ""}`,
                    actionLabel: `Aplicar ${o.l}`,
                  })}
                />
              ))}
            </ActionGroup>
          )}

          {config.buzzer && (
            <ActionGroup
              icon={current.buzzerEnabled === false ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              title="Buzzer / alarma"
              hint={current.buzzerEnabled == null ? "Silenciar la alarma sonora del equipo" : `Actual: ${current.buzzerEnabled ? "Encendido" : "Silenciado"}`}
            >
              <Chip
                label="Encender"
                active={current.buzzerEnabled === true}
                loading={pending === "buzzer-on"}
                onClick={() => ask({
                  command: "set_buzzer_enabled",
                  payload: { enabled: true },
                  key: "buzzer-on",
                  title: "Encender buzzer",
                  description: "El inversor volverá a emitir alertas sonoras cuando ocurran eventos críticos.",
                  actionLabel: "Encender",
                })}
              />
              <Chip
                label="Silenciar"
                active={current.buzzerEnabled === false}
                loading={pending === "buzzer-off"}
                onClick={() => ask({
                  command: "set_buzzer_enabled",
                  payload: { enabled: false },
                  key: "buzzer-off",
                  title: "Silenciar buzzer",
                  description: "El inversor dejará de emitir alertas sonoras. Las notificaciones en la app seguirán funcionando.",
                  actionLabel: "Silenciar",
                })}
              />
            </ActionGroup>
          )}
        </div>
      )}

      <AlertDialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirm?.warning && <AlertTriangle className="h-5 w-5 text-warning" />}
              {confirm?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                const c = confirm;
                setConfirm(null);
                execute(c);
              }}
            >
              {confirm?.actionLabel ?? "Aplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionGroup({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}{title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint && <p className="mt-2 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function Chip({ label, onClick, loading, active, warning }: { label: string; onClick: () => void; loading?: boolean; active?: boolean; warning?: boolean }) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
        "disabled:opacity-50 disabled:cursor-wait active:scale-95",
        active
          ? "border-accent bg-accent text-accent-foreground shadow-sm"
          : warning
            ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
            : "border-border bg-card text-foreground hover:bg-muted hover:border-accent/40",
      ].join(" ")}
    >
      {loading ? "…" : label}
    </button>
  );
}

/* -------------------- Config card (for Configuración tab) -------------------- */

export function QuickActionsConfigCard({ siteId }: { siteId: string }) {
  const { config, setConfig } = useQuickActionsConfig(siteId);
  const items: { key: keyof QuickActionsConfig; label: string; hint: string }[] = [
    { key: "amps", label: "Carga desde red (A)", hint: "Botones para 2/10/20/30 A" },
    { key: "outputPriority", label: "Prioridad de salida", hint: "SBU / Solar / Utility" },
    { key: "chargerPriority", label: "Prioridad de carga", hint: "Solo Solar / Utility / Solar+Utility" },
    { key: "buzzer", label: "Buzzer / alarma", hint: "Encender o silenciar el buzzer" },
  ];
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold sm:text-base">Acciones rápidas del dashboard</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Elige qué controles remotos aparecen en la tarjeta de acciones rápidas del dashboard. Cada cambio aplicado pedirá confirmación.
      </p>
      <div className="space-y-2">
        {items.map((it) => (
          <label key={it.key} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-background/60 p-3 transition-colors hover:bg-muted/40">
            <div className="min-w-0">
              <div className="text-sm font-medium">{it.label}</div>
              <div className="text-[11px] text-muted-foreground">{it.hint}</div>
            </div>
            <input
              type="checkbox"
              checked={config[it.key]}
              onChange={(e) => setConfig({ [it.key]: e.target.checked } as Partial<QuickActionsConfig>)}
              className="mt-1 h-4 w-4 accent-accent"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
