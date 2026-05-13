import { Battery, Sun, Plug, Zap, Home } from "lucide-react";

/* ============================================================
 * Battery3D — animated 3D-ish battery cell with liquid level,
 * pulsing on discharge, lightning bolts on charge.
 * ============================================================ */
export function Battery3D({ soc, voltage, charging }: { soc: number; voltage: number; charging: boolean }) {
  const pct = Math.max(0, Math.min(100, soc));
  const fillColor = pct > 60 ? "var(--success)" : pct > 30 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 animate-fade-in">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Battery className="h-4 w-4" /> Batería</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
          {charging ? "⚡ Cargando" : "Descargando"}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative" style={{ width: 110, height: 200 }}>
          {/* terminal */}
          <div className="absolute left-1/2 top-0 h-3 w-10 -translate-x-1/2 rounded-t-md bg-foreground/40" />
          {/* body */}
          <div
            className="absolute inset-x-0 top-3 bottom-0 overflow-hidden rounded-2xl border-2 border-foreground/30 shadow-[inset_0_4px_8px_rgba(0,0,0,0.25)]"
            style={{ background: "linear-gradient(135deg, hsl(var(--muted)/.6), hsl(var(--card)))" }}
          >
            {/* liquid */}
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
              style={{
                height: `${pct}%`,
                background: `linear-gradient(180deg, color-mix(in oklab, ${fillColor} 70%, white) 0%, ${fillColor} 100%)`,
                boxShadow: `0 0 24px ${fillColor}`,
              }}
            >
              {/* wave */}
              <svg className="absolute -top-3 left-0 h-6 w-[200%]" viewBox="0 0 200 20" preserveAspectRatio="none"
                style={{ animation: "waveMove 4s linear infinite", color: fillColor }}>
                <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0 Z" fill="currentColor" opacity="0.8" />
              </svg>
              {/* bubbles when charging */}
              {charging && [...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-white/70"
                  style={{
                    left: `${15 + i * 18}%`,
                    bottom: "-4px",
                    animation: `bubbleUp ${2 + (i % 3)}s ease-in ${i * 0.4}s infinite`,
                  }}
                />
              ))}
            </div>
            {/* glossy highlight */}
            <div className="pointer-events-none absolute inset-y-0 left-2 w-2 rounded-full bg-white/30 blur-[1px]" />
            {/* % label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center font-bold text-foreground">
              <span className="text-3xl drop-shadow-md">{pct.toFixed(0)}%</span>
              <span className="text-[11px] opacity-70">{voltage.toFixed(1)} V</span>
            </div>
            {/* charging bolt */}
            {charging && (
              <Zap
                className="absolute right-2 top-2 h-5 w-5 text-yellow-300"
                style={{ animation: "boltFlash 1s ease-in-out infinite", filter: "drop-shadow(0 0 6px #facc15)" }}
              />
            )}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <Stat label="Estado" value={pct > 80 ? "Excelente" : pct > 50 ? "Buena" : pct > 20 ? "Media" : "Crítica"} />
          <Stat label="Voltaje" value={`${voltage.toFixed(2)} V`} />
          <Stat label="Modo" value={charging ? "Cargando" : "Suministrando"} />
        </div>
      </div>
      <style>{`
        @keyframes waveMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes bubbleUp { from { transform: translateY(0); opacity: 0.9; } to { transform: translateY(-180px); opacity: 0; } }
        @keyframes boltFlash { 0%,100%{opacity:.7;transform:scale(1);} 50%{opacity:1;transform:scale(1.2);} }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/* ============================================================
 * PowerCell3D — battery-style liquid cell reused for Solar
 * production and household Load. Liquid level reflects current
 * vs max; bubbles + glow when active.
 * ============================================================ */
export function PowerCell3D({
  title, watts, max, color, icon, activeLabel, idleLabel, stats, accent = "var(--accent)",
}: {
  title: string;
  watts: number;
  max: number;
  color: string;
  icon: React.ReactNode;
  activeLabel: string;
  idleLabel: string;
  stats: Array<{ label: string; value: string }>;
  accent?: string;
}) {
  const ratio = Math.max(0, Math.min(1, max > 0 ? watts / max : 0));
  const pct = ratio * 100;
  const active = watts > 1;
  const cellId = `cell-${title.replace(/\s/g, "")}`;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 animate-fade-in">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <span style={{ color }}>{icon}</span> {title}
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: `color-mix(in oklab, ${color} 15%, transparent)`,
            color,
          }}
        >
          {active ? `⚡ ${activeLabel}` : idleLabel}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative" style={{ width: 110, height: 200 }}>
          {/* terminal */}
          <div className="absolute left-1/2 top-0 h-3 w-10 -translate-x-1/2 rounded-t-md bg-foreground/40" />
          {/* body */}
          <div
            className="absolute inset-x-0 top-3 bottom-0 overflow-hidden rounded-2xl border-2 border-foreground/30 shadow-[inset_0_4px_8px_rgba(0,0,0,0.25)]"
            style={{ background: "linear-gradient(135deg, hsl(var(--muted)/.6), hsl(var(--card)))" }}
          >
            {/* liquid */}
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
              style={{
                height: `${pct}%`,
                background: `linear-gradient(180deg, color-mix(in oklab, ${color} 70%, white) 0%, ${color} 100%)`,
                boxShadow: `0 0 24px ${color}`,
              }}
            >
              <svg
                className="absolute -top-3 left-0 h-6 w-[200%]"
                viewBox="0 0 200 20"
                preserveAspectRatio="none"
                style={{ animation: `waveMove-${cellId} 4s linear infinite`, color }}
              >
                <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0 Z" fill="currentColor" opacity="0.8" />
              </svg>
              {active && [...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-white/70"
                  style={{
                    left: `${15 + i * 18}%`,
                    bottom: "-4px",
                    animation: `bubbleUp-${cellId} ${2 + (i % 3)}s ease-in ${i * 0.4}s infinite`,
                  }}
                />
              ))}
            </div>
            {/* glossy highlight */}
            <div className="pointer-events-none absolute inset-y-0 left-2 w-2 rounded-full bg-white/30 blur-[1px]" />
            {/* value label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center font-bold text-foreground">
              <span className="text-3xl drop-shadow-md tabular-nums">{Math.round(watts).toLocaleString()}</span>
              <span className="text-[11px] opacity-70">W · {pct.toFixed(0)}%</span>
            </div>
            {active && (
              <Zap
                className="absolute right-2 top-2 h-5 w-5"
                style={{
                  color: accent,
                  animation: `boltFlash-${cellId} 1s ease-in-out infinite`,
                  filter: `drop-shadow(0 0 6px ${accent})`,
                }}
              />
            )}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {stats.map((s) => (
            <div key={s.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes waveMove-${cellId} { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes bubbleUp-${cellId} { from { transform: translateY(0); opacity: 0.9; } to { transform: translateY(-180px); opacity: 0; } }
        @keyframes boltFlash-${cellId} { 0%,100%{opacity:.7;transform:scale(1);} 50%{opacity:1;transform:scale(1.2);} }
      `}</style>
    </div>
  );
}

