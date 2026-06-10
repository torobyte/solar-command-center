import { Battery, Sun, Plug, Zap, Home, Clock, BatteryCharging, ArrowRight } from "lucide-react";

/* ============================================================
 * Battery3D — animated 3D-ish battery cell with liquid level,
 * pulsing on discharge, lightning bolts on charge.
 * ============================================================ */
export function Battery3D({ soc, voltage, charging, powerW = 0, currentA = 0, temperatureC = 27 }: { soc: number; voltage: number; charging: boolean; powerW?: number; currentA?: number; temperatureC?: number }) {
  const pct = Math.max(0, Math.min(100, soc));
  const fillColor = pct > 60 ? "var(--success)" : pct > 30 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 truncate font-semibold"><Battery className="h-4 w-4 shrink-0 text-[var(--battery)]" /> <span className="truncate">Batería</span></h3>
        <span className="rounded-full bg-[var(--load)]/10 px-2.5 py-1 text-[10px] font-medium text-[var(--load)]">
          {charging ? "Cargando" : "Descargando"}
        </span>
      </div>
      <div className="flex flex-col items-center gap-4 @[500px]:flex-row @[500px]:gap-8">
        <div className="relative" style={{ width: 138, height: 232 }}>
          {/* terminal */}
          <div className="absolute left-1/2 top-0 h-4 w-12 -translate-x-1/2 rounded-t-md bg-foreground/40" />
          {/* body */}
          <div
            className="absolute inset-x-0 top-4 bottom-0 overflow-hidden rounded-[18px] border-2 border-foreground/20 shadow-[inset_0_10px_18px_rgba(255,255,255,0.35),inset_0_-8px_12px_rgba(0,0,0,0.08),0_18px_28px_rgba(15,23,42,0.10)]"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(241,245,249,0.98) 100%)" }}
          >
            {/* liquid */}
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
              style={{
                height: `${pct}%`,
                background: `linear-gradient(180deg, color-mix(in oklab, ${fillColor} 70%, var(--tint-base)) 0%, ${fillColor} 100%)`,
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
              <span className="text-4xl drop-shadow-md">{pct.toFixed(0)}%</span>
              <span className="text-[13px] opacity-70">{voltage.toFixed(1)} V</span>
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
          <Stat label="Corriente" value={`${currentA.toFixed(1)} A`} />
          <Stat label="Potencia" value={`${Math.round(powerW).toLocaleString()} W`} />
          <Stat label="Temperatura" value={`${temperatureC.toFixed(0)} °C`} />
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
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
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
      <div className="flex flex-col items-center gap-4 @[340px]:flex-row @[340px]:gap-6">
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
                background: `linear-gradient(180deg, color-mix(in oklab, ${color} 70%, var(--tint-base)) 0%, ${color} 100%)`,
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
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
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
          <text textAnchor="middle" y="4" className="fill-[#7c2d12]" fontSize="16" fontWeight="800">
            {Math.round(pv).toLocaleString()}
          </text>
          <text textAnchor="middle" y="20" className="fill-[#7c2d12]" fontSize="9" opacity="0.85">W</text>
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
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
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
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
      <h3 className="mb-3 font-semibold">Anillos de actividad</h3>
      <div className="flex flex-col items-center justify-center gap-4 @[360px]:flex-row @[360px]:gap-6">
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

/* ============================================================
 * SolarPanelsViz — animated tilted solar panel array with a
 * traveling sun, light rays hitting cells and energy ripple
 * proportional to current PV production.
 * ============================================================ */
export function SolarPanelsViz({ pv, pvMax = 5000 }: { pv: number; pvMax?: number }) {
  const ratio = Math.max(0, Math.min(1, pvMax > 0 ? pv / pvMax : 0));
  const active = pv > 1;
  const cells = Array.from({ length: 12 });
  return (
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Sun className="h-4 w-4 text-[var(--solar)]" /> Producción Solar
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: "color-mix(in oklab, var(--solar) 18%, transparent)",
            color: "var(--solar)",
          }}
        >
          {active ? "⚡ Generando" : "Sin sol"}
        </span>
      </div>

      <div className="flex flex-col items-stretch gap-4 @[520px]:grid @[520px]:grid-cols-[1.05fr_0.95fr] @[520px]:items-stretch">
        <div className="relative mx-auto h-[200px] w-full max-w-[320px] overflow-hidden rounded-xl border bg-gradient-to-b from-sky-200/60 via-sky-100/40 to-emerald-50/40 dark:from-slate-800/80 dark:via-slate-900/60 dark:to-slate-950">
          {/* Sun */}
          <div
            className="absolute h-12 w-12 rounded-full"
            style={{
              top: 18,
              left: `${20 + ratio * 55}%`,
              background: "radial-gradient(circle at 35% 35%, #fffbe6, var(--solar) 60%, #f59e0b)",
              boxShadow: `0 0 ${20 + ratio * 30}px var(--solar)`,
              transition: "left 1.2s ease, box-shadow 0.6s ease",
              animation: "solarSunFloat 6s ease-in-out infinite",
            }}
          />
          {/* Rays */}
          {active && (
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 200" preserveAspectRatio="none">
              {[0, 1, 2, 3, 4].map((i) => {
                const x = 70 + i * 45;
                return (
                  <line
                    key={i}
                    x1={`${20 + ratio * 55}%`}
                    y1="42"
                    x2={x}
                    y2="135"
                    stroke="var(--solar)"
                    strokeWidth="1.5"
                    strokeDasharray="3 5"
                    opacity={0.35 + ratio * 0.5}
                    style={{ animation: `solarRayFlow 1.6s linear ${i * 0.15}s infinite` }}
                  />
                );
              })}
            </svg>
          )}
          {/* Ground */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-emerald-700/20 to-transparent dark:from-emerald-900/30" />
          {/* Pole */}
          <div className="absolute bottom-2 left-1/2 h-12 w-1.5 -translate-x-1/2 rounded bg-foreground/40" />
          {/* Tilted panel array */}
          <div
            className="absolute left-1/2 bottom-12 -translate-x-1/2"
            style={{
              transform: "translateX(-50%) perspective(420px) rotateX(48deg)",
              transformOrigin: "bottom center",
            }}
          >
            <div
              className="grid grid-cols-4 gap-[3px] rounded-md border-2 border-slate-700/80 bg-slate-900 p-1 shadow-2xl"
              style={{ width: 200, height: 110 }}
            >
              {cells.map((_, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-[2px]"
                  style={{
                    background: `linear-gradient(135deg,
                      color-mix(in oklab, #1e3a8a ${100 - ratio * 35}%, var(--solar) ${ratio * 60}%) 0%,
                      color-mix(in oklab, #0f172a ${100 - ratio * 25}%, var(--solar) ${ratio * 45}%) 100%)`,
                    boxShadow: active ? `inset 0 0 6px color-mix(in oklab, var(--solar) ${ratio * 70}%, transparent)` : undefined,
                  }}
                >
                  {/* cell grid lines */}
                  <div className="absolute inset-0 opacity-50"
                    style={{ backgroundImage: "linear-gradient(transparent 49%, rgba(255,255,255,0.15) 50%, transparent 51%), linear-gradient(90deg, transparent 49%, rgba(255,255,255,0.15) 50%, transparent 51%)", backgroundSize: "100% 50%, 50% 100%" }} />
                  {/* shimmer */}
                  {active && (
                    <div
                      className="absolute inset-y-0 -left-1/2 w-1/2"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                        animation: `panelShimmer ${2 + (i % 4) * 0.3}s ease-in-out ${i * 0.12}s infinite`,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Watt label */}
          <div className="absolute right-2 top-2 rounded-md bg-card/80 px-2 py-1 text-right backdrop-blur-sm">
            <div className="text-[9px] uppercase text-muted-foreground">Potencia</div>
            <div className="text-base font-bold tabular-nums text-[var(--solar)]">
              {Math.round(pv).toLocaleString()} <span className="text-[10px] text-muted-foreground">W</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3">
          <Stat label="Potencia" value={`${Math.round(pv).toLocaleString()} W`} />
          <Stat label="Capacidad" value={`${Math.round(pvMax).toLocaleString()} W`} />
          <Stat label="Aprovechamiento" value={`${(ratio * 100).toFixed(0)} %`} />
          <Stat label="Estado" value={active ? "Produciendo" : "Inactivo"} />
        </div>
      </div>
      <button type="button" className="mt-4 inline-flex w-full items-center justify-between rounded-xl border bg-background px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <span>Ver análisis de producción</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <style>{`
        @keyframes solarSunFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-6px);} }
        @keyframes solarRayFlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -16; } }
        @keyframes panelShimmer { 0%{transform:translateX(0);} 100%{transform:translateX(400%);} }
      `}</style>
    </div>
  );
}

/* ============================================================
 * HouseLoadViz — animated house whose windows glow brighter and
 * a chimney/AC hum pulse intensifies with consumption.
 * ============================================================ */
export function HouseLoadViz({ load, loadMax = 5000 }: { load: number; loadMax?: number }) {
  const ratio = Math.max(0, Math.min(1, loadMax > 0 ? load / loadMax : 0));
  const active = load > 1;
  const level = ratio > 0.66 ? "alto" : ratio > 0.33 ? "medio" : "bajo";
  const glow = `color-mix(in oklab, var(--load) ${30 + ratio * 50}%, transparent)`;

  return (
    <div className="@container dashboard-card p-5 sm:p-6 animate-fade-in">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Home className="h-4 w-4 text-[var(--load)]" /> Consumo de la casa
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "color-mix(in oklab, var(--load) 18%, transparent)", color: "var(--load)" }}
        >
          {active ? "⚡ Consumiendo" : "En reposo"}
        </span>
      </div>

      <div className="flex flex-col items-stretch gap-4 @[520px]:grid @[520px]:grid-cols-[0.95fr_1.05fr] @[520px]:items-stretch">
        <div className="relative mx-auto h-[200px] w-full max-w-[320px] overflow-hidden rounded-xl border bg-gradient-to-b from-slate-100 via-slate-50 to-emerald-50/40 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-950">
          {/* night/day ambient circle */}
          <div className="absolute right-5 top-4 h-8 w-8 rounded-full bg-gradient-to-br from-yellow-200/70 to-orange-200/40 blur-[2px] dark:from-slate-700/60 dark:to-slate-800/40" />
          {/* horizon glow */}
          <div className="absolute bottom-7 left-0 right-0 h-10" style={{ background: `radial-gradient(ellipse at 50% 100%, ${glow}, transparent 70%)` }} />
          {/* ground */}
          <div className="absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-t from-slate-300/60 to-transparent dark:from-slate-800/60" />

          {/* Modern house */}
          <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="modernHouseFront" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
              <linearGradient id="modernHouseDark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <linearGradient id="modernGlass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fef3c7" stopOpacity={active ? 0.95 : 0.15} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={active ? 0.85 : 0.1} />
              </linearGradient>
              <filter id="modernShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>

            {/* shadow under house */}
            <ellipse cx="160" cy="178" rx="100" ry="6" fill="black" opacity="0.18" filter="url(#modernShadow)" />

            {/* Two-story modern house: lower wide block + upper narrower block */}
            {/* lower block */}
            <rect x="60" y="120" width="200" height="55" rx="3" fill="url(#modernHouseFront)" stroke="#94a3b8" strokeWidth="1" />
            {/* upper block (offset right for asymmetry) */}
            <rect x="130" y="78" width="130" height="42" rx="3" fill="url(#modernHouseDark)" stroke="#0f172a" strokeWidth="1" />
            {/* flat-roof slab cantilever */}
            <rect x="56" y="116" width="208" height="5" rx="1" fill="#0f172a" />
            <rect x="126" y="74" width="138" height="5" rx="1" fill="#0f172a" />

            {/* Large floor-to-ceiling window (lower left) — modern feature */}
            <rect x="70" y="128" width="46" height="42" rx="2" fill="url(#modernGlass)" stroke="#334155" strokeWidth="1.5" />
            <line x1="93" y1="128" x2="93" y2="170" stroke="#334155" strokeWidth="1" />
            {/* warm interior glow when active */}
            {active && (
              <rect x="70" y="128" width="46" height="42" rx="2" fill="none"
                style={{ filter: `drop-shadow(0 0 ${4 + ratio * 10}px var(--solar))` }} />
            )}

            {/* Door — slim modern */}
            <rect x="124" y="138" width="18" height="32" rx="1" fill="#0f172a" stroke="#020617" strokeWidth="1" />
            <circle cx="139" cy="156" r="1.2" fill="#fbbf24" />

            {/* Lower-right horizontal slit window */}
            <rect x="160" y="135" width="86" height="14" rx="1" fill="url(#modernGlass)" stroke="#334155" strokeWidth="1.2" />
            <line x1="189" y1="135" x2="189" y2="149" stroke="#334155" strokeWidth="0.8" />
            <line x1="218" y1="135" x2="218" y2="149" stroke="#334155" strokeWidth="0.8" />

            {/* Lower-right second slit */}
            <rect x="160" y="156" width="86" height="10" rx="1" fill="#1e293b" stroke="#0f172a" strokeWidth="0.8" opacity="0.85" />

            {/* Upper block large window grid (4 panes) */}
            {[0, 1, 2, 3].map((i) => {
              const x = 138 + i * 30;
              const on = i < Math.round(ratio * 4);
              return (
                <g key={i}>
                  <rect x={x} y="86" width="24" height="26" rx="1.5"
                    fill={on ? "url(#modernGlass)" : "#0f172a"}
                    stroke="#020617" strokeWidth="0.8"
                    style={{
                      transition: "fill 0.6s ease",
                      filter: on ? `drop-shadow(0 0 ${3 + ratio * 6}px var(--solar))` : undefined,
                    }} />
                </g>
              );
            })}

            {/* Slim rooftop solar/EV panel hint on flat roof */}
            <rect x="200" y="69" width="50" height="5" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />
            <rect x="200" y="69" width="50" height="5" rx="0.5" fill="url(#modernGlass)" opacity={active ? 0.4 : 0.15} />

            {/* Antenna / chimney slim */}
            <rect x="245" y="62" width="2.5" height="14" fill="#0f172a" />
          </svg>

          {/* Power badge */}
          <div className="absolute left-2 top-2 rounded-md bg-card/85 px-2 py-1 backdrop-blur-sm">
            <div className="text-[9px] uppercase text-muted-foreground">Carga</div>
            <div className="text-base font-bold tabular-nums text-[var(--load)]">
              {Math.round(load).toLocaleString()} <span className="text-[10px] text-muted-foreground">W</span>
            </div>
          </div>

          {/* Animated electric pulse line at base */}
          {active && (
            <div className="absolute bottom-2 left-4 right-4 h-0.5 overflow-hidden rounded-full bg-[var(--load)]/15">
              <div
                className="h-full"
                style={{
                  width: `${20 + ratio * 80}%`,
                  background: "linear-gradient(90deg, transparent, var(--load), transparent)",
                  animation: "houseLoadPulse 1.4s linear infinite",
                }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-3">
          <Stat label="Carga actual" value={`${Math.round(load).toLocaleString()} W`} />
          <Stat label="Capacidad" value={`${Math.round(loadMax).toLocaleString()} W`} />
          <Stat label="Uso" value={`${(ratio * 100).toFixed(0)} %`} />
          <Stat label="Nivel" value={level.charAt(0).toUpperCase() + level.slice(1)} />
        </div>
      </div>
      <div className="mt-4 rounded-xl border bg-background px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Consumo últimas 24 h</span>
          <span>{Math.max(0.2, load / 1000).toFixed(1)} kW</span>
        </div>
        <div className="flex h-16 items-end gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => {
            const base = 20 + ((i * 13) % 45);
            const peak = i > 16 && i < 21 ? 22 : 0;
            const h = Math.min(100, base + peak + ratio * 35);
            return <span key={i} className="flex-1 rounded-t-[3px] bg-[var(--load)]/90" style={{ height: `${h}%` }} />;
          })}
        </div>
      </div>
      <style>{`
        @keyframes houseLoadPulse { 0%{transform:translateX(-100%);} 100%{transform:translateX(200%);} }
      `}</style>
    </div>
  );
}

/* ============================================================
 * BackupTimeCard — runtime estimation for the battery bank.
 * Inputs: SOC (%), total bank kWh, usable DoD (%), current
 * load (W), and current PV (W). Net discharge = load - pv.
 * ============================================================ */


export function BackupTimeCard({
  soc, batteryKwh, usableDodPct, load, pv, batteryCount, batteryType,
  batteryChargeW = 0, gridConnected = false,
}: {
  soc: number;
  batteryKwh: number | null;
  usableDodPct: number | null;
  load: number;
  pv: number;
  batteryCount: number | null;
  batteryType: string | null;
  /** Potencia entrante a la batería (W). Si > 0 la batería se está cargando (PV o red). */
  batteryChargeW?: number;
  /** Indica si hay red activa supliendo carga. */
  gridConnected?: boolean;
}) {
  const dod = (usableDodPct ?? 80) / 100;
  const usableKwh = (batteryKwh ?? 0) * (Math.max(0, Math.min(100, soc)) / 100) * dod;
  const netDischargeW = Math.max(0, load - pv);
  const netDischargeKw = netDischargeW / 1000;
  const charging = batteryChargeW > 25 || pv > load + 5 || (gridConnected && netDischargeW < 5);

  let runtimeHours: number | null = null;
  if (!charging && netDischargeKw > 0.01 && usableKwh > 0) {
    runtimeHours = usableKwh / netDischargeKw;
  }

  const totalMinutes = runtimeHours != null ? Math.max(0, Math.round(runtimeHours * 60)) : 0;
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let etaLabel: string | null = null;
  if (runtimeHours != null && runtimeHours > 0 && runtimeHours < 24 * 30) {
    const eta = new Date(Date.now() + totalMinutes * 60_000);
    const now = new Date();
    const sameDay = eta.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = eta.toDateString() === tomorrow.toDateString();
    const time = eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    etaLabel = sameDay
      ? `hoy ${time}`
      : isTomorrow
        ? `mañana ${time}`
        : eta.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const color = runtimeHours == null
    ? "var(--success)"
    : runtimeHours > 12 ? "var(--success)"
    : runtimeHours > 4 ? "var(--warning)"
    : "var(--destructive)";

  const statusLabel = charging
    ? "Cargando"
    : runtimeHours == null ? "Sin datos"
    : runtimeHours > 12 ? "Holgado"
    : runtimeHours > 4 ? "Limitado"
    : "Crítico";

  const typeLabel: Record<string, string> = {
    lithium: "Litio (LiFePO4)", lithium_nmc: "Litio (NMC)",
    agm: "AGM", gel: "Gel", lead_acid: "Plomo-ácido", other: "Otra",
  };

  const ringPct = runtimeHours == null ? 0 : Math.min(100, (runtimeHours / 30) * 100);
  const r = 82;
  const c = 2 * Math.PI * r;
  const compact = days > 0
    ? `${days}d ${hours}h`
    : hours > 0
      ? `${hours}h ${minutes}m`
      : `${minutes}m`;

  const detailItems = [
    { icon: <Zap className="h-5 w-5" />, label: "Energía útil", value: `${usableKwh.toFixed(2)} kWh` },
    { icon: <ArrowRight className="h-5 w-5" />, label: "Descarga", value: charging ? "0 W" : `${Math.round(netDischargeW).toLocaleString()} W` },
    { icon: <Battery className="h-5 w-5" />, label: "SOC", value: `${Math.max(0, Math.min(100, soc)).toFixed(0)} %` },
    { icon: <BatteryCharging className="h-5 w-5" />, label: "DoD útil", value: `${(usableDodPct ?? 80).toFixed(0)} %` },
    {
      icon: <Battery className="h-5 w-5" />,
      label: "Banco",
      value: batteryCount && batteryCount > 0
        ? `${batteryCount}× ${typeLabel[batteryType ?? "other"] ?? "—"}`
        : "Sin configurar",
    },
    { icon: <Battery className="h-5 w-5" />, label: "Capacidad", value: batteryKwh ? `${batteryKwh.toFixed(2)} kWh` : "—" },
  ];

  return (
    <div
      className="@container dashboard-card h-full p-5 sm:p-6"
      style={{
        background: "color-mix(in oklab, var(--card) 90%, black 10%)",
        borderColor: "color-mix(in oklab, var(--border) 68%, var(--battery))",
        boxShadow: "0 0 0 1px color-mix(in oklab, var(--border) 35%, transparent), 0 22px 48px -28px color-mix(in oklab, black 55%, transparent)",
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border"
              style={{
                color: "var(--success)",
                borderColor: "color-mix(in oklab, var(--success) 30%, var(--border))",
                background: "color-mix(in oklab, var(--success) 10%, transparent)",
                boxShadow: "0 0 18px color-mix(in oklab, var(--success) 18%, transparent)",
              }}
            >
              <Clock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Tiempo de respaldo</h3>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">Autonomía restante del sistema</p>
            </div>
          </div>
        </div>

        <span
          className="inline-flex items-center rounded-2xl border px-4 py-2 text-sm font-medium"
          style={{
            color,
            borderColor: `color-mix(in oklab, ${color} 24%, var(--border))`,
            background: `color-mix(in oklab, ${color} 12%, transparent)`,
            boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 8%, transparent) inset`,
          }}
        >
          <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex justify-center">
          <div className="relative h-[250px] w-[250px] sm:h-[280px] sm:w-[280px]">
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90 overflow-visible">
              <circle cx="110" cy="110" r={r} fill="none" stroke="color-mix(in oklab, var(--success) 12%, var(--border))" strokeWidth="18" />
              <circle
                cx="110"
                cy="110"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - ringPct / 100)}
                style={{ filter: `drop-shadow(0 0 18px ${color})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              {charging ? (
                <>
                  <BatteryCharging className="h-10 w-10" style={{ color }} />
                  <div className="mt-3 text-lg font-semibold text-foreground">Cargando</div>
                  <div className="text-sm text-muted-foreground">Autonomía indefinida</div>
                </>
              ) : runtimeHours == null ? (
                <>
                  <div className="text-lg font-semibold text-foreground">Sin datos</div>
                  <div className="mt-1 max-w-[180px] text-sm text-muted-foreground">Configura el banco para calcular la autonomía.</div>
                </>
              ) : (
                <>
                  <div className="text-[52px] font-semibold leading-none tracking-tight sm:text-[60px]" style={{ color }}>{compact}</div>
                  <div className="mt-3 text-[14px] uppercase tracking-[0.08em] text-foreground">RESTANTES</div>
                </>
              )}
            </div>
          </div>
        </div>

        {charging ? (
          <div
            className="rounded-[24px] border px-5 py-4 text-center text-sm text-muted-foreground"
            style={{
              background: "color-mix(in oklab, var(--card) 86%, black 14%)",
              borderColor: "color-mix(in oklab, var(--border) 60%, transparent)",
            }}
          >
            La batería se está cargando{batteryChargeW > 25 && gridConnected && pv < load ? " desde la red" : pv > load ? " con la energía solar" : ""}.
          </div>
        ) : runtimeHours == null ? null : (
          <>
            <div
              className="grid grid-cols-3 overflow-hidden rounded-[26px] border"
              style={{
                background: "color-mix(in oklab, var(--card) 86%, black 14%)",
                borderColor: "color-mix(in oklab, var(--border) 60%, transparent)",
              }}
            >
              {[
                { icon: <Clock className="h-6 w-6" />, value: days, unit: "DÍAS" },
                { icon: <Clock className="h-6 w-6" />, value: hours, unit: "HORAS" },
                { icon: <Clock className="h-6 w-6" />, value: minutes, unit: "MIN" },
              ].map((item, index) => (
                <div
                  key={item.unit}
                  className="flex min-h-[140px] flex-col items-center justify-center px-4 py-6 text-center"
                  style={{
                    borderLeft: index === 0 ? "none" : "1px solid color-mix(in oklab, var(--border) 52%, transparent)",
                  }}
                >
                  <div
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border"
                    style={{
                      color: color,
                      borderColor: `color-mix(in oklab, ${color} 24%, var(--border))`,
                      background: `color-mix(in oklab, ${color} 8%, transparent)`,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div className="text-[52px] font-light leading-none tabular-nums" style={{ color }}>{item.value}</div>
                  <div className="mt-2 text-[14px] tracking-[0.06em] text-foreground">{item.unit}</div>
                </div>
              ))}
            </div>

            {etaLabel && (
              <div
                className="flex items-center justify-center gap-3 rounded-[22px] border px-5 py-4 text-center text-base"
                style={{
                  background: "color-mix(in oklab, var(--card) 86%, black 14%)",
                  borderColor: "color-mix(in oklab, var(--border) 60%, transparent)",
                }}
              >
                <Clock className="h-6 w-6" style={{ color }} />
                <span className="text-muted-foreground">Se agotará alrededor de</span>
                <span className="font-semibold" style={{ color }}>{etaLabel}</span>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {detailItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 rounded-[22px] border px-5 py-4"
              style={{
                background: "color-mix(in oklab, var(--card) 88%, black 12%)",
                borderColor: "color-mix(in oklab, var(--border) 56%, transparent)",
              }}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ color, background: `color-mix(in oklab, ${color} 10%, transparent)` }}>
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="truncate text-[15px] font-medium text-foreground sm:text-[17px]">{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

