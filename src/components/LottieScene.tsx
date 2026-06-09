import React, { memo } from "react";

/**
 * Escenas SVG animadas, ricas y temáticas por tipo de tarjeta.
 * Cada escena combina varias capas (cielo, parallax, partículas, brillos)
 * para lograr un acabado más cinematográfico y realista,
 * manteniendo todo inline (sin red ni dependencias).
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

/** Estilos globales para keyframes (se inyectan una sola vez por escena). */
const KF = `
@keyframes ls-sway-a { 0%,100%{transform:rotate(-2.5deg)} 50%{transform:rotate(2.5deg)} }
@keyframes ls-sway-b { 0%,100%{transform:rotate(2deg)} 50%{transform:rotate(-2deg)} }
@keyframes ls-drift-slow { 0%{transform:translateX(-40px)} 100%{transform:translateX(140px)} }
@keyframes ls-drift-mid { 0%{transform:translateX(-30px)} 100%{transform:translateX(130px)} }
@keyframes ls-drift-fast { 0%{transform:translateX(-20px)} 100%{transform:translateX(120px)} }
@keyframes ls-sun-rays { 0%{opacity:.55;transform:scale(1)} 50%{opacity:.95;transform:scale(1.04)} 100%{opacity:.55;transform:scale(1)} }
@keyframes ls-sun-rot { to { transform: rotate(360deg);} }
@keyframes ls-rain { 0%{transform:translateY(-12px);opacity:0} 12%{opacity:.85} 100%{transform:translateY(120px);opacity:0} }
@keyframes ls-ripple { 0%{transform:scale(.2);opacity:.8} 100%{transform:scale(1.6);opacity:0} }
@keyframes ls-snow { 0%{transform:translate(0,-12px);opacity:0} 12%{opacity:1} 100%{transform:translate(10px,120px);opacity:0} }
@keyframes ls-flash { 0%,90%,100%{opacity:0} 92%,94%{opacity:.95} 95%,97%{opacity:0} 98%{opacity:.7} }
@keyframes ls-bolt-glow { 0%,100%{opacity:.15} 50%{opacity:.7} }
@keyframes ls-batt-fill { 0%{height:8;y:54} 50%{height:46;y:16} 100%{height:8;y:54} }
@keyframes ls-spark { 0%,100%{opacity:0;transform:translateY(0)} 40%{opacity:1} 100%{transform:translateY(-6px)} }
@keyframes ls-flow-dash { to { stroke-dashoffset: -60; } }
@keyframes ls-pulse-soft { 0%,100%{opacity:.6} 50%{opacity:1} }
@keyframes ls-ring { 0%{r:18;opacity:.85} 100%{r:46;opacity:0} }
@keyframes ls-shield-breath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
@keyframes ls-particle { 0%{transform:translateY(20px);opacity:0} 30%{opacity:1} 100%{transform:translateY(-30px);opacity:0} }
@keyframes ls-haze { 0%,100%{opacity:.35} 50%{opacity:.65} }
`;

function Style() {
  return <style>{KF}</style>;
}

