import { Sun, Plug, Battery, Home } from "lucide-react";

interface Props {
  pv: number;        // W
  load: number;      // W
  gridV: number;     // V
  battery: number;   // %
  batteryV: number;  // V
}

/**
 * Animated energy-flow diagram inspired by Enphase / SolarEdge.
 * Shows PV, Grid, Battery → House with animated dashed lines whose
 * direction reflects real power flow.
 */
export function EnergyFlowDiagram({ pv, load, gridV, battery, batteryV }: Props) {
  const gridConnected = gridV > 50;

  // Naïve flow estimation
  const pvToLoad = Math.min(pv, load);
  const surplus = Math.max(0, pv - load);
  const deficit = Math.max(0, load - pv);
  const pvToBattery = battery < 100 ? surplus : 0;
  const gridToLoad = gridConnected ? deficit : 0;
  const batteryToLoad = !gridConnected ? deficit : 0;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Flujo de energía en tiempo real</h3>
        <span className="rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
          ● EN VIVO
        </span>
      </div>

      <svg viewBox="0 0 400 320" className="w-full max-w-[520px] mx-auto">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* PV → House (top) */}
        <FlowPath d="M 80 60 Q 200 60 200 150" active={pvToLoad > 0} color="var(--solar)" />
        {/* Grid → House (left) */}
        <FlowPath d="M 80 260 Q 200 260 200 180" active={gridToLoad > 0} color="var(--grid)" />
        {/* Battery → House (right) */}
        <FlowPath d="M 320 260 Q 200 260 200 180" active={batteryToLoad > 0} color="var(--battery)" reverse />
        {/* PV → Battery (top→right) */}
        <FlowPath d="M 80 60 Q 320 60 320 240" active={pvToBattery > 0} color="var(--solar)" />

        {/* House (center) */}
        <Node x={200} y={165} color="var(--accent)" label="Casa" value={`${load.toFixed(0)} W`} bigIcon>
          <Home className="h-7 w-7 text-white" strokeWidth={2.5} />
        </Node>

        {/* Solar (top-left) */}
        <Node x={80} y={60} color="var(--solar)" label="Solar" value={`${Math.round(pv).toLocaleString()} W`}>
          <Sun className="h-5 w-5 text-white" strokeWidth={2.5} />
        </Node>

        {/* Grid (bottom-left) */}
        <Node x={80} y={260} color={gridConnected ? "var(--grid)" : "hsl(var(--muted-foreground))"} label="Red" value={`${gridV.toFixed(0)} V`}>
          <Plug className="h-5 w-5 text-white" strokeWidth={2.5} />
        </Node>

        {/* Battery (bottom-right) */}
        <Node x={320} y={260} color="var(--battery)" label="Batería" value={`${battery.toFixed(0)}% · ${batteryV.toFixed(1)}V`}>
          <Battery className="h-5 w-5 text-white" strokeWidth={2.5} />
        </Node>
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <Legend color="var(--solar)" label="Solar" />
        <Legend color="var(--battery)" label="Batería" />
        <Legend color="var(--grid)" label="Red" />
      </div>

      <style>{`
        @keyframes flowDash { to { stroke-dashoffset: -24; } }
        @keyframes flowDashRev { to { stroke-dashoffset: 24; } }
        @keyframes pulseRing {
          0% { r: 26; opacity: 0.5; }
          100% { r: 38; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function FlowPath({ d, active, color, reverse }: { d: string; active: boolean; color: string; reverse?: boolean }) {
  return (
    <>
      <path d={d} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" opacity="0.3" />
      {active && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray="8 4"
          strokeLinecap="round"
          style={{ animation: `${reverse ? "flowDashRev" : "flowDash"} 1s linear infinite` }}
          filter="url(#glow)"
        />
      )}
    </>
  );
}

function Node({
  x, y, color, label, value, children, bigIcon,
}: {
  x: number; y: number; color: string; label: string; value: string;
  children: React.ReactNode; bigIcon?: boolean;
}) {
  const r = bigIcon ? 32 : 26;
  return (
    <g>
      {/* pulse ring */}
      <circle cx={x} cy={y} r={r} fill={color} opacity="0.3" style={{ animation: "pulseRing 2s ease-out infinite" }} />
      <circle cx={x} cy={y} r={r} fill={color} />
      <foreignObject x={x - 12} y={y - 12} width="24" height="24" style={{ pointerEvents: "none" }}>
        <div className="flex h-full w-full items-center justify-center">{children}</div>
      </foreignObject>
      <text x={x} y={y + r + 16} textAnchor="middle" className="fill-foreground" fontSize="12" fontWeight="600">{label}</text>
      <text x={x} y={y + r + 30} textAnchor="middle" className="fill-muted-foreground" fontSize="11">{value}</text>
    </g>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="inline-block h-2 w-4 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
