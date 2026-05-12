import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { applyBrandingToDOM, useBranding, type Branding } from "@/lib/branding";
import { Save, RotateCcw } from "lucide-react";

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
          <Field label="URL del logo">
            <Input value={b.logo_url ?? ""} onChange={(e) => update("logo_url", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="URL del favicon">
            <Input value={b.favicon_url ?? ""} onChange={(e) => update("favicon_url", e.target.value)} placeholder="https://… (32x32 PNG/SVG)" />
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
          <Field label="Fuente de display (titulares)">
            <Input value={b.font_display} onChange={(e) => update("font_display", e.target.value)} placeholder="Inter, sans-serif" />
          </Field>
          <Field label="Fuente del cuerpo">
            <Input value={b.font_body} onChange={(e) => update("font_body", e.target.value)} placeholder="Inter, sans-serif" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Indica una fuente del sistema o ya cargada en el sitio (ej. Inter, "SF Pro Display").
            Para fuentes custom, agrega el &lt;link&gt; correspondiente al sitio.
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
          <Field label="Icono 192×192 (URL PNG)">
            <Input value={b.pwa_icon_192 ?? ""} onChange={(e) => update("pwa_icon_192", e.target.value)} placeholder="https://… 192x192 PNG" />
          </Field>
          <Field label="Icono 512×512 (URL PNG)">
            <Input value={b.pwa_icon_512 ?? ""} onChange={(e) => update("pwa_icon_512", e.target.value)} placeholder="https://… 512x512 PNG" />
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
