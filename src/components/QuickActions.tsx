import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap, Power, BatteryCharging, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface QuickActionsProps {
  siteId: string;
  agentBase?: string | null;
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

export function QuickActions({ siteId, agentBase }: QuickActionsProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [confirmAmps, setConfirmAmps] = useState<number | null>(null);
  const [buzzerOn, setBuzzerOn] = useState(true);

  async function send(command: string, payload: Record<string, unknown>, key: string) {
    setPending(key);
    try {
      if (agentBase) {
        const r = await fetch(`${agentBase}/api/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: [{ command, payload }] }),
        });
        if (!r.ok) throw new Error(await r.text().catch(() => `HTTP ${r.status}`));
        toast.success("Comando enviado al inversor");
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { toast.error("Sesión expirada"); return; }
        const { error } = await supabase.from("device_commands").insert({
          site_id: siteId, command, payload: payload as never, created_by: u.user.id,
        });
        if (error) throw error;
        toast.success("Comando encolado");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  function clickAmps(amps: number) {
    if (amps < 10) { setConfirmAmps(amps); return; }
    send("set_max_ac_charge_current", { amps }, `amps-${amps}`);
  }

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-card to-card/80 p-4 shadow-sm sm:p-5 animate-fade-up">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 text-accent ring-1 ring-accent/20">
            <Zap className="h-4 w-4" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-sm font-semibold sm:text-base">Acciones rápidas</h3>
            <p className="text-[11px] text-muted-foreground">Configuración remota inmediata</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ActionGroup
          icon={<BatteryCharging className="h-3.5 w-3.5" />}
          title="Carga desde red (A)"
          hint="Limita cuánta corriente toma de la red"
        >
          {AC_AMPS.map((a) => (
            <Chip
              key={a}
              label={`${a} A`}
              warning={a < 10}
              loading={pending === `amps-${a}`}
              onClick={() => clickAmps(a)}
            />
          ))}
        </ActionGroup>

        <ActionGroup
          icon={<Power className="h-3.5 w-3.5" />}
          title="Prioridad de salida"
          hint="De dónde alimentar las cargas"
        >
          {POP_OPTS.map((o) => (
            <Chip
              key={o.v}
              label={o.l}
              loading={pending === `pop-${o.v}`}
              onClick={() => send("set_output_priority", { value: o.v }, `pop-${o.v}`)}
            />
          ))}
        </ActionGroup>

        <ActionGroup
          icon={<Zap className="h-3.5 w-3.5" />}
          title="Prioridad de carga"
          hint="Qué fuente carga la batería"
        >
          {PCP_OPTS.map((o) => (
            <Chip
              key={o.v}
              label={o.l}
              loading={pending === `pcp-${o.v}`}
              onClick={() => send("set_charger_priority", { value: o.v }, `pcp-${o.v}`)}
            />
          ))}
        </ActionGroup>

        <ActionGroup
          icon={buzzerOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          title="Buzzer / alarma"
          hint="Silenciar la alarma sonora del equipo"
        >
          <Chip
            label="Encender"
            loading={pending === "buzzer-on"}
            active={buzzerOn}
            onClick={() => { setBuzzerOn(true); send("set_buzzer_enabled", { enabled: true }, "buzzer-on"); }}
          />
          <Chip
            label="Silenciar"
            loading={pending === "buzzer-off"}
            active={!buzzerOn}
            onClick={() => { setBuzzerOn(false); send("set_buzzer_enabled", { enabled: false }, "buzzer-off"); }}
          />
        </ActionGroup>
      </div>

      <AlertDialog open={confirmAmps != null} onOpenChange={(o) => !o && setConfirmAmps(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Limitar carga a {confirmAmps} A
            </AlertDialogTitle>
            <AlertDialogDescription>
              Una corriente de carga muy baja puede impedir que la batería se recargue
              completamente desde la red. Úsalo solo si quieres priorizar la carga solar
              o reducir consumo eléctrico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmAmps(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const amps = confirmAmps!;
                setConfirmAmps(null);
                send("set_max_ac_charge_current", { amps }, `amps-${amps}`);
              }}
            >
              Aplicar {confirmAmps} A
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionGroup({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background/60 p-3">
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
