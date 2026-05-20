import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User as UserIcon, KeyRound, Mail, Trash2, Smartphone, LayoutGrid } from "lucide-react";

// Reusable settings card matching design captures
function SettingsCard({
  icon: Icon,
  title,
  description,
  tint,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-5 flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tint}`}>
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export const Route = createFileRoute("/account")({
  component: () => (
    <ProtectedLayout>
      <AccountPage />
    </ProtectedLayout>
  ),
});

interface PushSub {
  id: string;
  user_agent: string | null;
  endpoint: string;
  created_at: string;
  last_used_at: string | null;
}

interface MyLicense {
  id: string;
  code: string;
  plan: string;
  duration_days: number;
  redeemed_at: string | null;
  revoked_at: string | null;
  is_lifetime: boolean;
}

function AccountPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [subs, setSubs] = useState<PushSub[]>([]);
  const [lics, setLics] = useState<MyLicense[]>([]);

  async function load() {
    if (!user) return;
    const [{ data: p }, { data: s }, { data: l }] = await Promise.all([
      supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle(),
      supabase.from("push_subscriptions").select("id,user_agent,endpoint,created_at,last_used_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("license_codes").select("id,code,plan,duration_days,redeemed_at,revoked_at,is_lifetime").order("created_at", { ascending: false }),
    ]);
    setFullName(p?.full_name ?? "");
    setNewEmail(p?.email ?? user.email ?? "");
    setSubs((s ?? []) as PushSub[]);
    setLics((l ?? []) as MyLicense[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil actualizado");
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newEmail) return;
    if (newEmail === user.email) return toast.info("Ese ya es tu email actual");
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSavingEmail(false);
    if (error) return toast.error(error.message);
    toast.success("Te enviamos un enlace de confirmación al nuevo email");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Mínimo 8 caracteres");
    if (pwd !== pwd2) return toast.error("Las contraseñas no coinciden");
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) return toast.error(error.message);
    setPwd(""); setPwd2("");
    toast.success("Contraseña actualizada");
  }

  async function removeSub(id: string) {
    if (!confirm("¿Eliminar este dispositivo de las notificaciones push?")) return;
    const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSubs((s) => s.filter((x) => x.id !== id));
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4 animate-fade-up">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
          <UserIcon className="h-7 w-7" strokeWidth={2.2} />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
            <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
          </span>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mi cuenta</h1>
          <p className="text-sm text-muted-foreground">Gestiona tus datos personales, seguridad y dispositivos.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="h-4 w-4" /> Datos personales</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="space-y-2">
              <Label>Email actual</Label>
              <Input value={user.email ?? ""} disabled />
            </div>
            <Button type="submit" disabled={savingProfile} className="w-full sm:w-auto">
              {savingProfile ? "Guardando…" : "Guardar perfil"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Cambiar email</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveEmail} className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Te enviaremos un enlace de confirmación al nuevo correo.</p>
            </div>
            <Button type="submit" disabled={savingEmail} className="w-full sm:w-auto">
              {savingEmail ? "Enviando…" : "Solicitar cambio"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label>Repetir contraseña</Label>
              <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={savingPwd} className="w-full sm:w-auto">
              {savingPwd ? "Guardando…" : "Actualizar contraseña"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4" /> Dispositivos con notificaciones push</CardTitle>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes dispositivos suscritos. Actívalos desde la pestaña Alertas de un sitio.</p>
          ) : (
            <ul className="divide-y">
              {subs.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{shortUA(s.user_agent)}</div>
                    <div className="text-xs text-muted-foreground">Activo desde {new Date(s.created_at).toLocaleDateString()}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeSub(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mis licencias</CardTitle>
        </CardHeader>
        <CardContent>
          {lics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes licencias asignadas.</p>
          ) : (
            <ul className="space-y-2">
              {lics.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
                  <div>
                    <div className="font-mono text-sm">{l.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.plan} · {l.is_lifetime ? "De por vida" : `${l.duration_days} días`}
                    </div>
                  </div>
                  {l.revoked_at ? <Badge variant="destructive">Revocada</Badge>
                    : l.redeemed_at ? <Badge variant="secondary">Activada</Badge>
                    : <Badge>Lista para activar</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function shortUA(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return ua.slice(0, 60);
}
