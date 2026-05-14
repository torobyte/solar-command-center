import { Sun, Plug, Battery, Home } from "lucide-react";

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
    <div className="@container rounded-xl border bg-card p-3 shadow-sm sm:p-6 animate-fade-in">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold @[360px]:text-base">Medidores en tiempo real</h3>
        <span className="shrink-0 rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
          ● EN VIVO
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 @[480px]:grid-cols-4 @[480px]:gap-4">
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

      {/* Linear "load bars" — hidden on very narrow containers to keep mobile clean */}
      <div className="mt-4 hidden space-y-3 border-t pt-4 @[360px]:block">
        <LoadBar label="Generación solar" value={pv} max={pvMax} unit="W" color="var(--solar)" />
        <LoadBar label="Consumo de la casa" value={load} max={loadMax} unit="W" color="var(--load)" />
        <LoadBar label="Estado de carga (SOC)" value={battery} max={100} unit="%" color="var(--battery)" />
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
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  // 270° arc (3/4 circle), starts at 135°
  const arc = circ * 0.75;
  const offset = arc * (1 - ratio);
  const id = `g-${label}`;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size, color }}>
        <svg width={size} height={size} className="-rotate-[135deg]">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={glow} />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke}
            strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" opacity="0.3"
          />
          {/* Value */}
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
          <div className="mb-0.5 opacity-80">{icon}</div>
          <div className="text-lg font-bold leading-none tabular-nums">
            {Math.round(value).toLocaleString()}
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
          </div>
          {subtitle && <div className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function LoadBar({ label, value, max, unit, color }: {
  label: string; value: number; max: number; unit: string; color: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {Math.round(value).toLocaleString()} <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
