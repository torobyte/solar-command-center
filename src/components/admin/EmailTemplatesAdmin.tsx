import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { renderEmailPreview } from "@/lib/email-preview.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Eye } from "lucide-react";

interface Tpl {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  enabled: boolean | null;
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

  async function load() {
    const { data } = await supabase.from("email_templates").select("*");
    const map: Record<string, Tpl> = {};
    (data as Tpl[] | null)?.forEach((t) => { map[t.id] = t; });
    for (const k of KNOWN) {
      if (!map[k.id]) {
        map[k.id] = {
          id: k.id, name: k.name, subject: "", html_body: "", text_body: "", enabled: true,
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
        },
      });
      setPreview(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingPreview(false);
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
          El HTML que escribas se inyecta dentro de la plantilla con marca, logo, colores y footer.
          Usa "Vista previa" para ver el resultado final tal como llega al correo.
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
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{k.name}</h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`en-${k.id}`} className="text-xs">Activa</Label>
                  <Switch id={`en-${k.id}`} checked={!!t.enabled} onCheckedChange={(v) => up(k.id, { enabled: v })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Asunto</Label>
                <Input value={t.subject} onChange={(e) => up(k.id, { subject: e.target.value })} placeholder="(usa el predeterminado si lo dejas vacío)" />
              </div>
              <div>
                <Label className="text-xs">HTML (cuerpo interior)</Label>
                <Textarea
                  value={t.html_body}
                  onChange={(e) => up(k.id, { html_body: e.target.value })}
                  rows={14}
                  className="font-mono text-xs"
                  placeholder="<h1>Hola {{name}}</h1><p>...</p>"
                />
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
