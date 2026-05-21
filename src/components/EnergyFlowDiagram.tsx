import { Zap, Info } from "lucide-react";
import { useMemo } from "react";

interface Props {
  pv: number;        // W
  load: number;      // W
  gridV: number;     // V
  battery: number;   // %
  batteryV: number;  // V
  gridW?: number;    // W (optional grid power)
  batteryW?: number; // W (battery in/out)
}

/**
 * Clean energy-flow visualization matching the user's reference design.
 * Horizontal layout: Battery (left) · Solar (top) · House (center) · Grid (right)
 * with curved arrows showing flow direction.
 */
export function EnergyFlowDiagram({ pv, load, gridV, battery, batteryV, gridW = 0, batteryW }: Props) {
  const gridConnected = gridV > 50;

  const flows = useMemo(() => {
    const surplus = Math.max(0, pv - load);
    const deficit = Math.max(0, load - pv);
    // Battery: positive = discharging to house, negative = charging from solar
    const batW = batteryW ?? 0;
    const batteryToHouse = batW > 5 ? batW : 0;
    const solarToBattery = batW < -5 ? Math.abs(batW) : (surplus > 0 && battery < 100 ? surplus : 0);
    const solarToHouse = Math.min(pv, load);
    const gridToHouse = gridConnected ? Math.max(0, deficit - batteryToHouse) : 0;
    return { batteryToHouse, solarToBattery, solarToHouse, gridToHouse };
  }, [pv, load, battery, batteryW, gridConnected]);

  // Layout coordinates (viewBox 1000x520)
  const SOLAR = { x: 500, y: 110 };
  const HOUSE = { x: 500, y: 360 };
  const BATTERY = { x: 160, y: 360 };
  const GRID = { x: 840, y: 360 };

  return (
    <div className="dashboard-card p-5 sm:p-6 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--accent)_15%,transparent)] text-[var(--accent)]">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Flujo de energía</h3>
        </div>
        <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors">
          <Info className="h-4 w-4" />
        </button>
      </div>

      <svg viewBox="0 0 1000 560" className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arr-solar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
          <marker id="arr-house" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="arr-battery" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
          <marker id="arr-grid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* === FLOW ARROWS === */}
        {/* Battery → House (green curve from battery up and to center-house) */}
        {flows.batteryToHouse > 0 && (
          <path
            d={`M ${BATTERY.x + 60} ${BATTERY.y - 10} Q ${BATTERY.x + 180} ${BATTERY.y - 80} ${HOUSE.x - 80} ${HOUSE.y - 30}`}
            fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"
            markerEnd="url(#arr-battery)"
            style={{ strokeDasharray: "300", strokeDashoffset: "0", animation: "dashFlow 2s linear infinite" }}
          />
        )}

        {/* Solar → House (blue arrow down from solar to house) */}
        {flows.solarToHouse > 0 && (
          <path
            d={`M ${SOLAR.x + 30} ${SOLAR.y + 70} Q ${SOLAR.x + 50} ${(SOLAR.y + HOUSE.y) / 2} ${HOUSE.x + 10} ${HOUSE.y - 50}`}
            fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"
            markerEnd="url(#arr-house)"
          />
        )}

        {/* Solar generation arrow (orange up arrow into solar) */}
        <path
          d={`M ${SOLAR.x - 30} ${SOLAR.y + 180} L ${SOLAR.x - 30} ${SOLAR.y + 80}`}
          fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"
          markerEnd="url(#arr-solar)"
        />

        {/* House ↔ Grid (dashed line between house and grid) */}
        <path
          d={`M ${HOUSE.x + 90} ${HOUSE.y} L ${GRID.x - 70} ${GRID.y}`}
          fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
          strokeDasharray="6 6"
        />
        {/* Small bidirectional arrow heads on grid line */}
        <path d={`M ${HOUSE.x + 95} ${HOUSE.y - 5} L ${HOUSE.x + 105} ${HOUSE.y} L ${HOUSE.x + 95} ${HOUSE.y + 5}`}
          fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M ${GRID.x - 75} ${GRID.y - 5} L ${GRID.x - 85} ${GRID.y} L ${GRID.x - 75} ${GRID.y + 5}`}
          fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* === NODES === */}
        {/* SOLAR (top center) */}
        <NodeIcon x={SOLAR.x} y={SOLAR.y} color="#f59e0b" bgOpacity={0.12}>
          <g transform={`translate(${SOLAR.x - 28}, ${SOLAR.y - 28})`}>
            {/* Sun */}
            <circle cx="20" cy="18" r="7" fill="#f59e0b" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
              const rad = (a * Math.PI) / 180;
              const x1 = 20 + Math.cos(rad) * 11;
              const y1 = 18 + Math.sin(rad) * 11;
              const x2 = 20 + Math.cos(rad) * 15;
              const y2 = 18 + Math.sin(rad) * 15;
              return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />;
            })}
            {/* Panel grid */}
            <g transform="translate(8, 32)">
              <rect x="0" y="0" width="40" height="18" rx="1.5" fill="#1e3a5f" />
              {[1, 2, 3].map(i => <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="18" stroke="#3b5a8a" strokeWidth="0.8" />)}
              <line x1="0" y1="9" x2="40" y2="9" stroke="#3b5a8a" strokeWidth="0.8" />
            </g>
          </g>
        </NodeIcon>
        <text x={SOLAR.x + 95} y={SOLAR.y - 8} fontSize="28" fontWeight="700" fill="#f59e0b" className="tabular-nums">
          {Math.round(pv)}
          <tspan fontSize="15" fontWeight="600" dx="3" fill="#f59e0b" opacity="0.85">W</tspan>
        </text>
        <text x={SOLAR.x + 95} y={SOLAR.y + 16} fontSize="14" fill="hsl(var(--muted-foreground))" fontWeight="500">
          Generación solar
        </text>

        {/* BATTERY (left) */}
        <NodeIcon x={BATTERY.x} y={BATTERY.y} color="#22c55e" bgOpacity={0.12}>
          <g transform={`translate(${BATTERY.x - 14}, ${BATTERY.y - 22})`}>
            <rect x="3" y="2" width="22" height="4" rx="1" fill="none" stroke="#22c55e" strokeWidth="2" />
            <rect x="0" y="6" width="28" height="38" rx="4" fill="none" stroke="#22c55e" strokeWidth="2.5" />
            <path d="M 16 14 L 10 28 L 14 28 L 12 38 L 20 22 L 16 22 L 18 14 Z" fill="#22c55e" />
          </g>
        </NodeIcon>
        <text x={BATTERY.x} y={BATTERY.y + 75} textAnchor="middle" fontSize="26" fontWeight="700" fill="#22c55e" className="tabular-nums">
          {Math.round(Math.abs(flows.batteryToHouse || flows.solarToBattery || 0))}
          <tspan fontSize="14" fontWeight="600" dx="3" opacity="0.85">W</tspan>
        </text>
        <text x={BATTERY.x} y={BATTERY.y + 96} textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground))" fontWeight="500">Batería</text>
        <text x={BATTERY.x} y={BATTERY.y + 115} textAnchor="middle" fontSize="12" fill="hsl(var(--muted-foreground))" opacity="0.75">
          {battery.toFixed(0)}% · {batteryV.toFixed(1)} V
        </text>

        {/* HOUSE (center) */}
        <NodeIcon x={HOUSE.x} y={HOUSE.y} color="#3b82f6" bgOpacity={0.08}>
          <g transform={`translate(${HOUSE.x - 18}, ${HOUSE.y - 18})`}>
            <path d="M 4 16 L 18 4 L 32 16 L 32 32 L 22 32 L 22 22 L 14 22 L 14 32 L 4 32 Z"
              fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        </NodeIcon>
        <text x={HOUSE.x + 75} y={HOUSE.y - 4} fontSize="26" fontWeight="700" fill="#3b82f6" className="tabular-nums">
          {Math.round(load)}
          <tspan fontSize="14" fontWeight="600" dx="3" opacity="0.85">W</tspan>
        </text>
        <text x={HOUSE.x + 75} y={HOUSE.y + 18} fontSize="13" fill="hsl(var(--muted-foreground))" fontWeight="500">
          Consumo de la casa
        </text>

        {/* GRID (right) */}
        <NodeIcon x={GRID.x} y={GRID.y} color="#94a3b8" bgOpacity={0.1}>
          <g transform={`translate(${GRID.x - 18}, ${GRID.y - 20})`} stroke="#64748b" strokeWidth="2" fill="none" strokeLinecap="round">
            {/* Tower poles */}
            <line x1="10" y1="2" x2="6" y2="38" />
            <line x1="26" y1="2" x2="30" y2="38" />
            {/* Crossbars */}
            <line x1="4" y1="10" x2="32" y2="10" />
            <line x1="5" y1="18" x2="31" y2="18" />
            <line x1="7" y1="28" x2="29" y2="28" />
            {/* X braces */}
            <line x1="8" y1="10" x2="14" y2="18" />
            <line x1="14" y1="10" x2="8" y2="18" />
            <line x1="22" y1="10" x2="28" y2="18" />
            <line x1="28" y1="10" x2="22" y2="18" />
          </g>
        </NodeIcon>
        <text x={GRID.x} y={GRID.y + 75} textAnchor="middle" fontSize="24" fontWeight="700" fill="hsl(var(--foreground))" className="tabular-nums">
          {Math.round(gridConnected ? gridW : 0)}
          <tspan fontSize="13" fontWeight="600" dx="3" opacity="0.7">W</tspan>
        </text>
        <text x={GRID.x} y={GRID.y + 96} textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground))" fontWeight="500">Red</text>
        <text x={GRID.x} y={GRID.y + 114} textAnchor="middle" fontSize="12" fill="hsl(var(--muted-foreground))" opacity="0.75">
          {gridConnected ? `${gridV.toFixed(0)} V` : "Desconectada"}
        </text>
      </svg>

      <style>{`
        @keyframes dashFlow {
          to { stroke-dashoffset: -24; }
        }
      `}</style>
    </div>
  );
}

function NodeIcon({
  x, y, color, bgOpacity = 0.12, children,
}: {
  x: number; y: number; color: string; bgOpacity?: number; children: React.ReactNode;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r="44" fill={color} opacity={bgOpacity} />
      <circle cx={x} cy={y} r="44" fill="none" stroke={color} strokeWidth="2" opacity="0.55" />
      {children}
    </g>
  );
}
