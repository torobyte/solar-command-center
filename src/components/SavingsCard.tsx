import { useEffect, useState } from "react";
import { Coins, TrendingUp, Calendar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  siteId: string;
  pvW: number | null;
  /** kWh price (per kWh in display currency units, e.g. 180 CLP, 0.18 USD). */
  energyPrice: number | null;
  /** Feed-in price for exported kWh. Optional. */
  feedInPrice?: number | null;
  currency?: string | null;
  /** Estimated daily kWh from forecast (optional, for projections). */
  forecastDailyKwh?: number | null;
}

function fmt(n: number, currency: string): string {
  try {
    const isZeroDec = ["CLP", "JPY", "KRW", "COP", "VND"].includes(currency);
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: isZeroDec ? 0 : 2,
      minimumFractionDigits: isZeroDec ? 0 : 0,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/**
 * Estimates energy savings in money. Combines:
 *  - Live "saving now" rate from current PV power × price.
 *  - Today's accumulated savings derived from summing telemetry pv_input_power.
 *  - Monthly / yearly projection from accumulated daily averages.
 */
export function SavingsCard({ siteId, pvW, energyPrice, feedInPrice, currency, forecastDailyKwh }: Props) {
  const cur = currency || "CLP";
  const price = energyPrice ?? 0;
  const [todayKwh, setTodayKwh] = useState<number | null>(null);
  const [monthKwh, setMonthKwh] = useState<number | null>(null);

  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;
    (async () => {
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const startMonth = new Date(startToday.getFullYear(), startToday.getMonth(), 1);

      // Fetch samples for today + this month in one query, then split.
      const { data } = await supabase
        .from("telemetry_samples")
        .select("recorded_at, pv_input_power")
        .eq("site_id", siteId)
        .gte("recorded_at", startMonth.toISOString())
        .order("recorded_at", { ascending: true })
        .limit(1000);
      if (cancelled || !data) return;

      // Trapezoidal-ish integration: Σ (pv_W × Δt_h) / 1000 = kWh
      let kwhToday = 0;
      let kwhMonth = 0;
      let prevT: number | null = null;
      let prevW = 0;
      for (const row of data) {
        const t = new Date(row.recorded_at as string).getTime();
        const w = Math.max(0, Number(row.pv_input_power ?? 0));
        if (prevT != null) {
          const dh = Math.min(1, (t - prevT) / 3_600_000); // cap gaps at 1h to avoid spikes
          const kwh = ((prevW + w) / 2) * dh / 1000;
          kwhMonth += kwh;
          if (t >= startToday.getTime()) kwhToday += kwh;
        }
        prevT = t;
        prevW = w;
      }
      setTodayKwh(kwhToday);
      setMonthKwh(kwhMonth);
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  if (!price) {
    return (
      <div className="rounded-xl border bg-card p-4 sm:p-5 animate-fade-in h-full">
        <div className="flex items-center gap-2 mb-2">
          <Coins className="h-5 w-5 text-[var(--solar)]" />
          <div className="text-sm font-semibold">Ahorro económico</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Configura el <strong>precio del kWh</strong> en el sistema fotovoltaico para ver cuánto dinero estás ahorrando.
        </p>
      </div>
    );
  }

  const liveW = Math.max(0, Number(pvW ?? 0));
  const savingsPerHour = (liveW / 1000) * price;
  const savingsToday = (todayKwh ?? 0) * price;
  const savingsMonth = (monthKwh ?? 0) * price;
  const avgDailyKwh = todayKwh && todayKwh > 0
    ? todayKwh
    : (forecastDailyKwh ?? (monthKwh ? monthKwh / Math.max(1, new Date().getDate()) : 0));
  const savingsYear = avgDailyKwh * 365 * price;

  return (
    <div className="@container relative overflow-hidden rounded-xl border bg-card p-4 sm:p-5 animate-fade-in h-full">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-emerald-500/15 p-1.5">
              <Coins className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-sm font-semibold">Ahorro económico</div>
              <div className="text-[10px] text-muted-foreground">
                Tarifa {fmt(price, cur)}/kWh{feedInPrice ? ` · Inyección ${fmt(feedInPrice, cur)}/kWh` : ""}
              </div>
            </div>
          </div>
          {liveW > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> en vivo
            </span>
          )}
        </div>

        <div className="mb-3 rounded-lg border bg-gradient-to-br from-emerald-500/10 to-transparent p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Ahorrando ahora
          </div>
          <div className="flex items-baseline gap-1">
            <div className="text-3xl font-extrabold text-emerald-600 tabular-nums">
              {fmt(savingsPerHour, cur)}
            </div>
            <div className="text-xs text-muted-foreground">/hora</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Hoy"
            value={fmt(savingsToday, cur)}
            sub={todayKwh != null ? `${todayKwh.toFixed(1)} kWh` : "—"}
          />
          <Stat
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Este mes"
            value={fmt(savingsMonth, cur)}
            sub={monthKwh != null ? `${monthKwh.toFixed(0)} kWh` : "—"}
          />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Año proyectado"
            value={fmt(savingsYear, cur)}
            sub="estimado"
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-background p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
