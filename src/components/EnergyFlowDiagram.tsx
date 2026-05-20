import { Sun, Plug, Battery, Home, Zap } from "lucide-react";
import { useMemo } from "react";

interface Props {
  pv: number;        // W
  load: number;      // W
  gridV: number;     // V
  battery: number;   // %
  batteryV: number;  // V
}

/**
 * Premium energy-flow visualization with animated particles, gradient nodes,
 * pulsing rings and a dynamic glass-card aesthetic. Inspired by Tesla / Enphase.
 */
export function EnergyFlowDiagram({ pv, load, gridV, battery, batteryV }: Props) {
  const gridConnected = gridV > 50;

  const flows = useMemo(() => {
    const pvToLoad = Math.min(pv, load);
    const surplus = Math.max(0, pv - load);
    const deficit = Math.max(0, load - pv);
    const pvToBattery = battery < 100 ? surplus : 0;
    const gridToLoad = gridConnected ? deficit : 0;
    const batteryToLoad = !gridConnected ? deficit : 0;
    return { pvToLoad, pvToBattery, gridToLoad, batteryToLoad };
  }, [pv, load, battery, gridConnected]);

  // Path coordinates
  const PV = { x: 90, y: 80 };
  const HOUSE = { x: 250, y: 180 };
  const GRID = { x: 90, y: 290 };
  const BAT = { x: 410, y: 290 };

  return (
    <div className="dashboard-card p-5 sm:p-6 animate-fade-in">
      <div className="relative mb-5 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="dashboard-icon-chip mt-0.5 h-10 w-10 text-[var(--solar)]">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-semibold tracking-tight">
            Flujo de energía
            </h3>
            <p className="text-[11px] text-muted-foreground">Distribución en tiempo real</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:color-mix(in_oklab,var(--success)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--success)_12%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          </span>
          En vivo
        </span>
      </div>

      <svg viewBox="0 0 500 380" className="relative w-full max-w-[600px] mx-auto">
        <defs>
          {/* Gradients for nodes */}
          <radialGradient id="solarGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="60%" stopColor="var(--solar)" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <radialGradient id="houseGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="60%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#0e7490" />
          </radialGradient>
          <radialGradient id="batGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="60%" stopColor="var(--battery)" />
            <stop offset="100%" stopColor="#15803d" />
          </radialGradient>
          <radialGradient id="gridGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor={gridConnected ? "#fca5a5" : "#cbd5e1"} />
            <stop offset="60%" stopColor={gridConnected ? "var(--grid)" : "#94a3b8"} />
            <stop offset="100%" stopColor={gridConnected ? "#991b1b" : "#475569"} />
          </radialGradient>

          {/* Glow filter */}
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connection paths */}
        <FlowPath id="pv-house" from={PV} to={HOUSE} active={flows.pvToLoad > 0} color="var(--solar)" watts={flows.pvToLoad} />
        <FlowPath id="pv-bat" from={PV} to={BAT} active={flows.pvToBattery > 0} color="var(--solar)" watts={flows.pvToBattery} curved />
        <FlowPath id="grid-house" from={GRID} to={HOUSE} active={flows.gridToLoad > 0} color="var(--grid)" watts={flows.gridToLoad} />
        <FlowPath id="bat-house" from={BAT} to={HOUSE} active={flows.batteryToLoad > 0} color="var(--battery)" watts={flows.batteryToLoad} reverse />

        {/* Nodes */}
        <Node {...PV} gradient="url(#solarGrad)" label="Solar" value={`${Math.round(pv).toLocaleString()} W`} active={pv > 0}>
          <Sun className="h-7 w-7 text-white" strokeWidth={2.5} />
        </Node>
        <Node {...HOUSE} gradient="url(#houseGrad)" label="Casa" value={`${Math.round(load).toLocaleString()} W`} big active>
          <Home className="h-9 w-9 text-white" strokeWidth={2.5} />
        </Node>
        <Node {...GRID} gradient="url(#gridGrad)" label="Red" value={gridConnected ? `${gridV.toFixed(0)} V` : "Desconectada"} active={gridConnected}>
          <Plug className="h-7 w-7 text-white" strokeWidth={2.5} />
        </Node>
        <Node {...BAT} gradient="url(#batGrad)" label="Batería" value={`${battery.toFixed(0)}% · ${batteryV.toFixed(1)} V`} active={battery > 0}>
          <Battery className="h-7 w-7 text-white" strokeWidth={2.5} />
        </Node>
      </svg>

      {/* Stats row */}
      <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat color="var(--solar)" label="Solar" value={`${Math.round(pv)} W`} icon={<Sun className="h-3.5 w-3.5" />} />
        <Stat color="var(--accent)" label="Consumo" value={`${Math.round(load)} W`} icon={<Home className="h-3.5 w-3.5" />} />
        <Stat color="var(--battery)" label="Batería" value={`${battery.toFixed(0)}%`} icon={<Battery className="h-3.5 w-3.5" />} />
        <Stat color={gridConnected ? "var(--grid)" : "hsl(var(--muted-foreground))"} label="Red" value={gridConnected ? `${gridV.toFixed(0)} V` : "Off"} icon={<Plug className="h-3.5 w-3.5" />} />
      </div>

      <style>{`
        @keyframes flowDash { to { stroke-dashoffset: -32; } }
        @keyframes flowDashRev { to { stroke-dashoffset: 32; } }
        @keyframes nodePulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.15; transform: scale(1.15); }
        }
        @keyframes particleMove {
          from { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          to { offset-distance: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function FlowPath({
  id, from, to, active, color, reverse, curved, watts,
}: {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  active: boolean;
  color: string;
  reverse?: boolean;
  curved?: boolean;
  watts?: number;
}) {
  // Build a smooth curve through a control point near the house
  const cx = curved ? (from.x + to.x) / 2 : to.x;
  const cy = curved ? from.y : from.y + (to.y - from.y) * 0.6;
  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <g>
      <path d={d} fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" opacity="0.25" strokeDasharray="2 4" />
      {active && (
        <>
          <path
            id={id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray="10 6"
            strokeLinecap="round"
            opacity="0.9"
            style={{ animation: `${reverse ? "flowDashRev" : "flowDash"} 1.2s linear infinite` }}
            filter="url(#softGlow)"
          />
          {/* Traveling particle */}
          <circle r="3.5" fill={color} filter="url(#strongGlow)">
            <animateMotion dur="2.2s" repeatCount="indefinite" path={d} rotate="auto" keyPoints={reverse ? "1;0" : "0;1"} keyTimes="0;1" />
          </circle>
          {watts != null && watts > 5 && (
            <g transform={`translate(${midX},${midY})`}>
              <rect x="-22" y="-9" width="44" height="18" rx="9" fill="hsl(var(--background))" stroke={color} strokeWidth="1" opacity="0.95" />
              <text textAnchor="middle" y="4" fontSize="10" fontWeight="700" fill={color}>
                {Math.round(watts)}W
              </text>
            </g>
          )}
        </>
      )}
    </g>
  );
}

function Node({
  x, y, gradient, label, value, children, big, active,
}: {
  x: number; y: number; gradient: string; label: string; value: string;
  children: React.ReactNode; big?: boolean; active?: boolean;
}) {
  const r = big ? 38 : 30;
  return (
    <g>
      {/* Outer pulse ring */}
      {active && (
        <circle cx={x} cy={y} r={r + 8} fill={gradient} opacity="0.25"
          style={{ animation: "nodePulse 2.5s ease-in-out infinite", transformOrigin: `${x}px ${y}px` }} />
      )}
      {/* Glow halo */}
      <circle cx={x} cy={y} r={r + 4} fill={gradient} opacity="0.3" filter="url(#strongGlow)" />
      {/* Main circle */}
      <circle cx={x} cy={y} r={r} fill={gradient} stroke="hsl(var(--background))" strokeWidth="2" />
      {/* Inner highlight */}
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.35} fill="white" opacity="0.25" />
      {/* Icon */}
      <foreignObject x={x - r * 0.55} y={y - r * 0.55} width={r * 1.1} height={r * 1.1} style={{ pointerEvents: "none" }}>
        <div className="flex h-full w-full items-center justify-center">{children}</div>
      </foreignObject>
      {/* Labels */}
      <text x={x} y={y + r + 18} textAnchor="middle" className="fill-foreground" fontSize="13" fontWeight="700">{label}</text>
      <text x={x} y={y + r + 33} textAnchor="middle" className="fill-muted-foreground" fontSize="11" fontWeight="500">{value}</text>
    </g>
  );
}

function Stat({ color, label, value, icon }: { color: string; label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="dashboard-panel flex items-center gap-2 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
