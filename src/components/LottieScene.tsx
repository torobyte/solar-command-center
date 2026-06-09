import { memo } from "react";

/**
 * Escenas SVG animadas temáticas por tipo de tarjeta.
 * Mantenemos el nombre `LottieScene` por compatibilidad con los imports
 * existentes, pero la implementación ahora es 100% SVG inline (sin red,
 * sin paquetes externos) para garantizar que cada escena refleje
 * exactamente el contenido de la tarjeta.
 */

export type SceneKind =
  | "forest"
  | "sun"
  | "rain"
  | "snow"
  | "storm"
  | "clouds"
  | "battery"
  | "energy"
  | "shield";

/** Open-Meteo weather code → escena climática */
export function weatherToScene(code: number | null | undefined): SceneKind {
  if (code == null) return "clouds";
  if (code === 0 || code === 1) return "sun";
  if (code <= 3) return "clouds";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 95) return "storm";
  if (code >= 51 && code <= 82) return "rain";
  return "clouds";
}

function Forest() {
  // Bosque con árboles meciéndose
  const trees = [
    { x: 8, h: 70, delay: "0s", hue: "#15803d" },
    { x: 24, h: 90, delay: "0.4s", hue: "#166534" },
    { x: 42, h: 60, delay: "0.8s", hue: "#16a34a" },
    { x: 58, h: 95, delay: "0.2s", hue: "#14532d" },
    { x: 74, h: 75, delay: "0.6s", hue: "#15803d" },
    { x: 90, h: 65, delay: "1s", hue: "#16a34a" },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
      <defs>
        <style>{`@keyframes sway-${"forest"} { 0%,100% { transform: rotate(-2deg);} 50% { transform: rotate(2deg);} }`}</style>
      </defs>
      {trees.map((t, i) => (
        <g key={i} style={{ transformOrigin: `${t.x}px 100px`, animation: `sway-forest 4s ease-in-out infinite`, animationDelay: t.delay }}>
          <rect x={t.x - 1} y={100 - t.h * 0.35} width="2" height={t.h * 0.35} fill="#5b3a1d" />
          <polygon points={`${t.x},${100 - t.h} ${t.x - 8},${100 - t.h * 0.3} ${t.x + 8},${100 - t.h * 0.3}`} fill={t.hue} />
          <polygon points={`${t.x},${100 - t.h * 0.8} ${t.x - 10},${100 - t.h * 0.15} ${t.x + 10},${100 - t.h * 0.15}`} fill={t.hue} opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="sunGrad" cx="50%" cy="40%" r="40%">
          <stop offset="0%" stopColor="#fff7c2" />
          <stop offset="60%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <style>{`@keyframes sun-spin { to { transform: rotate(360deg);} } @keyframes sun-pulse { 0%,100%{opacity:.7} 50%{opacity:1} }`}</style>
      </defs>
      <circle cx="50" cy="40" r="35" fill="url(#sunGrad)" style={{ animation: "sun-pulse 3s ease-in-out infinite" }} />
      <g style={{ transformOrigin: "50px 40px", animation: "sun-spin 18s linear infinite" }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 12;
          const x1 = 50 + Math.cos(a) * 22;
          const y1 = 40 + Math.sin(a) * 22;
          const x2 = 50 + Math.cos(a) * 32;
          const y2 = 40 + Math.sin(a) * 32;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round" />;
        })}
      </g>
    </svg>
  );
}

function Rain() {
  const drops = Array.from({ length: 22 }).map((_, i) => ({
    x: (i * 97) % 100,
    delay: `${(i * 0.13) % 1.4}s`,
    dur: `${0.8 + (i % 5) * 0.15}s`,
  }));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <style>{`@keyframes rainfall { 0% { transform: translateY(-20px); opacity:0 } 15% { opacity: 1 } 100% { transform: translateY(110px); opacity: 0 } }`}</style>
      </defs>
      {drops.map((d, i) => (
        <line key={i} x1={d.x} y1="0" x2={d.x - 2} y2="6" stroke="#60a5fa" strokeWidth="0.8" strokeLinecap="round"
          style={{ animation: `rainfall ${d.dur} linear infinite`, animationDelay: d.delay }} />
      ))}
    </svg>
  );
}

function Snow() {
  const flakes = Array.from({ length: 18 }).map((_, i) => ({
    x: (i * 71) % 100,
    delay: `${(i * 0.21) % 3}s`,
    dur: `${4 + (i % 4)}s`,
    r: 0.8 + (i % 3) * 0.4,
  }));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <style>{`@keyframes snowfall { 0% { transform: translateY(-10px) translateX(0); opacity:0 } 15% { opacity:1 } 100% { transform: translateY(110px) translateX(8px); opacity:0 } }`}</style>
      </defs>
      {flakes.map((f, i) => (
        <circle key={i} cx={f.x} cy="0" r={f.r} fill="#ffffff" style={{ animation: `snowfall ${f.dur} linear infinite`, animationDelay: f.delay }} />
      ))}
    </svg>
  );
}

