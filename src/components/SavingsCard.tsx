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
  /** When true, render without the outer card chrome (for use inside another card). */
  bare?: boolean;
  /** When true, hide the "Ver historial completo" link. */
  hideHistoryLink?: boolean;
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
export function SavingsCard({ siteId, pvW, batteryDischargeW, energyPrice, feedInPrice, currency, forecastDailyKwh, bare, hideHistoryLink }: Props) {
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
    const emptyInner = (
      <>
        <div className="flex items-center gap-2 mb-2">
          <Coins className="h-5 w-5 text-[var(--solar)]" />
          <div className="text-sm font-semibold">Ahorro económico</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Configura el <strong>precio del kWh</strong> en el sistema fotovoltaico para ver cuánto dinero estás ahorrando.
        </p>
      </>
    );
    if (bare) return <div className="animate-fade-in">{emptyInner}</div>;
    return <div className="dashboard-card p-5 sm:p-6 animate-fade-in h-full">{emptyInner}</div>;
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
    <div className="@container dashboard-card dashboard-card--success p-5 sm:p-6 animate-fade-in h-full">

  const inner = (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 mb-4">
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

      <div className="mb-4 rounded-xl border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--success)_12%,var(--tint-base)),transparent)] p-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Ahorrando ahora
        </div>
        <div className="flex items-baseline gap-1">
          <div className="text-4xl font-extrabold text-emerald-600 tabular-nums">
            {fmt(savingsPerHour, cur)}
          </div>
          <div className="text-xs text-muted-foreground">/hora</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 @[520px]:grid-cols-3">
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

      {!hideHistoryLink && siteId && siteId !== "local" && (
        <Link
          to="/sites/$siteId/savings"
          params={{ siteId }}
          className="mt-4 inline-flex w-full items-center justify-between rounded-xl border bg-background px-4 py-3 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-600"
        >
          <span>Ver historial completo</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );

  if (bare) return <div className="@container animate-fade-in">{inner}</div>;

  return (
    <div className="@container dashboard-card dashboard-card--success p-5 sm:p-6 animate-fade-in h-full">
      {inner}
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-lg font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
