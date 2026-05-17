import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBranding } from "@/lib/branding";
import { Sun, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app-login")({
  component: AppLoginPage,
});

declare global {
  interface Window {
    SolarWidgetBridge?: {
      saveToken?: (payload: string) => void;
      saveSession?: (payload: string) => void;
      clearSession?: () => void;
    };
  }
}

function AppLoginPage() {
  const navigate = useNavigate();
  const { branding, resolvedLogo } = useBranding();
  const primary = branding?.primary_color ?? "#f59e0b";
  const bg = branding?.background_color_dark ?? "#0a0a0a";
  const fg = branding?.foreground_color_dark ?? "#fafafa";
  const siteName = branding?.site_name ?? "SolarOps";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // si ya hay sesión, salta directo a widgets
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data.user) {
        pushTokenToNative().finally(() => {
          if (!cancelled) navigate({ to: "/apk-auth", replace: true });
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function pushTokenToNative() {
    try {
      const { ensureWidgetToken } = await import("@/lib/widgets.functions");
      const r = await ensureWidgetToken();
      const payload = JSON.stringify({ token: r.token, tokenId: r.id });
      try { localStorage.setItem("solar_widget_token", payload); } catch {}
      if (typeof window !== "undefined" && window.SolarWidgetBridge?.saveToken) {
        window.SolarWidgetBridge.saveToken(payload);
      }
    } catch {
      // sin internet o sin sesión todavía
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.SolarWidgetBridge?.saveSession?.(JSON.stringify(data.session));
      }
    } catch {}
    await pushTokenToNative();
    setLoading(false);
    navigate({ to: "/apk-auth", replace: true });
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-between px-6 py-10"
      style={{ background: bg, color: fg }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mt-6">
          {resolvedLogo ? (
            <img src={resolvedLogo} alt={siteName} className="h-20 max-w-[240px] object-contain" />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg"
              style={{ background: primary }}
            >
              <Sun className="h-10 w-10 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{siteName}</h1>
          <p className="text-sm opacity-70 text-center">
            Inicia sesión para acceder a tu sistema solar
          </p>
        </div>

        <form onSubmit={onSubmit} className="w-full space-y-4">
          <div>
            <Input
              type="email"
              placeholder="correo@dominio.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-base rounded-2xl border-0"
              style={{ background: "rgba(255,255,255,0.08)", color: fg }}
            />
          </div>
          <div>
            <Input
              type="password"
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-14 text-base rounded-2xl border-0"
              style={{ background: "rgba(255,255,255,0.08)", color: fg }}
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-2xl text-base font-semibold shadow-lg"
            style={{ background: primary, color: "#fff" }}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-3 text-sm">
          <button
            type="button"
            onClick={async () => {
              if (!email) return toast.error("Escribe tu correo primero");
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) return toast.error(error.message);
              toast.success("Te enviamos un enlace para restablecer la contraseña");
            }}
            className="opacity-70 hover:opacity-100"
          >
            ¿Olvidaste tu contraseña?
          </button>
          <Link to="/signup" className="opacity-70 hover:opacity-100" style={{ color: primary }}>
            Crear cuenta nueva
          </Link>
        </div>
      </div>

      <p className="text-xs opacity-50 mt-6">v{branding ? "" : ""}1.0</p>
    </div>
  );
}
