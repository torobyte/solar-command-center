import { Sun, Plug, Battery, Home, MoreVertical, Gauge } from "lucide-react";

interface Props {
  pv: number;        // W
  load: number;      // W
  gridV: number;     // V
  battery: number;   // %  (SOC)
  batteryV: number;  // V
  pvMax?: number;    // W
  loadMax?: number;  // W
}

/**
 * Set of animated radial gauges for PV / Load / Battery SOC / Grid status.
 * Inspired by SolarAssistant: smooth circular progress with gradient stroke,
 * pulsing center icon and animated value count-in.
 */
export function PowerGauges({ pv, load, gridV, battery, batteryV, pvMax = 5000, loadMax = 5000 }: Props) {
  const gridConnected = gridV > 50;
  return (
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[var(--load)]" />
          <h3 className="text-sm font-semibold @[360px]:text-base">Estado general del sistema</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-[var(--success)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--success)]">
            ● En vivo
          </span>
          <button type="button" className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground" aria-label="Más opciones">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 items-start gap-2 @[420px]:gap-3">
        <RadialGauge
          label="Solar"
          value={pv}
          unit="W"
          ratio={clamp(pv / pvMax)}
          color="var(--solar)"
          glow="var(--accent)"
          icon={<Sun className="h-4 w-4 @[480px]:h-5 @[480px]:w-5" />}
        />
        <RadialGauge
          label="Consumo"
          value={load}
          unit="W"
          ratio={clamp(load / loadMax)}
          color="var(--load)"
          glow="var(--load)"
          icon={<Home className="h-4 w-4 @[480px]:h-5 @[480px]:w-5" />}
        />
        <RadialGauge
          label="Batería"
          value={battery}
          unit="%"
          ratio={clamp(battery / 100)}
          color="var(--battery)"
          glow="var(--battery)"
          subtitle={`${batteryV.toFixed(1)} V`}
          icon={<Battery className="h-4 w-4 @[480px]:h-5 @[480px]:w-5" />}
        />
        <RadialGauge
          label="Red"
          value={gridConnected ? gridV : 0}
          unit="V"
          ratio={gridConnected ? clamp(gridV / 250) : 0}
          color={gridConnected ? "var(--grid)" : "hsl(var(--muted-foreground))"}
          glow="var(--grid)"
          subtitle={gridConnected ? "Conectada" : "Desconectada"}
          icon={<Plug className="h-4 w-4 @[480px]:h-5 @[480px]:w-5" />}
        />
      </div>

      <div className="mt-5 space-y-3 border-t border-border/70 pt-4">
        <LoadBar label="Generación solar" value={pv} max={pvMax} unit="W" color="var(--solar)" icon={<Sun className="h-3.5 w-3.5 text-[var(--solar)]" />} />
        <LoadBar label="Consumo de la casa" value={load} max={loadMax} unit="W" color="var(--load)" icon={<Home className="h-3.5 w-3.5 text-[var(--load)]" />} />
        <LoadBar label="Estado de carga (SOC)" value={battery} max={100} unit="%" color="var(--battery)" icon={<Battery className="h-3.5 w-3.5 text-[var(--battery)]" />} />
      </div>

      <style>{`
        @keyframes gaugePulse {
          0%,100% { filter: drop-shadow(0 0 0 transparent); }
          50% { filter: drop-shadow(0 0 6px currentColor); }
        }
        @keyframes barFill { from { width: 0%; } }
      `}</style>
    </div>
  );
}

function clamp(n: number) { return Math.min(1, Math.max(0, isFinite(n) ? n : 0)); }

function RadialGauge({
  label, value, unit, ratio, color, glow, subtitle, icon,
}: {
  label: string; value: number; unit: string; ratio: number;
  color: string; glow: string; subtitle?: string; icon: React.ReactNode;
}) {
  const emphasized = label === "Batería";
  const size = emphasized ? 156 : 112;
  const stroke = emphasized ? 12 : 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const arc = circ * (emphasized ? 0.82 : 0.74);
  const offset = arc * (1 - ratio);
  const id = `g-${label}`;
  return (
    <div className="flex flex-col items-center">
      <div className={`relative mx-auto aspect-square w-full ${emphasized ? "max-w-[138px] @[420px]:max-w-[150px]" : "max-w-[76px] @[420px]:max-w-[90px]"}`} style={{ color }}>
        <svg viewBox={`0 0 ${size} ${size}`} className={`h-full w-full ${emphasized ? "-rotate-[123deg]" : "-rotate-[137deg]"}`}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={glow} />
            </linearGradient>
          </defs>
          <circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke}
            strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" opacity="0.3"
          />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={`url(#${id})`} strokeWidth={stroke}
            strokeDasharray={`${arc - offset} ${circ}`} strokeLinecap="round"
            style={{
              transition: "stroke-dasharray 0.8s cubic-bezier(.2,.8,.2,1)",
              animation: "gaugePulse 3s ease-in-out infinite",
            }}
          />
        </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`${emphasized ? "mb-1" : "mb-0.5"} opacity-80`}>{icon}</div>
          <div className={`${emphasized ? "text-3xl @[480px]:text-[2rem]" : "text-base @[480px]:text-lg"} font-bold leading-none tabular-nums`}>
            {Math.round(value).toLocaleString()}
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground @[480px]:text-xs">{unit}</span>
          </div>
          {subtitle && <div className={`${emphasized ? "mt-1 text-[11px]" : "mt-0.5 text-[9px] @[480px]:text-[10px]"} text-muted-foreground`}>{subtitle}</div>}
        </div>
      </div>
      <div className={`${emphasized ? "mt-2 text-xs" : "mt-1 text-[11px] @[480px]:text-xs"} font-medium ${label === "Red" && !subtitle?.includes("Conectada") ? "text-muted-foreground/90" : "text-muted-foreground"}`}>{label}</div>
    </div>
  );
}

function LoadBar({ label, value, max, unit, color, icon }: {
  label: string; value: number; max: number; unit: string; color: string; icon?: React.ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
        <span className="font-semibold tabular-nums">
          {Math.round(value).toLocaleString()} <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/80">
        <div
          className="relative h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color} 0%, color-mix(in oklab, ${color} 60%, white) 100%)`,
            transition: "width 0.8s cubic-bezier(.2,.8,.2,1)",
            animation: "barFill 0.8s ease-out",
          }}
        >
          <span
            className="absolute inset-0 rounded-full opacity-40"
            style={{ background: "linear-gradient(90deg, transparent, white, transparent)", animation: "shimmer 2s linear infinite" }}
          />
        </div>
      </div>
      <style>{`@keyframes shimmer { 0%{transform:translateX(-100%);} 100%{transform:translateX(100%);} }`}</style>
    </div>
  );
}