/* ---------------- Forest ---------------- */
function Forest() {
  const back = [
    { x: 6, h: 55, hue: "#14532d", d: "0s" },
    { x: 18, h: 70, hue: "#15803d", d: "0.4s" },
    { x: 32, h: 50, hue: "#166534", d: "0.8s" },
    { x: 46, h: 75, hue: "#14532d", d: "0.2s" },
    { x: 60, h: 58, hue: "#15803d", d: "0.6s" },
    { x: 74, h: 68, hue: "#166534", d: "1.0s" },
    { x: 88, h: 52, hue: "#14532d", d: "0.3s" },
  ];
  const front = [
    { x: 12, h: 86, hue: "#166534", d: "0.1s" },
    { x: 38, h: 96, hue: "#14532d", d: "0.5s" },
    { x: 64, h: 90, hue: "#166534", d: "0.9s" },
    { x: 86, h: 82, hue: "#15803d", d: "0.3s" },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="skyForest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#052e16" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="forestSun" cx="80%" cy="15%" r="40%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fef3c7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#skyForest)" />
      <circle cx="82" cy="18" r="28" fill="url(#forestSun)" style={{ animation: "ls-haze 4s ease-in-out infinite" }} />
      {/* Montañas lejanas */}
      <polygon points="0,78 25,55 45,72 70,48 100,72 100,100 0,100" fill="#064e3b" opacity="0.45" />
      <polygon points="0,86 20,72 38,82 60,68 82,84 100,76 100,100 0,100" fill="#022c22" opacity="0.6" />
      {/* Árboles de fondo */}
      {back.map((t, i) => (
        <g key={`b${i}`} style={{ transformOrigin: `${t.x}px 100px`, animation: `ls-sway-a 5s ease-in-out infinite`, animationDelay: t.d }}>
          <rect x={t.x - 0.6} y={100 - t.h * 0.35} width="1.2" height={t.h * 0.35} fill="#3f2a14" />
          <polygon points={`${t.x},${100 - t.h} ${t.x - 6},${100 - t.h * 0.35} ${t.x + 6},${100 - t.h * 0.35}`} fill={t.hue} opacity="0.85" />
          <polygon points={`${t.x},${100 - t.h * 0.75} ${t.x - 7.5},${100 - t.h * 0.2} ${t.x + 7.5},${100 - t.h * 0.2}`} fill={t.hue} opacity="0.7" />
        </g>
      ))}
      {/* Árboles delanteros */}
      {front.map((t, i) => (
        <g key={`f${i}`} style={{ transformOrigin: `${t.x}px 100px`, animation: `ls-sway-b 4s ease-in-out infinite`, animationDelay: t.d }}>
          <rect x={t.x - 1} y={100 - t.h * 0.32} width="2" height={t.h * 0.32} fill="#5b3a1d" />
          <polygon points={`${t.x},${100 - t.h} ${t.x - 9},${100 - t.h * 0.32} ${t.x + 9},${100 - t.h * 0.32}`} fill={t.hue} />
          <polygon points={`${t.x},${100 - t.h * 0.78} ${t.x - 11},${100 - t.h * 0.18} ${t.x + 11},${100 - t.h * 0.18}`} fill={t.hue} />
          <polygon points={`${t.x},${100 - t.h * 0.55} ${t.x - 8},${100 - t.h * 0.1} ${t.x + 8},${100 - t.h * 0.1}`} fill={t.hue} opacity="0.9" />
        </g>
      ))}
      {/* Partículas (hojas/polen) */}
      {Array.from({ length: 6 }).map((_, i) => (
        <circle key={i} cx={10 + i * 14} cy={80} r="0.7" fill="#a7f3d0"
          style={{ animation: `ls-particle ${5 + (i % 3)}s ease-in-out infinite`, animationDelay: `${i * 0.6}s` }} />
      ))}
    </svg>
  );
}

/* ---------------- Sun ---------------- */
function Sun() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <radialGradient id="sky-sun" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#fef9c3" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="core-sun" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="55%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#sky-sun)" />
      {/* Rayos largos animados */}
      <g style={{ transformOrigin: "50px 50px", animation: "ls-sun-rot 40s linear infinite", opacity: 0.45 }}>
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 16;
          const x = 50 + Math.cos(a) * 80;
          const y = 50 + Math.sin(a) * 80;
          return <line key={i} x1="50" y1="50" x2={x} y2={y} stroke="#fde68a" strokeWidth="0.5" />;
        })}
      </g>
      <g style={{ animation: "ls-sun-rays 4s ease-in-out infinite", transformOrigin: "50px 50px" }}>
        <circle cx="50" cy="50" r="40" fill="url(#core-sun)" />
      </g>
      <circle cx="50" cy="50" r="14" fill="#fffbeb" opacity="0.9" />
      <circle cx="46" cy="46" r="5" fill="#ffffff" opacity="0.7" />
      {/* Lens flare suave */}
      <circle cx="78" cy="22" r="6" fill="#fde68a" opacity="0.35" />
      <circle cx="22" cy="78" r="4" fill="#fcd34d" opacity="0.25" />
    </svg>
  );
}

/* ---------------- Rain ---------------- */
function Rain() {
  const drops = Array.from({ length: 28 }).map((_, i) => ({
    x: (i * 37 + 3) % 100,
    delay: `${(i * 0.11) % 1.6}s`,
    dur: `${0.7 + ((i * 7) % 5) * 0.12}s`,
    len: 6 + (i % 3) * 2,
  }));
  const ripples = Array.from({ length: 5 }).map((_, i) => ({
    x: 12 + i * 19, delay: `${i * 0.5}s`,
  }));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="rain-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#rain-sky)" />
      {/* Nubes pesadas */}
      <ellipse cx="30" cy="18" rx="28" ry="9" fill="#64748b" opacity="0.85" />
      <ellipse cx="55" cy="14" rx="22" ry="8" fill="#94a3b8" opacity="0.75" />
      <ellipse cx="78" cy="20" rx="24" ry="9" fill="#475569" opacity="0.8" />
      {drops.map((d, i) => (
        <line key={i} x1={d.x} y1="20" x2={d.x - 1.5} y2={20 + d.len} stroke="#bfdbfe" strokeWidth="0.7" strokeLinecap="round"
          style={{ animation: `ls-rain ${d.dur} linear infinite`, animationDelay: d.delay, opacity: 0.85 }} />
      ))}
      {/* Charcos con ondas */}
      {ripples.map((r, i) => (
        <g key={i} style={{ transformOrigin: `${r.x}px 92px` }}>
          <ellipse cx={r.x} cy="92" rx="3" ry="0.8" fill="none" stroke="#93c5fd" strokeWidth="0.4"
            style={{ animation: `ls-ripple 1.6s ease-out infinite`, animationDelay: r.delay, transformOrigin: `${r.x}px 92px` }} />
        </g>
      ))}
    </svg>
  );
}

