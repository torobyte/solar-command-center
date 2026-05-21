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
import { LicensesPanel } from "@/components/LicensesPanel";

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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-4 animate-fade-up">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100">
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

      <div className="grid gap-6 md:grid-cols-2 animate-fade-up">

      <SettingsCard icon={UserIcon} title="Datos personales" description="Actualiza tu información personal." tint="bg-blue-50 text-blue-600">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <div className="relative">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" className="pr-9" />
              <UserIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email actual</Label>
            <div className="relative">
              <Input value={user.email ?? ""} disabled className="pr-9" />
              <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <Button type="submit" disabled={savingProfile} className="rounded-xl">
            {savingProfile ? "Guardando…" : "Guardar perfil"}
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard icon={Mail} title="Cambiar email" description="Actualiza tu dirección de correo electrónico." tint="bg-emerald-50 text-emerald-600">
        <form onSubmit={saveEmail} className="space-y-4">
          <div className="space-y-2">
            <Label>Nuevo email</Label>
            <div className="relative">
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="pr-9" />
              <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Te enviaremos un enlace de confirmación al nuevo correo.</p>
          </div>
          <Button type="submit" disabled={savingEmail} variant="outline" className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            {savingEmail ? "Enviando…" : "Solicitar cambio"}
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard icon={KeyRound} title="Cambiar contraseña" description="Asegura tu cuenta actualizando tu contraseña." tint="bg-amber-50 text-amber-600">
        <form onSubmit={savePassword} className="space-y-4">
          <div className="space-y-2">
            <Label>Nueva contraseña</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label>Repetir contraseña</Label>
            <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required minLength={8} />
            <p className="text-xs text-muted-foreground">Usa al menos 8 caracteres con letras, números y símbolos.</p>
          </div>
          <Button type="submit" disabled={savingPwd} className="rounded-xl bg-amber-500 text-white hover:bg-amber-600">
            {savingPwd ? "Guardando…" : "Actualizar contraseña"}
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard icon={Smartphone} title="Dispositivos con notificaciones push" description="Administra los dispositivos autorizados para recibir notificaciones." tint="bg-violet-50 text-violet-600">
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tienes dispositivos suscritos. Actívalos desde la pestaña Alertas de un sitio.</p>
        ) : (
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{shortUA(s.user_agent)}</div>
                  <div className="text-xs text-muted-foreground">Activo desde {new Date(s.created_at).toLocaleDateString()}</div>
                </div>
                <Button size="sm" variant="outline" className="h-8 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => removeSub(s.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      </div>

      <SettingsCard icon={LayoutGrid} title="Mis licencias" description="Revisa, copia y transfiere tus licencias entre sitios." tint="bg-sky-50 text-sky-600">
        <LicensesPanel />
      </SettingsCard>
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
