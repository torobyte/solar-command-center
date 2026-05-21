import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { applyBrandingToDOM, ensureGoogleFont, GOOGLE_FONTS, useBranding, type Branding } from "@/lib/branding";
import { useTheme } from "@/lib/theme";
import { Save, RotateCcw, Upload, X } from "lucide-react";

type PalettePreset = {
  name: string;
  description: string;
  light: Partial<Record<keyof Branding, string>>;
  dark: Partial<Record<keyof Branding, string>>;
};

const PALETTE_PRESETS: PalettePreset[] = [
  {
    name: "SolarOps Classic",
    description: "Ámbar solar sobre azul profundo",
    light: {
      primary_color: "#f59e0b", primary_foreground: "#0a0a0a", accent_color: "#fbbf24",
      background_color: "#fafafa", foreground_color: "#0a0a0a", card_color: "#ffffff",
      muted_color: "#f4f4f5", border_color: "#e4e4e7",
      success_color: "#16a34a", warning_color: "#f59e0b", destructive_color: "#dc2626",
    },
    dark: {
      primary_color_dark: "#fbbf24", primary_foreground_dark: "#0a0a0a", accent_color_dark: "#f59e0b",
      background_color_dark: "#0a0a0a", foreground_color_dark: "#fafafa", card_color_dark: "#171717",
      muted_color_dark: "#262626", border_color_dark: "#404040",
      success_color_dark: "#22c55e", warning_color_dark: "#fbbf24", destructive_color_dark: "#ef4444",
    },
  },
  {
    name: "Ocean Deep",
    description: "Azules marinos profesionales",
    light: {
      primary_color: "#0ea5e9", primary_foreground: "#ffffff", accent_color: "#06b6d4",
      background_color: "#f8fafc", foreground_color: "#0f172a", card_color: "#ffffff",
      muted_color: "#f1f5f9", border_color: "#e2e8f0",
      success_color: "#10b981", warning_color: "#f59e0b", destructive_color: "#ef4444",
    },
    dark: {
      primary_color_dark: "#38bdf8", primary_foreground_dark: "#0c2340", accent_color_dark: "#22d3ee",
      background_color_dark: "#0c2340", foreground_color_dark: "#e2e8f0", card_color_dark: "#1a4a6e",
      muted_color_dark: "#1e3a5f", border_color_dark: "#2d5a8a",
      success_color_dark: "#34d399", warning_color_dark: "#fbbf24", destructive_color_dark: "#f87171",
    },
  },
  {
    name: "Forest Energy",
    description: "Verdes naturales y orgánicos",
    light: {
      primary_color: "#16a34a", primary_foreground: "#ffffff", accent_color: "#65a30d",
      background_color: "#f7f9f5", foreground_color: "#1a2e1a", card_color: "#ffffff",
      muted_color: "#ecf0e6", border_color: "#d4ddc9",
      success_color: "#16a34a", warning_color: "#ca8a04", destructive_color: "#dc2626",
    },
    dark: {
      primary_color_dark: "#4ade80", primary_foreground_dark: "#0a1f0a", accent_color_dark: "#a3e635",
      background_color_dark: "#0a1f0a", foreground_color_dark: "#e8f0e3", card_color_dark: "#162e16",
      muted_color_dark: "#1f3a1f", border_color_dark: "#2d5a2d",
      success_color_dark: "#4ade80", warning_color_dark: "#facc15", destructive_color_dark: "#f87171",
    },
  },
  {
    name: "Midnight Indigo",
    description: "Tech sofisticado con índigo eléctrico",
    light: {
      primary_color: "#4f46e5", primary_foreground: "#ffffff", accent_color: "#7c3aed",
      background_color: "#fafafa", foreground_color: "#0a0a1a", card_color: "#ffffff",
      muted_color: "#f4f4f5", border_color: "#e4e4e7",
      success_color: "#10b981", warning_color: "#f59e0b", destructive_color: "#ef4444",
    },
    dark: {
      primary_color_dark: "#818cf8", primary_foreground_dark: "#0a0a1a", accent_color_dark: "#a78bfa",
      background_color_dark: "#0a0a1a", foreground_color_dark: "#e0e7ff", card_color_dark: "#141432",
      muted_color_dark: "#1e1e5a", border_color_dark: "#312e81",
      success_color_dark: "#34d399", warning_color_dark: "#fbbf24", destructive_color_dark: "#f87171",
    },
  },
  {
    name: "Noir & Gold",
    description: "Negro lujo con dorado editorial",
    light: {
      primary_color: "#c9a84c", primary_foreground: "#0d0d0d", accent_color: "#f0d78c",
      background_color: "#fafaf7", foreground_color: "#0d0d0d", card_color: "#ffffff",
      muted_color: "#f5f3ee", border_color: "#e8e4dd",
      success_color: "#15803d", warning_color: "#c9a84c", destructive_color: "#991b1b",
    },
    dark: {
      primary_color_dark: "#f0d78c", primary_foreground_dark: "#0d0d0d", accent_color_dark: "#c9a84c",
      background_color_dark: "#0d0d0d", foreground_color_dark: "#f0d78c", card_color_dark: "#1a1a1a",
      muted_color_dark: "#262626", border_color_dark: "#3d3d3d",
      success_color_dark: "#22c55e", warning_color_dark: "#f0d78c", destructive_color_dark: "#ef4444",
    },
  },
  {
    name: "Coral Sunset",
    description: "Coral vibrante y energético",
    light: {
      primary_color: "#f43f5e", primary_foreground: "#ffffff", accent_color: "#fb7185",
      background_color: "#fff8f8", foreground_color: "#1f1015", card_color: "#ffffff",
      muted_color: "#ffeef0", border_color: "#ffd4da",
      success_color: "#10b981", warning_color: "#f59e0b", destructive_color: "#dc2626",
    },
    dark: {
      primary_color_dark: "#fb7185", primary_foreground_dark: "#1f1015", accent_color_dark: "#fda4af",
      background_color_dark: "#1f1015", foreground_color_dark: "#ffe4e8", card_color_dark: "#2d1820",
      muted_color_dark: "#3d2028", border_color_dark: "#5a2e3a",
      success_color_dark: "#34d399", warning_color_dark: "#fbbf24", destructive_color_dark: "#f87171",
    },
  },
  {
    name: "Slate Pro",
    description: "Grises corporativos minimalistas",
    light: {
      primary_color: "#475569", primary_foreground: "#ffffff", accent_color: "#0ea5e9",
      background_color: "#ffffff", foreground_color: "#0f172a", card_color: "#f8fafc",
      muted_color: "#f1f5f9", border_color: "#cbd5e1",
      success_color: "#059669", warning_color: "#d97706", destructive_color: "#dc2626",
    },
    dark: {
      primary_color_dark: "#94a3b8", primary_foreground_dark: "#0f172a", accent_color_dark: "#38bdf8",
      background_color_dark: "#0f172a", foreground_color_dark: "#f1f5f9", card_color_dark: "#1e293b",
      muted_color_dark: "#334155", border_color_dark: "#475569",
      success_color_dark: "#34d399", warning_color_dark: "#fbbf24", destructive_color_dark: "#f87171",
    },
  },
  {
    name: "Neon Mint",
    description: "Verde menta brillante y futurista",
    light: {
      primary_color: "#10b981", primary_foreground: "#052e16", accent_color: "#06b6d4",
      background_color: "#f0fdf4", foreground_color: "#052e16", card_color: "#ffffff",
      muted_color: "#dcfce7", border_color: "#bbf7d0",
      success_color: "#10b981", warning_color: "#f59e0b", destructive_color: "#dc2626",
    },
    dark: {
      primary_color_dark: "#2dd4a8", primary_foreground_dark: "#0d1b2a", accent_color_dark: "#73ffb8",
      background_color_dark: "#0d1b2a", foreground_color_dark: "#d1fae5", card_color_dark: "#1b4332",
      muted_color_dark: "#14532d", border_color_dark: "#166534",
      success_color_dark: "#73ffb8", warning_color_dark: "#fbbf24", destructive_color_dark: "#f87171",
    },
  },
];

