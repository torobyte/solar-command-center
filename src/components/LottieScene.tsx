import { useEffect, useState, memo } from "react";
import Lottie from "lottie-react";

/**
 * Catálogo de animaciones Lottie ambientales por contexto.
 * Cargamos JSON públicos de LottieFiles community CDN. Si falla la red
 * la tarjeta sigue renderizando sin fondo (no es bloqueante).
 *
 * Para cambiar la animación de una escena solo reemplaza la URL aquí.
 */
const SCENE_URLS: Record<SceneKind, string> = {
  forest:    "https://assets10.lottiefiles.com/packages/lf20_obhph3sh.json", // hojas / bosque
  sun:       "https://assets2.lottiefiles.com/packages/lf20_kkflmtur.json",  // sol brillante
  rain:      "https://assets9.lottiefiles.com/packages/lf20_jmgekfqg.json",  // lluvia
  snow:      "https://assets4.lottiefiles.com/packages/lf20_KUFdSE.json",    // nieve
  storm:     "https://assets3.lottiefiles.com/packages/lf20_qjosqr1c.json",  // tormenta
  clouds:    "https://assets10.lottiefiles.com/packages/lf20_jR229r.json",   // nubes
  battery:   "https://assets3.lottiefiles.com/packages/lf20_GofK09iPAE.json",// batería energía
  energy:    "https://assets1.lottiefiles.com/packages/lf20_5tkzkblw.json",  // electricidad
  shield:    "https://assets3.lottiefiles.com/packages/lf20_touohxv0.json",  // escudo respaldo
};

export type SceneKind = "forest" | "sun" | "rain" | "snow" | "storm" | "clouds" | "battery" | "energy" | "shield";

const cache = new Map<string, unknown>();

function LottieSceneImpl({
  kind,
  opacity = 0.35,
  className = "",
}: { kind: SceneKind; opacity?: number; className?: string }) {
  const [data, setData] = useState<unknown | null>(() => cache.get(SCENE_URLS[kind]) ?? null);

  useEffect(() => {
    const url = SCENE_URLS[kind];
    if (cache.has(url)) { setData(cache.get(url)); return; }
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) { cache.set(url, j); setData(j); } })
      .catch(() => { /* silencio: fallback sin fondo */ });
    return () => { alive = false; };
  }, [kind]);

  if (!data) return null;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Lottie animationData={data as any} loop autoplay rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export const LottieScene = memo(LottieSceneImpl);

/** Map weather code (Open-Meteo) → escena */
export function weatherToScene(code: number | null | undefined): SceneKind {
  if (code == null) return "clouds";
  if (code === 0 || code === 1) return "sun";
  if (code <= 3) return "clouds";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 95) return "storm";
  if (code >= 51 && code <= 82) return "rain";
  return "clouds";
}
