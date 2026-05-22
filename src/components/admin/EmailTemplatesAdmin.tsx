import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { renderEmailPreview, getDefaultEmailHtml } from "@/lib/email-preview.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Eye, Code2, Pencil } from "lucide-react";
import { EmailRichEditor } from "./EmailRichEditor";

interface Tpl {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  enabled: boolean | null;
  wrap_with_brand: boolean | null;
}

const KNOWN: { id: string; name: string }[] = [
  { id: "signup", name: "Signup / bienvenida" },
  { id: "auth_reset", name: "Auth — reset password" },
  { id: "auth_verify", name: "Auth — verificar email" },
  { id: "invite", name: "Invitación a sitio" },
  { id: "alert", name: "Alertas / notificaciones" },
  { id: "license", name: "Licencia" },
];

export function EmailTemplatesAdmin() {
  const [tpls, setTpls] = useState<Record<string, Tpl>>({});
  const [active, setActive] = useState(KNOWN[0].id);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const renderPreview = useServerFn(renderEmailPreview);
  const loadDefault = useServerFn(getDefaultEmailHtml);

  async function load() {
    const { data } = await supabase.from("email_templates").select("*");
    const map: Record<string, Tpl> = {};
    (data as Tpl[] | null)?.forEach((t) => { map[t.id] = t; });
    for (const k of KNOWN) {
      if (!map[k.id]) {
        map[k.id] = {
          id: k.id, name: k.name, subject: "", html_body: "", text_body: "", enabled: true, wrap_with_brand: true,
        };
      }
    }
    setTpls(map);
  }
  useEffect(() => { load(); }, []);

  function up(id: string, patch: Partial<Tpl>) {
    setTpls((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  }

  async function save(id: string) {
    setSaving(true);
    const t = tpls[id];
    const { error } = await supabase.from("email_templates").upsert(t as never, { onConflict: "id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada");
  }

  async function showPreview(id: string) {
    const t = tpls[id];
    setLoadingPreview(true);
    try {
      const res = await renderPreview({
        data: {
          templateId: id,
          subject: t.subject || undefined,
          html: t.html_body || undefined,
          wrapWithBrand: t.wrap_with_brand ?? true,
        },
      });
      setPreview(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function loadDefaultHtml(id: string) {
    try {
      const res = await loadDefault({ data: { templateId: id } });
      up(id, { html_body: res.html, subject: tpls[id]?.subject || res.subject, wrap_with_brand: false });
      toast.success("Plantilla completa cargada — ya puedes editarla por completo");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
        <p>
          Variables: <code>{"{{name}}"}</code> (alias: <code>{"{{full_name}}"}</code>, <code>{"{{first_name}}"}</code>),{" "}
          <code>{"{{email}}"}</code>, <code>{"{{link}}"}</code> (alias: <code>{"{{url}}"}</code>),{" "}
          <code>{"{{site_name}}"}</code>, <code>{"{{message}}"}</code>, <code>{"{{plan}}"}</code>,{" "}
          <code>{"{{expires_at}}"}</code>, <code>{"{{inviter}}"}</code>, <code>{"{{role}}"}</code>.
        </p>
        <p className="text-muted-foreground">
          Por defecto el HTML se inyecta dentro de la plantilla con marca, logo, colores y footer.
          Desactiva <strong>"Envolver con marca"</strong> para editar el HTML completo del correo (puedes
          pulsar <strong>"Cargar plantilla completa"</strong> para empezar desde la plantilla de marca actual).
          Usa "Vista previa" para ver el resultado final.
        </p>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            {KNOWN.map((k) => (
              <TabsTrigger key={k.id} value={k.id}>{k.name}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        {KNOWN.map((k) => {
          const t = tpls[k.id];
          if (!t) return null;
          return (
            <TabsContent key={k.id} value={k.id} className="mt-4 space-y-3 max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{k.name}</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`wrap-${k.id}`} className="text-xs">Envolver con marca</Label>
                    <Switch id={`wrap-${k.id}`} checked={t.wrap_with_brand ?? true} onCheckedChange={(v) => up(k.id, { wrap_with_brand: v })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`en-${k.id}`} className="text-xs">Activa</Label>
                    <Switch id={`en-${k.id}`} checked={!!t.enabled} onCheckedChange={(v) => up(k.id, { enabled: v })} />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Asunto</Label>
                <Input value={t.subject} onChange={(e) => up(k.id, { subject: e.target.value })} placeholder="(usa el predeterminado si lo dejas vacío)" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    Contenido del correo {t.wrap_with_brand === false ? "(documento HTML completo)" : "(cuerpo interior)"}
                  </Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => loadDefaultHtml(k.id)}>
                    <Code2 className="h-3 w-3 mr-1" />Cargar plantilla completa
                  </Button>
                </div>
                <Tabs defaultValue={t.wrap_with_brand === false ? "html" : "visual"} className="mt-1">
                  <TabsList className="h-8">
                    <TabsTrigger value="visual" className="h-7 text-xs gap-1"><Pencil className="h-3 w-3" />Visual</TabsTrigger>
                    <TabsTrigger value="html" className="h-7 text-xs gap-1"><Code2 className="h-3 w-3" />HTML</TabsTrigger>
                  </TabsList>
                  <TabsContent value="visual" className="mt-2">
                    {t.wrap_with_brand === false ? (
                      <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                        El modo "documento HTML completo" desactiva el editor visual porque incluye
                        <code className="mx-1">&lt;html&gt;</code>/<code>&lt;head&gt;</code>. Actívalo en HTML o
                        vuelve a activar "Envolver con marca" para editar visualmente.
                      </p>
                    ) : (
                      <EmailRichEditor
                        value={t.html_body}
                        onChange={(html) => up(k.id, { html_body: html })}
                      />
                    )}
                  </TabsContent>
                  <TabsContent value="html" className="mt-2">
                    <Textarea
                      value={t.html_body}
                      onChange={(e) => up(k.id, { html_body: e.target.value })}
                      rows={t.wrap_with_brand === false ? 24 : 14}
                      className="font-mono text-xs"
                      placeholder="<h1>Hola {{name}}</h1><p>...</p>"
                    />
                  </TabsContent>
                </Tabs>
              </div>
              <div>
                <Label className="text-xs">Texto plano (fallback)</Label>
                <Textarea
                  value={t.text_body ?? ""}
                  onChange={(e) => up(k.id, { text_body: e.target.value })}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => save(k.id)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />{saving ? "Guardando…" : "Guardar plantilla"}
                </Button>
                <Button variant="outline" onClick={() => showPreview(k.id)} disabled={loadingPreview}>
                  <Eye className="h-4 w-4 mr-2" />{loadingPreview ? "Cargando…" : "Vista previa"}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Vista previa · <span className="text-muted-foreground font-normal">{preview?.subject}</span>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe
              title="email-preview"
              srcDoc={preview.html}
              className="w-full h-[70vh] rounded-md border bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
