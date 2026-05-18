import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_days: number | null;
  is_lifetime: boolean;
  /** Storage convention: para CLP guardamos pesos enteros (CLP no tiene
   * subunidad). Para USD/EUR guardamos centavos como hasta ahora. */
  price_cents: number;
  currency: string;
  features: string[];
  sort_order: number;
  active: boolean;
}

const CURRENCIES = ["CLP", "USD", "EUR"] as const;
type Currency = (typeof CURRENCIES)[number];

const CURRENCY_DECIMALS: Record<string, number> = { CLP: 0, USD: 2, EUR: 2 };

function currencyDecimals(c: string) {
  return CURRENCY_DECIMALS[c?.toUpperCase()] ?? 2;
}

/** Convierte el valor almacenado (price_cents) a la cantidad mostrable. */
function storedToDisplay(price_cents: number, currency: string): number {
  return currencyDecimals(currency) === 0 ? price_cents : price_cents / 100;
}

/** Convierte lo que escribe el usuario (en moneda principal) al valor a guardar. */
function displayToStored(amount: number, currency: string): number {
  return currencyDecimals(currency) === 0 ? Math.round(amount) : Math.round(amount * 100);
}

function formatPrice(price_cents: number, currency: string): string {
  const c = (currency || "CLP").toUpperCase();
  try {
    return new Intl.NumberFormat(c === "CLP" ? "es-CL" : "en-US", {
      style: "currency",
      currency: c,
      maximumFractionDigits: currencyDecimals(c),
      minimumFractionDigits: currencyDecimals(c),
    }).format(storedToDisplay(price_cents, c));
  } catch {
    return `${storedToDisplay(price_cents, c)} ${c}`;
  }
}

const EMPTY: Omit<Plan, "id"> = {
  slug: "", name: "", description: "", duration_days: 365, is_lifetime: false,
  price_cents: 0, currency: "CLP", features: [], sort_order: 0, active: true,
};

export function PlansAdmin() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [priceInput, setPriceInput] = useState<string>("0");
  const [featuresText, setFeaturesText] = useState("");

  async function load() {
    const { data, error } = await supabase.from("plans").select("*").order("sort_order");
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Plan[]);
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing(null);
    setForm(EMPTY);
    setPriceInput("0");
    setFeaturesText("");
    setOpen(true);
  }
  function startEdit(p: Plan) {
    setEditing(p);
    setForm({ ...p });
    setPriceInput(String(storedToDisplay(p.price_cents, p.currency)));
    setFeaturesText((p.features ?? []).join("\n"));
    setOpen(true);
  }

  function onCurrencyChange(next: Currency) {
    // Re-convertir el valor mostrado para que represente la misma cantidad
    // visible al cambiar de moneda (no se traduce monetariamente, sólo
    // reinterpreta el número introducido).
    setForm((f) => ({ ...f, currency: next }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const features = featuresText.split("\n").map((s) => s.trim()).filter(Boolean);
    const amount = Number(priceInput.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
    const payload = {
      ...form,
      features,
      duration_days: form.is_lifetime ? null : Number(form.duration_days),
      price_cents: displayToStored(amount, form.currency),
    };
    const { error } = editing
      ? await supabase.from("plans").update(payload).eq("id", editing.id)
      : await supabase.from("plans").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Plan actualizado" : "Plan creado");
    setOpen(false); load();
  }

  async function del(p: Plan) {
    if (!confirm(`¿Eliminar el plan "${p.name}"?`)) return;
    const { error } = await supabase.from("plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Plan eliminado"); load();
  }

  const decimals = currencyDecimals(form.currency);
  const priceLabel = decimals === 0
    ? `Precio (${form.currency}, pesos enteros)`
    : `Precio (${form.currency})`;
  const priceStep = decimals === 0 ? "1" : "0.01";

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" />Nuevo plan</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Duración</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.slug} · {p.description ?? "—"}</div>
                </td>
                <td className="px-4 py-3">{p.is_lifetime ? "De por vida" : `${p.duration_days} días`}</td>
                <td className="px-4 py-3 font-medium">{formatPrice(p.price_cents, p.currency)}</td>
                <td className="px-4 py-3">
                  <span className={p.active ? "text-success" : "text-muted-foreground"}>
                    {p.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Sin planes.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar plan" : "Nuevo plan"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">De por vida</Label>
                <p className="text-xs text-muted-foreground">Sin fecha de expiración</p>
              </div>
              <Switch checked={form.is_lifetime} onCheckedChange={(v) => setForm({ ...form, is_lifetime: v })} />
            </div>
            {!form.is_lifetime && (
              <div className="space-y-1.5">
                <Label>Duración (días)</Label>
                <Input type="number" min={1} value={form.duration_days ?? 0}
                  onChange={(e) => setForm({ ...form, duration_days: parseInt(e.target.value) || 0 })} />
              </div>
            )}
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label>{priceLabel}</Label>
                <Input
                  type="number"
                  min={0}
                  step={priceStep}
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Vista previa: <span className="font-medium">
                    {formatPrice(
                      displayToStored(Number(priceInput) || 0, form.currency),
                      form.currency,
                    )}
                  </span>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={form.currency} onValueChange={(v) => onCurrencyChange(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Funciones (una por línea)</Label>
              <Textarea rows={4} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Orden</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="cursor-pointer">Activo</Label>
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              </div>
            </div>
            <DialogFooter><Button type="submit">{editing ? "Guardar" : "Crear"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
