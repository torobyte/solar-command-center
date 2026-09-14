import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TorobyteLoginShell } from "@/components/TorobyteLoginShell";

export const Route = createFileRoute("/app-login")({
  head: () => ({
    meta: [
      { title: "Acceso móvil | Torobyte Solar" },
      { name: "description", content: "Accede desde tu móvil al monitoreo de tus instalaciones solares." },
      { property: "og:title", content: "Acceso móvil | Torobyte Solar" },
      { property: "og:description", content: "Accede desde tu móvil al monitoreo de tus instalaciones solares." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppLoginPage,
});

declare global {
  interface Window {
    SolarWidgetBridge?: {
      saveToken?: (payload: string) => void;
      saveSession?: (payload: string) => void;
      clearSession?: () => void;
      biometricLogin?: () => void;
      faceIdLogin?: () => void;
    };
  }
}

function AppLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const loginInFlight = useRef(false);

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
    return () => { cancelled = true; };
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
    } catch {}
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loginInFlight.current || !email.trim() || !password) return;
    loginInFlight.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const message = error.message.toLowerCase();
        if ((error as unknown as { status?: number }).status === 429 || message.includes("rate limit") || message.includes("too many")) {
          toast.error("El servicio de acceso está temporalmente ocupado. Espera un momento y vuelve a intentarlo.");
        } else if (message.includes("invalid login") || message.includes("invalid credentials")) {
          toast.error("Correo o contraseña incorrectos.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) window.SolarWidgetBridge?.saveSession?.(JSON.stringify(data.session));
      await pushTokenToNative();
      navigate({ to: "/app", replace: true });
    } catch {
      toast.error("No pudimos conectar con el servicio de acceso. Revisa tu conexión y vuelve a intentarlo.");
    } finally {
      loginInFlight.current = false;
      setLoading(false);
    }
  }

  async function forgot() {
    if (!email) return toast.error("Escribe tu correo primero");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Te enviamos un enlace para restablecer la contraseña");
  }

  return (
    <TorobyteLoginShell
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      loading={loading}
      remember={remember}
      setRemember={setRemember}
      onSubmit={submit}
      onForgot={forgot}
      onBiometric={() => window.SolarWidgetBridge?.biometricLogin?.() ?? toast.info("Disponible en la APK")}
      onFaceId={() => window.SolarWidgetBridge?.faceIdLogin?.() ?? toast.info("Disponible en la APK")}
    />
  );
}
