import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Save } from "lucide-react";

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
  { id: "alert", name: "Alertas / notificaciones" },
  { id: "license", name: "Licencia" },
];

export function EmailTemplatesAdmin() {
  const [tpls, setTpls] = useState<Record<string, Tpl>>({});
  const [active, setActive] = useState(KNOWN[0].id);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("email_templates").select("*");
    const map: Record<string, Tpl> = {};
    (data as Tpl[] | null)?.forEach((t) => { map[t.id] = t; });
    // Fill missing
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Variables disponibles: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{link}}"}</code>, <code>{"{{site_name}}"}</code>, <code>{"{{message}}"}</code>.
      </p>
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
                <Input value={t.subject} onChange={(e) => up(k.id, { subject: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">HTML</Label>
                <Textarea
                  value={t.html_body}
                  onChange={(e) => up(k.id, { html_body: e.target.value })}
                  rows={14}
                  className="font-mono text-xs"
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
              <Button onClick={() => save(k.id)} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />{saving ? "Guardando…" : "Guardar plantilla"}
              </Button>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