/* ---------------- Snow ---------------- */
function Snow() {
  const flakes = Array.from({ length: 22 }).map((_, i) => ({
    x: (i * 53 + 4) % 100,
    delay: `${(i * 0.21) % 4}s`,
    dur: `${5 + (i % 4)}s`,
    r: 0.7 + (i % 4) * 0.35,
  }));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="snow-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#snow-sky)" />
      {/* Manto de nieve abajo */}
      <path d="M0,90 Q20,82 40,88 T80,86 T100,90 L100,100 L0,100 Z" fill="#f8fafc" opacity="0.85" />
      <path d="M0,94 Q25,88 50,92 T100,93 L100,100 L0,100 Z" fill="#ffffff" />
      {flakes.map((f, i) => (
        <circle key={i} cx={f.x} cy="0" r={f.r} fill="#ffffff"
          style={{ animation: `ls-snow ${f.dur} linear infinite`, animationDelay: f.delay, filter: "drop-shadow(0 0 1px rgba(255,255,255,0.8))" }} />
      ))}
    </svg>
  );
}

/* ---------------- Storm ---------------- */
function Storm() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="storm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#storm-sky)" />
      <ellipse cx="30" cy="22" rx="30" ry="11" fill="#334155" opacity="0.95" />
      <ellipse cx="60" cy="18" rx="28" ry="10" fill="#475569" opacity="0.9" />
      <ellipse cx="82" cy="24" rx="22" ry="9" fill="#1e293b" opacity="0.95" />
      {/* Resplandor del rayo */}
      <rect width="100" height="100" fill="#fef9c3" opacity="0" style={{ animation: "ls-flash 4s ease-in-out infinite" }} />
      {/* Rayo */}
      <g style={{ animation: "ls-flash 4s ease-in-out infinite" }}>
        <polygon points="52,30 42,58 50,58 44,82 64,52 54,52 60,30" fill="#fde047" stroke="#fbbf24" strokeWidth="0.6" />
        <polygon points="52,30 42,58 50,58 44,82 64,52 54,52 60,30" fill="none" stroke="#fffbeb" strokeWidth="0.4" />
      </g>
      {/* Lluvia fuerte */}
      {Array.from({ length: 20 }).map((_, i) => (
        <line key={i} x1={5 + i * 5} y1="30" x2={4 + i * 5} y2="40" stroke="#93c5fd" strokeWidth="0.6"
          style={{ animation: `ls-rain ${0.7 + (i % 4) * 0.15}s linear infinite`, animationDelay: `${(i * 0.09) % 1.3}s`, opacity: 0.7 }} />
      ))}
    </svg>
  );
}

/* ---------------- Clouds ---------------- */
function Clouds() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="cloud-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cloud-sky)" />
      <g style={{ animation: "ls-drift-slow 28s linear infinite" }}>
        <ellipse cx="18" cy="28" rx="16" ry="6" fill="#f8fafc" />
        <ellipse cx="28" cy="24" rx="11" ry="5" fill="#ffffff" />
        <ellipse cx="14" cy="30" rx="9" ry="4" fill="#e2e8f0" />
      </g>
      <g style={{ animation: "ls-drift-mid 22s linear infinite", animationDelay: "-6s" }}>
        <ellipse cx="55" cy="54" rx="20" ry="7" fill="#cbd5e1" opacity="0.9" />
        <ellipse cx="63" cy="50" rx="13" ry="6" fill="#e2e8f0" />
        <ellipse cx="48" cy="56" rx="10" ry="5" fill="#f1f5f9" />
      </g>
      <g style={{ animation: "ls-drift-fast 18s linear infinite", animationDelay: "-3s" }}>
        <ellipse cx="72" cy="36" rx="14" ry="6" fill="#ffffff" />
        <ellipse cx="80" cy="33" rx="9" ry="4" fill="#e2e8f0" />
      </g>
    </svg>
  );
}

