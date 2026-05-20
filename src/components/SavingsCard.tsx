import { useEffect, useState } from "react";
import { Coins, TrendingUp, Calendar, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  siteId: string;
  pvW: number | null;
  /** Battery discharge power in W (positive = battery feeding the load). */
  batteryDischargeW?: number | null;
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
 * Estimates energy savings in money. Savings = PV produced + battery
 * discharged to the house (kWh not pulled from the grid).
 *
 * Reads from the `daily_totals` aggregation table so today, this month
 * and this year are always available regardless of telemetry density.
 */
export function SavingsCard({ siteId, pvW, batteryDischargeW, energyPrice, feedInPrice, currency, forecastDailyKwh }: Props) {
  const cur = currency || "CLP";
  const price = energyPrice ?? 0;
  const [todayKwh, setTodayKwh] = useState<number | null>(null);
  const [monthKwh, setMonthKwh] = useState<number | null>(null);
  const [yearKwh, setYearKwh] = useState<number | null>(null);

  useEffect(() => {
    if (!siteId || siteId === "local") return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      const { data } = await supabase
        .from("daily_totals")
        .select("day, pv_kwh, battery_discharged_kwh")
        .eq("site_id", siteId)
        .gte("day", yearStart)
        .order("day", { ascending: true });
      if (cancelled || !data) return;

      const month = now.getMonth();
      let y = 0, m = 0, t = 0;
      for (const row of data) {
        const saved = Number(row.pv_kwh || 0) + Number(row.battery_discharged_kwh || 0);
        y += saved;
        const d = new Date(`${row.day}T00:00:00`);
        if (d.getMonth() === month) m += saved;
        if (row.day === todayStr) t += saved;
      }
      setTodayKwh(t);
      setMonthKwh(m);
      setYearKwh(y);
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

  const liveW = Math.max(0, Number(pvW ?? 0)) + Math.max(0, Number(batteryDischargeW ?? 0));
  const savingsPerHour = (liveW / 1000) * price;
  const savingsToday = (todayKwh ?? 0) * price;
  const savingsMonth = (monthKwh ?? 0) * price;
  // Year projection: prefer real year-to-date extrapolated, fall back to forecast.
  const dayOfYear = Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000));
  const projectedYearKwh = yearKwh && yearKwh > 0
    ? (yearKwh / dayOfYear) * 365
    : (forecastDailyKwh ?? 0) * 365;
  const savingsYear = projectedYearKwh * price;

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
            sub={yearKwh != null ? `${yearKwh.toFixed(0)} kWh real` : "estimado"}
          />
        </div>

        {siteId && siteId !== "local" && (
          <Link
            to="/sites/$siteId/savings"
            params={{ siteId }}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-600 transition-colors"
          >
            Ver historial completo <ArrowRight className="h-3 w-3" />
          </Link>
        )}
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
