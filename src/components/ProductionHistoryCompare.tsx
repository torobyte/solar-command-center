import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { Loader2, TrendingUp } from "lucide-react";

interface Props {
  siteId: string;
  kwp: number | null;
  lossesPct: number | null;
  lat: number | null;
  lon: number | null;
  manualCalibration?: number | null;
}

interface Row { day: string; real: number; estimated: number }

export function ProductionHistoryCompare({ siteId, kwp, lossesPct, lat, lon, manualCalibration }: Props) {
  const [daily, setDaily] = useState<Row[]>([]);
  const [monthly, setMonthly] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [calib, setCalib] = useState<number>(1);

  useEffect(() => {
    if (!siteId) return;
    try {
      const v = parseFloat(localStorage.getItem(`solarforecast.calib.${siteId}`) ?? "1");
      setCalib(manualCalibration && manualCalibration > 0 ? manualCalibration : (isFinite(v) && v > 0 ? v : 1));
    } catch { /* ignore */ }
  }, [siteId, manualCalibration]);

  useEffect(() => {
    if (!siteId || !kwp || lat == null || lon == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const end = new Date();
        const start = new Date(); start.setDate(start.getDate() - 30);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const [{ data: dt }, archive] = await Promise.all([
          supabase.from("daily_totals")
            .select("day, pv_kwh")
            .eq("site_id", siteId)
            .gte("day", fmt(start))
            .order("day", { ascending: true }),
          fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
            `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
            `&daily=shortwave_radiation_sum&timezone=auto`).then(r => r.json()),
        ]);
        if (cancelled) return;

        const losses = Math.max(0, Math.min(50, lossesPct ?? 14)) / 100;
        const radByDay = new Map<string, number>();
        const days: string[] = archive?.daily?.time ?? [];
        const rad: number[] = archive?.daily?.shortwave_radiation_sum ?? [];
        days.forEach((d, i) => radByDay.set(d, Number(rad[i] ?? 0))); // MJ/m²

        const realByDay = new Map<string, number>();
        (dt ?? []).forEach((r) => realByDay.set(r.day, Number(r.pv_kwh ?? 0)));

        const rows: Row[] = [];
        for (const d of days) {
          const radMJ = radByDay.get(d) ?? 0;            // MJ/m² per day
          const radKwhM2 = radMJ / 3.6;                  // 1 kWh = 3.6 MJ
          const estimated = kwp * radKwhM2 * (1 - losses) * calib;
          rows.push({ day: d, real: +(realByDay.get(d) ?? 0).toFixed(2), estimated: +estimated.toFixed(2) });
        }
        setDaily(rows);

        // Monthly aggregation
        const byMonth = new Map<string, { real: number; estimated: number }>();
        for (const r of rows) {
          const m = r.day.slice(0, 7);
          const cur = byMonth.get(m) ?? { real: 0, estimated: 0 };
          cur.real += r.real; cur.estimated += r.estimated;
          byMonth.set(m, cur);
        }
        setMonthly([...byMonth.entries()].map(([day, v]) => ({
          day, real: +v.real.toFixed(2), estimated: +v.estimated.toFixed(2),
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, kwp, lossesPct, lat, lon, calib]);

  if (!kwp || lat == null || lon == null) {
    return (
      <div className="dashboard-card p-4 text-sm text-muted-foreground">
        Configura potencia del array (kWp) y ubicación para ver la comparación histórica.
      </div>
    );
  }

  const totalReal = daily.reduce((s, r) => s + r.real, 0);
  const totalEst = daily.reduce((s, r) => s + r.estimated, 0);
  const ratio = totalEst > 0 ? totalReal / totalEst : null;

  return (
    <div className="dashboard-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
          <TrendingUp className="h-4 w-4 text-[var(--solar)]" /> Producción real vs estimada
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">Calibración: ×{calib.toFixed(2)}{manualCalibration ? " (manual)" : " (auto)"}</span>
          {ratio != null && (
            <span className="rounded-full bg-muted px-2 py-0.5">Real/Estimado: {(ratio * 100).toFixed(0)}%</span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5">Real 30d: {totalReal.toFixed(1)} kWh</span>
          <span className="rounded-full bg-muted px-2 py-0.5">Estimado 30d: {totalEst.toFixed(1)} kWh</span>
        </div>
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando histórico…
        </div>
      )}
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Diario (últimos 30 días)</div>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" fontSize={10} tickFormatter={(v) => String(v).slice(5)} />
              <YAxis fontSize={10} unit=" kWh" />
              <Tooltip />
              <Legend />
              <Bar dataKey="estimated" name="Estimado" fill="var(--accent)" fillOpacity={0.7} />
              <Bar dataKey="real" name="Real" fill="var(--solar)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mensual</div>
        <div className="h-48 w-full">
          <ResponsiveContainer>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" fontSize={10} />
              <YAxis fontSize={10} unit=" kWh" />
              <Tooltip />
              <Legend />
              <Bar dataKey="estimated" name="Estimado" fill="var(--accent)" fillOpacity={0.7} />
              <Bar dataKey="real" name="Real" fill="var(--solar)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