export function SolarCell3D({ pv, pvMax = 5000 }: { pv: number; pvMax?: number }) {
  return (
    <PowerCell3D
      title="Producción Solar"
      watts={pv}
      max={pvMax}
      color="var(--solar)"
      accent="#facc15"
      icon={<Sun className="h-4 w-4" />}
      activeLabel="Generando"
      idleLabel="Sin sol"
      stats={[
        { label: "Potencia", value: `${Math.round(pv).toLocaleString()} W` },
        { label: "Capacidad", value: `${Math.round(pvMax).toLocaleString()} W` },
        { label: "Estado", value: pv > 1 ? "Produciendo" : "Inactivo" },
      ]}
    />
  );
}

export function LoadCell3D({ load, loadMax = 5000 }: { load: number; loadMax?: number }) {
  return (
    <PowerCell3D
      title="Consumo de la casa"
      watts={load}
      max={loadMax}
      color="var(--load)"
      accent="var(--load)"
      icon={<Home className="h-4 w-4" />}
      activeLabel="Consumiendo"
      idleLabel="En reposo"
      stats={[
        { label: "Carga actual", value: `${Math.round(load).toLocaleString()} W` },
        { label: "Capacidad", value: `${Math.round(loadMax).toLocaleString()} W` },
        { label: "Nivel", value: load > loadMax * 0.8 ? "Alto" : load > loadMax * 0.4 ? "Medio" : "Bajo" },
      ]}
    />
  );
}

/* ============================================================
 * SolarRays — animated sun whose rays grow with PV production.
 * ============================================================ */
export function SolarRays({ pv, pvMax = 5000 }: { pv: number; pvMax?: number }) {
  const ratio = Math.max(0, Math.min(1, pv / pvMax));
  const rayLen = 18 + ratio * 36;
  const rays = 12;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 animate-fade-in">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Sun className="h-4 w-4 text-[var(--solar)]" /> Producción Solar</h3>
        <span className="rounded-full bg-[var(--solar)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--solar)]">
          {(ratio * 100).toFixed(0)}% capacidad
        </span>
      </div>
      <div className="flex items-center justify-center py-2">
        <svg viewBox="-100 -100 200 200" className="h-44 w-44">
          <defs>
            <radialGradient id="sunGrad">
              <stop offset="0%" stopColor="#fffbe6" />
              <stop offset="60%" stopColor="var(--solar)" />
              <stop offset="100%" stopColor="#f59e0b" />
            </radialGradient>
          </defs>
          {/* halo */}
          <circle r={40 + ratio * 12} fill="var(--solar)" opacity={0.15}
            style={{ animation: "sunPulse 3s ease-in-out infinite" }} />
          {/* rays */}
          <g style={{ animation: "sunSpin 30s linear infinite" }}>
            {Array.from({ length: rays }).map((_, i) => {
              const a = (i / rays) * Math.PI * 2;
              const x1 = Math.cos(a) * 38, y1 = Math.sin(a) * 38;
              const x2 = Math.cos(a) * (38 + rayLen), y2 = Math.sin(a) * (38 + rayLen);
              return (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--solar)" strokeWidth="4" strokeLinecap="round"
                  style={{ transition: "all 0.6s", filter: `drop-shadow(0 0 ${ratio * 6}px var(--solar))` }} />
              );
            })}
          </g>
          {/* sun body */}
          <circle r="34" fill="url(#sunGrad)" style={{ filter: `drop-shadow(0 0 ${10 + ratio * 18}px var(--solar))` }} />
          <text textAnchor="middle" y="6" className="fill-[#7c2d12]" fontSize="18" fontWeight="800">
            {(pv / 1000).toFixed(2)}
          </text>
          <text textAnchor="middle" y="22" className="fill-[#7c2d12]" fontSize="9" opacity="0.85">kW</text>
        </svg>
      </div>
      <style>{`
        @keyframes sunSpin { to { transform: rotate(360deg); } }
        @keyframes sunPulse { 0%,100%{opacity:.15;transform:scale(1);} 50%{opacity:.3;transform:scale(1.08);} }
      `}</style>
    </div>
  );
}

