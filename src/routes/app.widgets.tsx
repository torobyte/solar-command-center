import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listWidgets, saveWidget, deleteWidget, revokeWidgetToken } from "@/lib/widgets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Smartphone, KeyRound, Copy, Battery, Sun, Plug, Power } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/widgets")({
  component: () => <ProtectedLayout><WidgetsPage /></ProtectedLayout>,
});

const ALL_METRICS = [
  { id: "pv", label: "Producción PV", icon: Sun },
  { id: "battery", label: "Batería", icon: Battery },
  { id: "load", label: "Carga", icon: Power },
  { id: "grid", label: "Red", icon: Plug },
  { id: "mode", label: "Modo inversor", icon: Smartphone },
  { id: "alerts", label: "Alertas", icon: KeyRound },
] as const;

type Cfg = {
  id: string;
  site_id: string;
  label: string;
  metrics: string[];
  theme: "dark" | "light";
  refresh_minutes: number;
};

type TokenRow = { id: string; label: string | null; token: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type SiteRow = { id: string; name: string };

function WidgetsPage() {
  const list = useServerFn(listWidgets);
  const save = useServerFn(saveWidget);
  const del = useServerFn(deleteWidget);
  const revoke = useServerFn(revokeWidgetToken);

  const [configs, setConfigs] = useState<Cfg[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Partial<Cfg> | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const r = await list();
      setConfigs(r.configs as Cfg[]);
      setTokens(r.tokens as TokenRow[]);
      setSites(r.sites as SiteRow[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  function startNew() {
    setEditing({
      site_id: sites[0]?.id ?? "",
      label: sites[0]?.name ?? "Mi sitio",
      metrics: ["pv", "battery", "load", "grid"],
      theme: "dark",
      refresh_minutes: 30,
    });
  }

  async function onSave() {
    if (!editing?.site_id) return toast.error("Selecciona un sitio");
    try {
      await save({
        data: {
          id: editing.id,
          site_id: editing.site_id,
          label: editing.label || "Mi sitio",
          metrics: (editing.metrics as any) ?? ["pv"],
          theme: editing.theme ?? "dark",
          refresh_minutes: editing.refresh_minutes ?? 30,
        },
      });
      toast.success("Widget guardado");
      setEditing(null);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este widget?")) return;
    await del({ data: { id } });
    toast.success("Eliminado");
    reload();
  }

  async function onRevokeToken(id: string) {
    if (!confirm("Al revocar el token, los widgets en el teléfono dejarán de actualizarse hasta que vuelvas a iniciar sesión en la app.")) return;
    await revoke({ data: { id } });
    toast.success("Token revocado");
    reload();
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis widgets</h1>
          <p className="text-sm text-muted-foreground">Configura los widgets que se muestran en la pantalla de inicio Android</p>
        </div>
        <Button onClick={startNew} disabled={sites.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo widget
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : configs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Aún no has creado widgets. Crea uno y aparecerá disponible al añadirlo desde la pantalla de inicio Android.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {configs.map((c) => {
            const site = sites.find((s) => s.id === c.site_id);
            return (
              <Card key={c.id}>
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <WidgetPreview cfg={c} siteName={site?.name ?? "—"} />
                  <div className="flex flex-wrap gap-1">
                    {c.metrics.map((m) => {
                      const meta = ALL_METRICS.find((x) => x.id === m);
                      return <Badge key={m} variant="secondary">{meta?.label ?? m}</Badge>;
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Refresco: cada {c.refresh_minutes} min · Tema {c.theme}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Tokens de widget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cada vez que inicies sesión en la app móvil, el token se vincula automáticamente a los widgets de tu pantalla de inicio. Revoca un token si pierdes el teléfono.
          </p>
          {tokens.length === 0 && <p className="text-sm text-muted-foreground">Aún no tienes tokens. Crea un widget para generar uno.</p>}
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <code className="flex-1 truncate text-xs">{t.token.slice(0, 8)}…{t.token.slice(-4)}</code>
              {t.revoked_at ? (
                <Badge variant="destructive">Revocado</Badge>
              ) : (
                <Badge variant="outline">Activo</Badge>
              )}
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(t.token); toast.success("Token copiado"); }}>
                <Copy className="h-4 w-4" />
              </Button>
              {!t.revoked_at && (
                <Button size="sm" variant="outline" onClick={() => onRevokeToken(t.id)}>Revocar</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo añadir el widget en Android</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>1. Instala la APK firmada generada desde el panel SuperAdmin.</p>
          <p>2. Abre la app e inicia sesión — el token se guardará automáticamente.</p>
          <p>3. Mantén pulsado un espacio vacío en la pantalla de inicio → Widgets → busca <b>SolarOps</b>.</p>
          <p>4. Arrastra el widget al home. Se actualizará cada {configs[0]?.refresh_minutes ?? 30} min.</p>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar widget" : "Nuevo widget"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sitio</Label>
                <Select value={editing.site_id} onValueChange={(v) => setEditing({ ...editing, site_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona sitio" /></SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nombre visible</Label>
                <Input value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Métricas</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_METRICS.map((m) => {
                    const Icon = m.icon;
                    const checked = (editing.metrics ?? []).includes(m.id);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => {
                          const arr = new Set(editing.metrics ?? []);
                          if (checked) arr.delete(m.id); else arr.add(m.id);
                          setEditing({ ...editing, metrics: Array.from(arr) });
                        }}
                        className={`flex items-center gap-2 rounded-md border p-2 text-sm ${checked ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                      >
                        <Icon className="h-4 w-4" /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tema</Label>
                  <Select value={editing.theme ?? "dark"} onValueChange={(v) => setEditing({ ...editing, theme: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Oscuro</SelectItem>
                      <SelectItem value="light">Claro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Refrescar (min)</Label>
                  <Select value={String(editing.refresh_minutes ?? 30)} onValueChange={(v) => setEditing({ ...editing, refresh_minutes: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[15, 30, 60, 120, 360].map((n) => <SelectItem key={n} value={String(n)}>{n} min</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editing.site_id && (
                <div>
                  <Label className="text-xs text-muted-foreground">Vista previa</Label>
                  <WidgetPreview cfg={editing as Cfg} siteName={sites.find((s) => s.id === editing.site_id)?.name ?? ""} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={onSave}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WidgetPreview({ cfg, siteName }: { cfg: Cfg; siteName: string }) {
  const dark = cfg.theme === "dark";
  const bg = dark ? "#0f0f0f" : "#ffffff";
  const fg = dark ? "#ffffff" : "#0a0a0a";
  const sub = dark ? "#a3a3a3" : "#525252";
  const accent = "#f59e0b";
  return (
    <div className="rounded-xl p-3 shadow-inner border" style={{ background: bg, color: fg, borderColor: dark ? "#262626" : "#e5e5e5" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md flex items-center justify-center" style={{ background: accent }}>
            <Sun className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">{cfg.label || siteName}</div>
            <div className="text-[10px]" style={{ color: sub }}>{siteName}</div>
          </div>
        </div>
        <span className="text-[10px]" style={{ color: sub }}>ahora</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(cfg.metrics ?? []).slice(0, 4).map((m) => {
          const meta = ALL_METRICS.find((x) => x.id === m);
          const Icon = meta?.icon ?? Sun;
          return (
            <div key={m} className="rounded-md p-2" style={{ background: dark ? "#1a1a1a" : "#f5f5f5" }}>
              <div className="flex items-center gap-1 text-[10px]" style={{ color: sub }}>
                <Icon className="h-3 w-3" /> {meta?.label}
              </div>
              <div className="text-base font-semibold">—</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
