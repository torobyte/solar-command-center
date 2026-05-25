import { useEffect, useMemo, useState } from "react";
import { Coins, TrendingUp, Calendar, Sparkles, Save, Loader2, Trash2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { resetSiteHistory } from "@/lib/history.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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

interface Props {
  siteId: string;
  canEdit: boolean;
}

export function SavingsTabView({ siteId, canEdit }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [price, setPrice] = useState<string>("");
  const [feedIn, setFeedIn] = useState<string>("");
  const [currency, setCurrency] = useState<string>("CLP");
  const [view, setView] = useState<Granularity>("day");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [resetting, setResetting] = useState(false);
  const resetHistoryFn = useServerFn(resetSiteHistory);

  async function loadAll() {
    setLoading(true);
    const [{ data: pv }, { data: totals }] = await Promise.all([
      supabase.from("pv_system_config").select("energy_price, feed_in_price, currency").eq("site_id", siteId).maybeSingle(),
      supabase
        .from("daily_totals")
        .select("day, pv_kwh, battery_discharged_kwh, load_kwh, grid_used_kwh")
        .eq("site_id", siteId)
        .order("day", { ascending: true }),
    ]);
    setPrice(pv?.energy_price != null ? String(pv.energy_price) : "");
    setFeedIn(pv?.feed_in_price != null ? String(pv.feed_in_price) : "");
    setCurrency(pv?.currency || "CLP");
    setRows((totals || []) as unknown as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadAll();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function save() {
    setSaving(true);
    const payload = {
      site_id: siteId,
      energy_price: price === "" ? null : Number(price),
      feed_in_price: feedIn === "" ? null : Number(feedIn),
      currency,
    };
    const { error } = await supabase.from("pv_system_config").upsert(payload, { onConflict: "site_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Tarifa actualizada"); loadAll(); }
  }

  const priceNum = Number(price) || 0;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (from && r.day < from) return false;
      if (to && r.day > to) return false;
      return true;
    });
  }, [rows, from, to]);

  const enriched = useMemo(() => filteredRows.map((r) => {
    const saved = Number(r.pv_kwh || 0) + Number(r.battery_discharged_kwh || 0);
    return { ...r, saved_kwh: saved, saved_money: saved * priceNum };
  }), [filteredRows, priceNum]);

  const daily = useMemo(() => {
    const slice = (from || to) ? enriched : enriched.slice(-60);
    return slice.map((r) => ({
      label: r.day.slice(5),
      pv: +r.pv_kwh.toFixed(2),
      battery: +r.battery_discharged_kwh.toFixed(2),
      saved: +r.saved_kwh.toFixed(2),
      money: +r.saved_money.toFixed(2),
    }));
  }, [enriched, from, to]);


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

  const baselineKey = `savings_baseline_${siteId}`;
  const [hasBaseline, setHasBaseline] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && !!localStorage.getItem(baselineKey); } catch { return false; }
  });

  function resetSavings() {
    if (!confirm("¿Reiniciar el ahorro económico? Los contadores en el dashboard partirán desde 0.")) return;
    const todaySaved = (todayRow?.saved ?? 0);
    const monthSaved = (monthRow?.saved ?? 0);
    const yearSaved = (yearRow?.saved ?? 0);
    try {
      localStorage.setItem(baselineKey, JSON.stringify({ today: todaySaved, month: monthSaved, year: yearSaved }));
      setHasBaseline(true);
      toast.success("Ahorro reiniciado. Refresca el dashboard para ver el cambio.");
    } catch { toast.error("No se pudo reiniciar"); }
  }

  function restoreSavings() {
    try { localStorage.removeItem(baselineKey); setHasBaseline(false); toast.success("Histórico restaurado"); } catch { /* ignore */ }
  }

  async function eraseHistoryRange() {
    const rangeLabel = from || to ? `entre ${from || "inicio"} y ${to || "hoy"}` : "completo";
    if (!confirm(`¿Eliminar el histórico ${rangeLabel}? Esta acción no se puede deshacer.`)) return;
    setResetting(true);
    try {
      await resetHistoryFn({ data: { site_id: siteId, from: from || undefined, to: to || undefined } });
      toast.success("Histórico eliminado");
      loadAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResetting(false);
    }
  }


  return (
    <div className="space-y-6">
      {/* Tariff configuration */}
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-semibold">Tarifa eléctrica</h3>
          </div>
          {canEdit && (
            hasBaseline ? (
              <Button onClick={restoreSavings} size="sm" variant="outline" className="rounded-full text-xs">
                Restaurar histórico
              </Button>
            ) : (
              <Button onClick={resetSavings} size="sm" variant="outline" className="rounded-full text-xs">
                ↻ Reiniciar ahorro
              </Button>
            )
          )}
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Configura el precio del kWh aquí para que el cálculo de ahorro funcione.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Moneda</Label>
            <select
              disabled={!canEdit}
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="CLP">CLP — Peso chileno</option>
              <option value="USD">USD — Dólar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="MXN">MXN — Peso mexicano</option>
              <option value="ARS">ARS — Peso argentino</option>
              <option value="COP">COP — Peso colombiano</option>
              <option value="PEN">PEN — Sol peruano</option>
              <option value="BRL">BRL — Real brasileño</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Precio kWh consumido</Label>
            <Input type="number" step="0.01" disabled={!canEdit}
              value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="ej. 180" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Precio kWh inyectado (opcional)</Label>
            <Input type="number" step="0.01" disabled={!canEdit}
              value={feedIn} onChange={(e) => setFeedIn(e.target.value)}
              placeholder="ej. 60" className="mt-1" />
          </div>
        </div>
        {canEdit && (
          <div className="mt-3 flex justify-end">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {saving ? "Guardando…" : "Guardar tarifa"}
            </Button>
          </div>
        )}
      </div>

      {!priceNum && (
        <div className="rounded-lg border bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          Define el precio del kWh arriba para ver los ahorros en dinero.
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
              <button key={g} onClick={() => setView(g)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  view === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {g === "day" ? "Diario" : g === "month" ? "Mensual" : "Anual"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>
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
                <Bar dataKey="pv" stackId="a" fill="hsl(45 95% 55%)" />
                <Bar dataKey="battery" stackId="a" fill="hsl(160 70% 45%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {priceNum > 0 && data.length > 0 && (
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Ahorro económico acumulado</h2>
            <p className="text-xs text-muted-foreground">
              Tarifa: {fmtMoney(priceNum, currency)}/kWh — Total mostrado:{" "}
              <strong>{fmtMoney(totalMoney, currency)}</strong> ({totalSaved.toFixed(0)} kWh)
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