/* ---------------- Battery ---------------- */
function Battery() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="batt-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#bbf7d0" />
        </linearGradient>
        <radialGradient id="batt-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="40" fill="url(#batt-glow)" style={{ animation: "ls-pulse-soft 2.6s ease-in-out infinite" }} />
      {/* Cuerpo */}
      <g>
        <rect x="36" y="14" width="28" height="64" rx="5" fill="none" stroke="#22c55e" strokeWidth="1.6" />
        <rect x="46" y="11" width="8" height="3" rx="1" fill="#22c55e" />
        {/* Llenado animado (SMIL para height) */}
        <rect x="38.5" y="54" width="23" height="8" fill="url(#batt-fill)" rx="2">
          <animate attributeName="height" values="8;46;8" dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="y" values="54;16;54" dur="3.2s" repeatCount="indefinite" />
        </rect>
        {/* Brillo del electrolito */}
        <rect x="40" y="20" width="3" height="50" rx="1.5" fill="#ffffff" opacity="0.25" />
      </g>
      {/* Chispas */}
      <g stroke="#fde047" strokeWidth="1" strokeLinecap="round" fill="none">
        <polyline points="20,52 25,56 22,60 28,66" style={{ animation: "ls-spark 1.6s ease-in-out infinite" }} />
        <polyline points="80,46 75,52 78,55 72,62" style={{ animation: "ls-spark 1.6s ease-in-out infinite", animationDelay: "0.5s" }} />
        <polyline points="18,30 24,34 21,38" style={{ animation: "ls-spark 1.6s ease-in-out infinite", animationDelay: "1s" }} />
      </g>
      {/* Rayo central */}
      <polygon points="50,28 46,46 52,46 48,64 56,44 50,44 54,28" fill="#fff" opacity="0.85" />
    </svg>
  );
}

/* ---------------- Energy ---------------- */
function Energy() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <radialGradient id="energy-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bolt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill="url(#energy-glow)" style={{ animation: "ls-pulse-soft 2.2s ease-in-out infinite" }} />
      {/* Líneas eléctricas de flujo */}
      <g fill="none" strokeWidth="0.9" strokeLinecap="round">
        <path d="M2,28 Q25,18 50,28 T98,28" stroke="#38bdf8" strokeDasharray="4 4"
          style={{ animation: "ls-flow-dash 1.6s linear infinite", opacity: 0.85 }} />
        <path d="M2,72 Q25,82 50,72 T98,72" stroke="#22d3ee" strokeDasharray="4 4"
          style={{ animation: "ls-flow-dash 2s linear infinite reverse", opacity: 0.85 }} />
        <path d="M2,50 Q25,40 50,50 T98,50" stroke="#a5f3fc" strokeDasharray="3 6"
          style={{ animation: "ls-flow-dash 1.2s linear infinite", opacity: 0.6 }} />
      </g>
      {/* Rayo central */}
      <g style={{ transformOrigin: "50px 50px", animation: "ls-bolt-glow 1.8s ease-in-out infinite" }}>
        <polygon points="50,10 34,50 48,50 42,90 68,42 52,42 60,10" fill="url(#bolt-grad)" stroke="#f59e0b" strokeWidth="0.6" />
        <polygon points="50,10 34,50 48,50 42,90 68,42 52,42 60,10" fill="none" stroke="#fffbeb" strokeWidth="0.4" opacity="0.7" />
      </g>
      {/* Partículas */}
      {Array.from({ length: 6 }).map((_, i) => (
        <circle key={i} cx={10 + i * 16} cy={80} r="0.9" fill="#fde68a"
          style={{ animation: `ls-particle ${3 + (i % 3) * 0.6}s ease-in-out infinite`, animationDelay: `${i * 0.5}s` }} />
      ))}
    </svg>
  );
}

/* ---------------- Shield ---------------- */
function Shield() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Style />
      <defs>
        <linearGradient id="shield-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="60%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <radialGradient id="shield-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill="url(#shield-glow)" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#38bdf8" strokeWidth="0.6"
        style={{ animation: "ls-ring 2.6s ease-out infinite" }} />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#7dd3fc" strokeWidth="0.5"
        style={{ animation: "ls-ring 2.6s ease-out infinite", animationDelay: "1.2s" }} />
      <g style={{ transformOrigin: "50px 50px", animation: "ls-shield-breath 2.6s ease-in-out infinite" }}>
        <path d="M50 14 L80 26 L80 52 Q80 76 50 88 Q20 76 20 52 L20 26 Z"
          fill="url(#shield-grad)" stroke="#0284c7" strokeWidth="1" />
        {/* Brillo de cristal */}
        <path d="M50 14 L80 26 L80 36 Q60 32 50 44 Q40 32 20 36 L20 26 Z" fill="#ffffff" opacity="0.18" />
        {/* Check */}
        <path d="M38 50 L47 60 L64 40" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

const SCENES: Record<SceneKind, () => React.ReactElement> = {
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
  opacity = 0.4,
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
