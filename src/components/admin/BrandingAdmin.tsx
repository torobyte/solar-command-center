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
import { Save, RotateCcw, Upload, X } from "lucide-react";

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
    applyBrandingToDOM(next);
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
          <Field label="Logo">
            <ImageUploader value={b.logo_url ?? ""} folder="logo"
              onChange={(v) => update("logo_url", v)} hint="PNG/SVG transparente · ideal 256×64" />
          </Field>
          <Field label="Favicon">
            <ImageUploader value={b.favicon_url ?? ""} folder="favicon"
              onChange={(v) => update("favicon_url", v)} hint="32×32 PNG/SVG" />
          </Field>
        </TabsContent>

        <TabsContent value="colors" className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-10 w-14 cursor-pointer rounded border"
                    value={(b[f.key] as string) ?? "#000000"}
                    onChange={(e) => update(f.key, e.target.value as never)}
                  />
                  <Input
                    value={(b[f.key] as string) ?? ""}
                    onChange={(e) => update(f.key, e.target.value as never)}
                    className="font-mono"
                  />
                </div>
              </Field>
            ))}
          </div>
          <Field label="Border radius" className="mt-4">
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
            <Field label="Color tema (barra)">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border" value={b.pwa_theme_color} onChange={(e) => update("pwa_theme_color", e.target.value)} />
                <Input value={b.pwa_theme_color} onChange={(e) => update("pwa_theme_color", e.target.value)} />
              </div>
            </Field>
            <Field label="Color de fondo (splash)">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border" value={b.pwa_background_color} onChange={(e) => update("pwa_background_color", e.target.value)} />
                <Input value={b.pwa_background_color} onChange={(e) => update("pwa_background_color", e.target.value)} />
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
          <Field label="Icono 192×192">
            <ImageUploader value={b.pwa_icon_192 ?? ""} folder="pwa-192"
              onChange={(v) => update("pwa_icon_192", v)} hint="192×192 PNG cuadrado" />
          </Field>
          <Field label="Icono 512×512">
            <ImageUploader value={b.pwa_icon_512 ?? ""} folder="pwa-512"
              onChange={(v) => update("pwa_icon_512", v)} hint="512×512 PNG cuadrado" />
          </Field>
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