function Storm() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <style>{`
          @keyframes flash { 0%, 92%, 100% { opacity: 0 } 94%, 97% { opacity: 1 } }
          @keyframes rainfall2 { 0% { transform: translateY(-20px); opacity:0 } 15% { opacity:.8 } 100% { transform: translateY(110px); opacity:0 } }
        `}</style>
      </defs>
      <ellipse cx="50" cy="30" rx="40" ry="14" fill="#475569" opacity="0.85" />
      <ellipse cx="35" cy="36" rx="22" ry="10" fill="#334155" opacity="0.9" />
      <polygon points="48,40 42,60 50,60 44,80 60,55 52,55 58,40" fill="#fde047" style={{ animation: "flash 3s ease-in-out infinite" }} />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1={10 + i * 7} y1="45" x2={9 + i * 7} y2="51" stroke="#60a5fa" strokeWidth="0.7"
          style={{ animation: `rainfall2 ${0.9 + (i % 4) * 0.2}s linear infinite`, animationDelay: `${(i * 0.13) % 1.2}s` }} />
      ))}
    </svg>
  );
}

function Clouds() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <style>{`@keyframes drift1 { 0% { transform: translateX(-30px);} 100% { transform: translateX(120px);} } @keyframes drift2 { 0% { transform: translateX(-50px);} 100% { transform: translateX(120px);} }`}</style>
      </defs>
      <g style={{ animation: "drift1 22s linear infinite" }}>
        <ellipse cx="20" cy="28" rx="14" ry="6" fill="#e2e8f0" />
        <ellipse cx="28" cy="25" rx="10" ry="5" fill="#f1f5f9" />
      </g>
      <g style={{ animation: "drift2 30s linear infinite" }}>
        <ellipse cx="40" cy="55" rx="18" ry="7" fill="#cbd5e1" />
        <ellipse cx="50" cy="51" rx="12" ry="6" fill="#e2e8f0" />
      </g>
      <g style={{ animation: "drift1 26s linear infinite", animationDelay: "-8s" }}>
        <ellipse cx="70" cy="38" rx="14" ry="6" fill="#e2e8f0" />
      </g>
    </svg>
  );
}

function Battery() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <style>{`
          @keyframes battery-fill { 0% { height: 10px } 50% { height: 60px } 100% { height: 10px } }
          @keyframes spark { 0%,100% { opacity: 0 } 50% { opacity: 1 } }
        `}</style>
      </defs>
      <g transform="translate(35 18)">
        <rect x="0" y="0" width="30" height="62" rx="4" fill="none" stroke="#22c55e" strokeWidth="1.5" />
        <rect x="11" y="-3" width="8" height="3" rx="1" fill="#22c55e" />
        <rect x="3" y="59" width="24" height="0" fill="#22c55e" style={{ animation: "battery-fill 3s ease-in-out infinite", transformOrigin: "bottom" }}>
          <animate attributeName="height" values="6;52;6" dur="3s" repeatCount="indefinite" />
          <animate attributeName="y" values="53;7;53" dur="3s" repeatCount="indefinite" />
        </rect>
      </g>
      <g stroke="#fde047" strokeWidth="1.3" strokeLinecap="round" style={{ animation: "spark 1.4s ease-in-out infinite" }}>
        <polyline points="20,50 26,55 22,58 30,64" fill="none" />
        <polyline points="78,46 72,52 76,55 70,62" fill="none" />
      </g>
    </svg>
  );
}

function Energy() {
  // Líneas eléctricas / rayos
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <style>{`
          @keyframes bolt { 0%,100% { opacity: 0.2; transform: scale(.95) } 50% { opacity: 1; transform: scale(1.05) } }
          @keyframes flow { 0% { stroke-dashoffset: 40 } 100% { stroke-dashoffset: 0 } }
        `}</style>
      </defs>
      <g style={{ transformOrigin: "50px 50px", animation: "bolt 1.8s ease-in-out infinite" }}>
        <polygon points="48,12 32,52 46,52 40,86 66,42 50,42 58,12" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8" />
      </g>
      <g fill="none" stroke="#60a5fa" strokeWidth="0.8" strokeDasharray="3 3" style={{ animation: "flow 1.5s linear infinite" }}>
        <path d="M5,30 Q30,20 50,30 T95,30" />
        <path d="M5,70 Q30,80 50,70 T95,70" />
      </g>
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <style>{`
          @keyframes shield-pulse { 0%,100% { transform: scale(1); opacity:.85 } 50% { transform: scale(1.06); opacity:1 } }
          @keyframes ring { 0% { r: 22; opacity: .8 } 100% { r: 44; opacity: 0 } }
        `}</style>
      </defs>
      <g style={{ transformOrigin: "50px 50px", animation: "shield-pulse 2.4s ease-in-out infinite" }}>
        <path d="M50 18 L78 28 L78 52 Q78 74 50 84 Q22 74 22 52 L22 28 Z" fill="url(#shieldGrad)" stroke="#0ea5e9" strokeWidth="1" />
        <path d="M40 50 L48 58 L62 42" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="50" cy="50" r="22" fill="none" stroke="#38bdf8" strokeWidth="0.8" style={{ animation: "ring 2.4s ease-out infinite" }} />
    </svg>
  );
}

const SCENES: Record<SceneKind, () => JSX.Element> = {
  forest: Forest,
  sun: Sun,
  rain: Rain,
  snow: Snow,
  storm: Storm,
  clouds: Clouds,
  battery: Battery,
  energy: Energy,
  shield: Shield,
};

function LottieSceneImpl({
  kind,
  opacity = 0.32,
  className = "",
}: { kind: SceneKind; opacity?: number; className?: string }) {
  const Scene = SCENES[kind] ?? Clouds;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <Scene />
    </div>
  );
}

export const LottieScene = memo(LottieSceneImpl);
