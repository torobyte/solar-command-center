import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Send, Mail } from "lucide-react";

interface SmtpRow {
  key: string;
  enabled: boolean | null;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  username: string | null;
  password: string | null;
  from_email: string | null;
  from_name: string | null;
}

export function SmtpAdmin() {
  const [s, setS] = useState<SmtpRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  async function load() {
    const { data } = await supabase.from("smtp_settings").select("*").eq("key", "global").maybeSingle();
    setS((data as SmtpRow) || {
      key: "global", enabled: false, host: "", port: 587, secure: false,
      username: "", password: "", from_email: "", from_name: "SolarOps",
    });
  }
  useEffect(() => { load(); }, []);

  function up<K extends keyof SmtpRow>(k: K, v: SmtpRow[K]) {
    if (!s) return; setS({ ...s, [k]: v });
  }

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase.from("smtp_settings").upsert(s as never, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuración SMTP guardada");
  }

  async function sendTest() {
    if (!testTo.trim()) return toast.error("Ingresa un correo destino");
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/smtp-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Error enviando");
      toast.success("Correo de prueba enviado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setTesting(false); }
  }

  if (!s) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />SMTP</h2>
            <p className="text-xs text-muted-foreground">Servidor de correo saliente para todos los emails de la plataforma.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="smtp-enabled" className="text-xs">Activo</Label>
            <Switch id="smtp-enabled" checked={!!s.enabled} onCheckedChange={(v) => up("enabled", v)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Host</Label>
            <Input value={s.host ?? ""} onChange={(e) => up("host", e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <Label className="text-xs">Puerto</Label>
            <Input type="number" value={s.port ?? 587} onChange={(e) => up("port", Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Usuario</Label>
            <Input value={s.username ?? ""} onChange={(e) => up("username", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Contraseña</Label>
            <Input type="password" value={s.password ?? ""} onChange={(e) => up("password", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">From email</Label>
            <Input value={s.from_email ?? ""} onChange={(e) => up("from_email", e.target.value)} placeholder="no-reply@tudominio.com" />
          </div>
          <div>
            <Label className="text-xs">From nombre</Label>
            <Input value={s.from_name ?? ""} onChange={(e) => up("from_name", e.target.value)} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="smtp-secure" checked={!!s.secure} onCheckedChange={(v) => up("secure", v)} />
            <Label htmlFor="smtp-secure" className="text-xs">Conexión TLS/SSL (port 465)</Label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Probar configuración</h3>
        <p className="text-xs text-muted-foreground">Envía un correo de prueba para verificar credenciales.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="destino@correo.com" />
          <Button onClick={sendTest} disabled={testing} variant="secondary">
            <Send className="h-4 w-4 mr-2" />{testing ? "Enviando…" : "Enviar prueba"}
          </Button>
        </div>
      </div>
    </div>
  );
}
