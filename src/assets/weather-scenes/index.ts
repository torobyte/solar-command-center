// Auto-mapping of weather + time-of-day to background scene images.
import cubierto_madrugada from "./cubierto_madrugada.png.asset.json";
import cubierto_mediodia from "./cubierto_mediodia.png.asset.json";
import cubierto_tarde from "./cubierto_tarde.png.asset.json";
import cubierto_noche from "./cubierto_noche.png.asset.json";
import despejado_madrugada from "./despejado_madrugada.png.asset.json";
import despejado_mediodia from "./despejado_mediodia.png.asset.json";
import despejado_tarde from "./despejado_tarde.png.asset.json";
import despejado_noche from "./despejado_noche.png.asset.json";
import lluvia_madrugada from "./lluvia_madrugada.png.asset.json";
import lluvia_mediodia from "./lluvia_mediodia.png.asset.json";
import lluvia_tarde from "./lluvia_tarde.png.asset.json";
import lluvia_noche from "./lluvia_noche.png.asset.json";
import niebla_madrugada from "./niebla_madrugada.png.asset.json";
import niebla_mediodia from "./niebla_mediodia.png.asset.json";
import niebla_tarde from "./niebla_tarde.png.asset.json";
import niebla_noche from "./niebla_noche.png.asset.json";
import nieve_madrugada from "./nieve_madrugada.png.asset.json";
import nieve_mediodia from "./nieve_mediodia.png.asset.json";
import nieve_tarde from "./nieve_tarde.png.asset.json";
import nieve_noche from "./nieve_noche.png.asset.json";
import parcial_madrugada from "./parcial_nublado_madrugada.png.asset.json";
import parcial_mediodia from "./parcial_nublado_mediodia.png.asset.json";
import parcial_tarde from "./parcial_nublado_tarde.png.asset.json";
import parcial_noche from "./parcial_nublado_noche.png.asset.json";
import tormenta_madrugada from "./tormenta_madrugada.png.asset.json";
import tormenta_mediodia from "./tormenta_mediodia.png.asset.json";
import tormenta_tarde from "./tormenta_tarde.png.asset.json";
import tormenta_noche from "./tormenta_noche.png.asset.json";

export type WeatherKind =
  | "despejado"
  | "parcial"
  | "cubierto"
  | "niebla"
  | "lluvia"
  | "nieve"
  | "tormenta";

export type TimeOfDay = "madrugada" | "mediodia" | "tarde" | "noche";

const TABLE: Record<WeatherKind, Record<TimeOfDay, { url: string }>> = {
  despejado: { madrugada: despejado_madrugada, mediodia: despejado_mediodia, tarde: despejado_tarde, noche: despejado_noche },
  parcial:   { madrugada: parcial_madrugada,   mediodia: parcial_mediodia,   tarde: parcial_tarde,   noche: parcial_noche },
  cubierto:  { madrugada: cubierto_madrugada,  mediodia: cubierto_mediodia,  tarde: cubierto_tarde,  noche: cubierto_noche },
  niebla:    { madrugada: niebla_madrugada,    mediodia: niebla_mediodia,    tarde: niebla_tarde,    noche: niebla_noche },
  lluvia:    { madrugada: lluvia_madrugada,    mediodia: lluvia_mediodia,    tarde: lluvia_tarde,    noche: lluvia_noche },
  nieve:     { madrugada: nieve_madrugada,     mediodia: nieve_mediodia,     tarde: nieve_tarde,     noche: nieve_noche },
  tormenta:  { madrugada: tormenta_madrugada,  mediodia: tormenta_mediodia,  tarde: tormenta_tarde,  noche: tormenta_noche },
};

/** Open-Meteo WMO code → weather kind */
export function weatherCodeToKind(code: number): WeatherKind {
  if (code === 0 || code === 1) return "despejado";
  if (code === 2) return "parcial";
  if (code === 3) return "cubierto";
  if (code >= 45 && code <= 48) return "niebla";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "lluvia";
  if (code >= 71 && code <= 77) return "nieve";
  if (code >= 95) return "tormenta";
  return "cubierto";
}

/** Hora local → franja del día */
export function hourToTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return "madrugada";
  if (hour >= 11 && hour < 16) return "mediodia";
  if (hour >= 16 && hour < 20) return "tarde";
  return "noche";
}

export function pickWeatherSceneUrl(weatherCode: number, hour = new Date().getHours()): string {
  const kind = weatherCodeToKind(weatherCode);
  const tod = hourToTimeOfDay(hour);
  return TABLE[kind][tod].url;
}