const COLOR_FIELDS: { key: keyof Branding; label: string }[] = [
  { key: "primary_color", label: "Primario" },
  { key: "primary_foreground", label: "Texto sobre primario" },
  { key: "accent_color", label: "Acento" },
  { key: "background_color", label: "Fondo" },
  { key: "foreground_color", label: "Texto" },
  { key: "card_color", label: "Tarjetas" },
  { key: "muted_color", label: "Muted" },
  { key: "border_color", label: "Bordes" },
  { key: "success_color", label: "Éxito" },
  { key: "warning_color", label: "Advertencia" },
  { key: "destructive_color", label: "Destructivo" },
];

export function BrandingAdmin() {
  const { reload } = useBranding();
  const { resolved } = useTheme();
  const [b, setB] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("branding_settings").select("*").eq("key", "global").maybeSingle();
    if (data) setB(data as Branding);
  }
  useEffect(() => { load(); }, []);

  function update<K extends keyof Branding>(k: K, v: Branding[K]) {
    if (!b) return;
    const next = { ...b, [k]: v };
    setB(next);
    applyBrandingToDOM(next, resolved);
  }

  function applyPreset(p: PalettePreset, mode: "light" | "dark" | "both") {
    if (!b) return;
    const next = { ...b } as Branding;
    if (mode === "light" || mode === "both") Object.assign(next, p.light);
    if (mode === "dark" || mode === "both") Object.assign(next, p.dark);
    setB(next);
    applyBrandingToDOM(next, resolved);
    toast.success(`Paleta "${p.name}" aplicada`);
  }

  async function save() {
    if (!b) return;
    setSaving(true);
    const { error } = await supabase.from("branding_settings").update(b).eq("key", "global");
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Branding guardado");
    reload();
  }

  if (!b) return <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="colors">Colores</TabsTrigger>
          <TabsTrigger value="typography">Tipografía</TabsTrigger>
          <TabsTrigger value="pwa">PWA</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-4">
          <Field label="Nombre del sitio">
            <Input value={b.site_name} onChange={(e) => update("site_name", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <Input value={b.tagline ?? ""} onChange={(e) => update("tagline", e.target.value)} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Logo (modo claro)">
              <ImageUploader value={b.logo_url ?? ""} folder="logo"
                onChange={(v) => update("logo_url", v)} hint="PNG/SVG · ideal 256×64" />
            </Field>
            <Field label="Logo (modo oscuro)">
              <ImageUploader value={b.logo_url_dark ?? ""} folder="logo-dark"
                onChange={(v) => update("logo_url_dark", v as never)} hint="Versión para fondos oscuros" />
            </Field>
            <Field label="Favicon (claro)">
              <ImageUploader value={b.favicon_url ?? ""} folder="favicon"
                onChange={(v) => update("favicon_url", v)} hint="32×32 PNG/SVG" />
            </Field>
            <Field label="Favicon (oscuro)">
              <ImageUploader value={b.favicon_url_dark ?? ""} folder="favicon-dark"
                onChange={(v) => update("favicon_url_dark", v as never)} hint="32×32 PNG/SVG" />
            </Field>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Fondo de pantalla de login</h3>
              <p className="text-[11px] text-muted-foreground">
                Imagen a pantalla completa detrás del formulario de inicio de sesión. Se aplica un velo oscuro encima para mantener la legibilidad.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Fondo login (modo claro)">
                <ImageUploader value={b.login_bg_url ?? ""} folder="login-bg"
                  onChange={(v) => update("login_bg_url", v as never)} hint="JPG/PNG · ideal 1920×1080" />
              </Field>
              <Field label="Fondo login (modo oscuro)">
                <ImageUploader value={b.login_bg_url_dark ?? ""} folder="login-bg-dark"
                  onChange={(v) => update("login_bg_url_dark", v as never)} hint="Versión para tema oscuro" />
              </Field>
            </div>
            <Field label={`Opacidad del velo (${Math.round((b.login_bg_overlay ?? 0.55) * 100)}%)`}>
              <input
                type="range" min={0} max={100} step={5}
                value={Math.round((b.login_bg_overlay ?? 0.55) * 100)}
                onChange={(e) => update("login_bg_overlay", (Number(e.target.value) / 100) as never)}
                className="w-full"
              />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="colors" className="mt-6 space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4">
            <h3 className="mb-1 text-sm font-semibold">🎨 Paletas predefinidas</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Aplica una paleta completa con un clic. Puedes ajustar los colores después.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {PALETTE_PRESETS.map((p) => (
                <div key={p.name} className="rounded-lg border bg-card p-3">
                  <div className="mb-2">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.description}</p>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-1">
                    <div>
                      <p className="mb-1 text-[10px] uppercase text-muted-foreground">Claro</p>
                      <div className="flex h-6 overflow-hidden rounded border">
                        {[p.light.background_color, p.light.card_color, p.light.primary_color, p.light.accent_color, p.light.foreground_color].map((c, i) => (
                          <div key={i} className="flex-1" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase text-muted-foreground">Oscuro</p>
                      <div className="flex h-6 overflow-hidden rounded border">
                        {[p.dark.background_color_dark, p.dark.card_color_dark, p.dark.primary_color_dark, p.dark.accent_color_dark, p.dark.foreground_color_dark].map((c, i) => (
                          <div key={i} className="flex-1" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 flex-1 px-1 text-xs" onClick={() => applyPreset(p, "light")}>☀</Button>
                    <Button size="sm" variant="outline" className="h-7 flex-1 px-1 text-xs" onClick={() => applyPreset(p, "dark")}>🌙</Button>
                    <Button size="sm" className="h-7 flex-1 px-1 text-xs" onClick={() => applyPreset(p, "both")}>Ambos</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">☀ Modo claro</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <Field key={`light-${f.key}`} label={f.label}>
                  <div className="flex items-center gap-2">
                    <input type="color" className="h-10 w-14 cursor-pointer rounded border"
                      value={(b[f.key] as string) ?? "#000000"}
                      onChange={(e) => update(f.key, e.target.value as never)} />
                    <Input value={(b[f.key] as string) ?? ""}
                      onChange={(e) => update(f.key, e.target.value as never)} className="font-mono" />
                  </div>
                </Field>
              ))}
            </div>
          </div>
          <div className="border-t pt-6">
            <h3 className="mb-3 text-sm font-semibold">🌙 Modo oscuro</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => {
                const dk = `${f.key}_dark` as keyof Branding;
                return (
                  <Field key={`dark-${f.key}`} label={f.label}>
                    <div className="flex items-center gap-2">
                      <input type="color" className="h-10 w-14 cursor-pointer rounded border"
                        value={(b[dk] as string) ?? "#000000"}
                        onChange={(e) => update(dk, e.target.value as never)} />
                      <Input value={(b[dk] as string) ?? ""}
                        onChange={(e) => update(dk, e.target.value as never)} className="font-mono" />
                    </div>
                  </Field>
                );
              })}
            </div>
          </div>
          <Field label="Border radius">
            <Input value={b.radius} onChange={(e) => update("radius", e.target.value)} placeholder="0.5rem" />
          </Field>
        </TabsContent>

        <TabsContent value="typography" className="mt-6 space-y-4">
          <FontPicker
            label="Fuente de display (titulares)"
            value={b.font_display}
            onChange={(v) => { ensureGoogleFont(v); update("font_display", v); }}
          />
          <FontPicker
            label="Fuente del cuerpo"
            value={b.font_body}
            onChange={(v) => { ensureGoogleFont(v); update("font_body", v); }}
          />
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Vista previa</p>
            <p className="mt-2 text-3xl font-bold" style={{ fontFamily: b.font_display }}>
              The quick brown fox · 1234567890
            </p>
            <p className="mt-1 text-sm" style={{ fontFamily: b.font_body }}>
              Texto de cuerpo: monitorea tu inversor solar en tiempo real con SolarOps.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Las fuentes de Google se cargan automáticamente. Para usar otra, escribe su nombre en "Personalizada".
          </p>
        </TabsContent>

        <TabsContent value="pwa" className="mt-6 space-y-4">
          <Field label="Nombre completo (PWA)">
            <Input value={b.pwa_name} onChange={(e) => update("pwa_name", e.target.value)} />
          </Field>
          <Field label="Nombre corto (icono)">
            <Input value={b.pwa_short_name} onChange={(e) => update("pwa_short_name", e.target.value)} maxLength={12} />
          </Field>
          <Field label="Descripción">
            <Textarea value={b.pwa_description ?? ""} onChange={(e) => update("pwa_description", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Color tema (claro)">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border" value={b.pwa_theme_color} onChange={(e) => update("pwa_theme_color", e.target.value)} />
                <Input value={b.pwa_theme_color} onChange={(e) => update("pwa_theme_color", e.target.value)} />
              </div>
            </Field>
            <Field label="Color tema (oscuro)">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border" value={b.pwa_theme_color_dark} onChange={(e) => update("pwa_theme_color_dark", e.target.value)} />
                <Input value={b.pwa_theme_color_dark} onChange={(e) => update("pwa_theme_color_dark", e.target.value)} />
              </div>
            </Field>
            <Field label="Fondo splash (claro)">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border" value={b.pwa_background_color} onChange={(e) => update("pwa_background_color", e.target.value)} />
                <Input value={b.pwa_background_color} onChange={(e) => update("pwa_background_color", e.target.value)} />
              </div>
            </Field>
            <Field label="Fondo splash (oscuro)">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border" value={b.pwa_background_color_dark} onChange={(e) => update("pwa_background_color_dark", e.target.value)} />
                <Input value={b.pwa_background_color_dark} onChange={(e) => update("pwa_background_color_dark", e.target.value)} />
              </div>
            </Field>
          </div>
          <Field label="Display mode">
            <Select value={b.pwa_display} onValueChange={(v) => update("pwa_display", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standalone">Standalone (app)</SelectItem>
                <SelectItem value="fullscreen">Fullscreen</SelectItem>
                <SelectItem value="minimal-ui">Minimal UI</SelectItem>
                <SelectItem value="browser">Browser</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Icono 192×192 (claro)">
              <ImageUploader value={b.pwa_icon_192 ?? ""} folder="pwa-192"
                onChange={(v) => update("pwa_icon_192", v)} hint="192×192 PNG" />
            </Field>
            <Field label="Icono 192×192 (oscuro)">
              <ImageUploader value={b.pwa_icon_192_dark ?? ""} folder="pwa-192-dark"
                onChange={(v) => update("pwa_icon_192_dark", v as never)} hint="192×192 PNG" />
            </Field>
            <Field label="Icono 512×512 (claro)">
              <ImageUploader value={b.pwa_icon_512 ?? ""} folder="pwa-512"
                onChange={(v) => update("pwa_icon_512", v)} hint="512×512 PNG" />
            </Field>
            <Field label="Icono 512×512 (oscuro)">
              <ImageUploader value={b.pwa_icon_512_dark ?? ""} folder="pwa-512-dark"
                onChange={(v) => update("pwa_icon_512_dark", v as never)} hint="512×512 PNG" />
            </Field>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex gap-2 border-t pt-4">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />{saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button variant="outline" onClick={load}>
          <RotateCcw className="mr-2 h-4 w-4" />Descartar
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ImageUploader({ value, onChange, folder, hint }: { value: string; onChange: (v: string) => void; folder: string; hint?: string }) {
  const [busy, setBusy] = useState(false);
  async function pick(file: File) {
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("branding")
        .upload(path, file, { upsert: true, contentType: file.type || "image/png", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Imagen subida");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-16 w-16 overflow-hidden rounded-lg border bg-muted/30">
            <img src={value} alt="" className="h-full w-full object-contain" />
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">—</div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              {busy ? "Subiendo…" : "Subir imagen"}
              <input type="file" accept="image/*" className="hidden" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
            </label>
            {value && (
              <Button size="sm" variant="ghost" onClick={() => onChange("")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="o pega una URL…" className="h-7 text-xs" />
        </div>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isCustom = !GOOGLE_FONTS.includes(value as (typeof GOOGLE_FONTS)[number]);
  return (
    <Field label={label}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr]">
        <Select value={isCustom ? "__custom__" : value} onValueChange={(v) => onChange(v === "__custom__" ? value : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            {GOOGLE_FONTS.map((f) => (
              <SelectItem key={f} value={f}>
                <span style={{ fontFamily: f }}>{f}</span>
              </SelectItem>
            ))}
            <SelectItem value="__custom__">Personalizada…</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Inter"
          className="font-mono text-sm"
        />
      </div>
    </Field>
  );
}
