import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, TrendingUp, Calendar, Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sites/$siteId/savings")({
  component: SavingsHistoryPage,
});

interface Row {
  day: string;
  pv_kwh: number;
  battery_discharged_kwh: number;
  load_kwh: number;
  grid_used_kwh: number;
}

type Granularity = "day" | "month" | "year";

function fmtMoney(n: number, currency: string): string {
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

function SavingsHistoryPage() {
  const { siteId } = Route.useParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [price, setPrice] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("CLP");
  const [siteName, setSiteName] = useState<string>("");
  const [view, setView] = useState<Granularity>("day");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: pv }, { data: site }, { data: totals }] = await Promise.all([
        supabase.from("pv_system_config").select("energy_price, currency").eq("site_id", siteId).maybeSingle(),
        supabase.from("sites").select("name").eq("id", siteId).maybeSingle(),
        supabase
          .from("daily_totals")
          .select("day, pv_kwh, battery_discharged_kwh, load_kwh, grid_used_kwh")
          .eq("site_id", siteId)
          .order("day", { ascending: true }),
      ]);
      if (cancelled) return;
      setPrice(Number(pv?.energy_price ?? 0));
      setCurrency(pv?.currency || "CLP");
      setSiteName(site?.name || "");
      setRows((totals || []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const enriched = useMemo(() => rows.map((r) => {
    const saved = Number(r.pv_kwh || 0) + Number(r.battery_discharged_kwh || 0);
    return { ...r, saved_kwh: saved, saved_money: saved * price };
  }), [rows, price]);

  const daily = useMemo(() => {
    return enriched.slice(-60).map((r) => ({
      label: r.day.slice(5),
      day: r.day,
      pv: Number(r.pv_kwh.toFixed(2)),
      battery: Number(r.battery_discharged_kwh.toFixed(2)),
      saved: Number(r.saved_kwh.toFixed(2)),
      money: Number(r.saved_money.toFixed(2)),
    }));
  }, [enriched]);

  const monthly = useMemo(() => {
    const buckets = new Map<string, { pv: number; battery: number; saved: number; money: number }>();
    for (const r of enriched) {
      const key = r.day.slice(0, 7);
      const b = buckets.get(key) || { pv: 0, battery: 0, saved: 0, money: 0 };
      b.pv += r.pv_kwh; b.battery += r.battery_discharged_kwh;
      b.saved += r.saved_kwh; b.money += r.saved_money;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries()).map(([label, v]) => ({
      label, pv: +v.pv.toFixed(2), battery: +v.battery.toFixed(2),
      saved: +v.saved.toFixed(2), money: +v.money.toFixed(2),
    }));
  }, [enriched]);

  const yearly = useMemo(() => {
    const buckets = new Map<string, { pv: number; battery: number; saved: number; money: number }>();
    for (const r of enriched) {
      const key = r.day.slice(0, 4);
      const b = buckets.get(key) || { pv: 0, battery: 0, saved: 0, money: 0 };
      b.pv += r.pv_kwh; b.battery += r.battery_discharged_kwh;
      b.saved += r.saved_kwh; b.money += r.saved_money;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries()).map(([label, v]) => ({
      label, pv: +v.pv.toFixed(2), battery: +v.battery.toFixed(2),
      saved: +v.saved.toFixed(2), money: +v.money.toFixed(2),
    }));
  }, [enriched]);

  const data = view === "day" ? daily : view === "month" ? monthly : yearly;
  const totalSaved = data.reduce((s, r) => s + (r.saved as number), 0);
  const totalMoney = data.reduce((s, r) => s + (r.money as number), 0);
  const todayRow = daily[daily.length - 1];
  const monthRow = monthly[monthly.length - 1];
  const yearRow = yearly[yearly.length - 1];

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/sites/$siteId" params={{ siteId }}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Coins className="h-6 w-6 text-emerald-600" /> Historial de Ahorros
            </h1>
            <p className="text-sm text-muted-foreground">{siteName}</p>
          </div>
        </div>
      </div>

      {!price && (
        <div className="rounded-lg border bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          Configura el precio del kWh en el sistema fotovoltaico para ver tus ahorros en dinero.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={<Sparkles className="h-4 w-4" />} label="Hoy"
          kwh={todayRow?.saved ?? 0} money={todayRow?.money ?? 0} currency={currency} />
        <SummaryCard icon={<Calendar className="h-4 w-4" />} label="Este mes"
          kwh={monthRow?.saved ?? 0} money={monthRow?.money ?? 0} currency={currency} />
        <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Este año"
          kwh={yearRow?.saved ?? 0} money={yearRow?.money ?? 0} currency={currency} />
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Energía ahorrada</h2>
            <p className="text-xs text-muted-foreground">
              Solar producido + Batería descargada (no comprado a la red)
            </p>
          </div>
          <div className="inline-flex rounded-lg border p-1 bg-background">
            {(["day", "month", "year"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setView(g)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  view === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {g === "day" ? "Diario" : g === "month" ? "Mensual" : "Anual"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            Cargando…
          </div>
        ) : data.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            Sin datos todavía. Vuelve cuando tengas mediciones acumuladas.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit=" kWh" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(val, name) => [`${Number(val).toFixed(2)} kWh`, name === "pv" ? "Solar" : "Batería"]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === "pv" ? "Solar" : "Batería"} />
                <Bar dataKey="pv" stackId="a" fill="hsl(45 95% 55%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="battery" stackId="a" fill="hsl(160 70% 45%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {price > 0 && data.length > 0 && (
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Ahorro económico acumulado</h2>
            <p className="text-xs text-muted-foreground">
              Tarifa actual: {fmtMoney(price, currency)}/kWh — Total mostrado: <strong>{fmtMoney(totalMoney, currency)}</strong> ({totalSaved.toFixed(0)} kWh)
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="moneyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 70% 45%)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="hsl(160 70% 45%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(val) => [fmtMoney(Number(val), currency), "Ahorrado"]}
                />
                <Area type="monotone" dataKey="money" stroke="hsl(160 70% 45%)" strokeWidth={2} fill="url(#moneyFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, kwh, money, currency }: { icon: React.ReactNode; label: string; kwh: number; money: number; currency: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold text-emerald-600 tabular-nums">
        {fmtMoney(money, currency)}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">{kwh.toFixed(1)} kWh</div>
    </div>
  );
}