/* ============================================================
 * GridSineWave — animated AC sine wave for grid status.
 * ============================================================ */
export function GridSineWave({ voltage, frequency = 50 }: { voltage: number; frequency?: number }) {
  const connected = voltage > 50;
  const color = connected ? "var(--grid)" : "hsl(var(--muted-foreground))";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 animate-fade-in">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Plug className="h-4 w-4" /> Red Eléctrica</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${connected
          ? "bg-[var(--grid)]/15 text-[var(--grid)]" : "bg-destructive/15 text-destructive"}`}>
          {connected ? "● CONECTADA" : "○ DESCONECTADA"}
        </span>
      </div>
      <div className="relative h-28 w-full overflow-hidden rounded-lg border bg-background">
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {/* center line */}
          <line x1="0" y1="50" x2="400" y2="50" stroke="hsl(var(--muted))" strokeDasharray="4 4" />
          {/* sine */}
          {connected && (
            <g style={{ animation: `sineScroll ${1.2 / (frequency / 50)}s linear infinite`, color }}>
              <path d={generateSinePath(800, 100, 40, 4)} fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
            </g>
          )}
          {!connected && (
            <text x="200" y="55" textAnchor="middle" className="fill-muted-foreground" fontSize="14">— sin señal —</text>
          )}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border bg-background px-3 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Voltaje</div>
          <div className="text-lg font-bold" style={{ color }}>{voltage.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">V</span></div>
        </div>
        <div className="rounded-md border bg-background px-3 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Frecuencia</div>
          <div className="text-lg font-bold">{connected ? frequency.toFixed(1) : "—"} <span className="text-xs font-normal text-muted-foreground">Hz</span></div>
        </div>
      </div>
      <style>{`@keyframes sineScroll { from { transform: translateX(0); } to { transform: translateX(-200px); } }`}</style>
    </div>
  );
}

function generateSinePath(width: number, height: number, amplitude: number, cycles: number): string {
  const mid = height / 2;
  const points: string[] = [];
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = mid - Math.sin((i / steps) * Math.PI * 2 * cycles) * amplitude;
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(" ");
}

/* ============================================================
 * ConcentricRings — Apple-watch-style stacked rings.
 * ============================================================ */
export function ConcentricRings({ pv, load, soc, pvMax = 5000, loadMax = 5000 }: {
  pv: number; load: number; soc: number; pvMax?: number; loadMax?: number;
}) {
  const rings = [
    { label: "Solar", value: pv, max: pvMax, color: "var(--solar)", unit: "W" },
    { label: "Consumo", value: load, max: loadMax, color: "var(--load)", unit: "W" },
    { label: "Batería", value: soc, max: 100, color: "var(--battery)", unit: "%" },
  ];
  const size = 220, stroke = 16, gap = 6;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 animate-fade-in">
      <h3 className="mb-3 font-semibold">Anillos de actividad</h3>
      <div className="flex items-center justify-center gap-6">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {rings.map((r, i) => {
              const radius = size / 2 - stroke / 2 - i * (stroke + gap);
              const c = 2 * Math.PI * radius;
              const ratio = Math.min(1, Math.max(0, r.value / r.max));
              const id = `ring-${i}`;
              return (
                <g key={i}>
                  <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke={r.color} strokeOpacity="0.18" strokeWidth={stroke} />
                  <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={r.color} stopOpacity="0.7" />
                      <stop offset="100%" stopColor={r.color} />
                    </linearGradient>
                  </defs>
                  <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - ratio)}
                    style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)",
                      filter: `drop-shadow(0 0 6px ${r.color})` }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="space-y-2">
          {rings.map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
              <span className="text-xs text-muted-foreground w-16">{r.label}</span>
              <span className="text-sm font-bold tabular-nums">{Math.round(r.value).toLocaleString()} {r.unit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
