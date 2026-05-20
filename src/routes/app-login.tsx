import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TorobyteLoginShell } from "@/components/TorobyteLoginShell";

export const Route = createFileRoute("/app-login")({ component: AppLoginPage });

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
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) window.SolarWidgetBridge?.saveSession?.(JSON.stringify(data.session));
    } catch {}
    await pushTokenToNative();
    setLoading(false);
    navigate({ to: "/apk-auth", replace: true });
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
