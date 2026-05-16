import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/apk-auth")({
  component: ApkAuthPage,
});

const NATIVE_BOOTSTRAP_KEY = "solarops_native_session_bootstrap";

function ApkAuthPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Validando acceso…");
  const nativeBridge = typeof window !== "undefined"
    ? (window.SolarWidgetBridge as { saveSession?: (payload: string) => void; clearSession?: () => void } | undefined)
    : undefined;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const raw = localStorage.getItem(NATIVE_BOOTSTRAP_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            access_token?: string;
            refresh_token?: string;
          };

          if (parsed.access_token && parsed.refresh_token) {
            setMessage("Sincronizando sesión…");
            const { error } = await supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            });
            if (error) throw error;

            const { data } = await supabase.auth.getSession();
            if (data.session) {
              try {
                nativeBridge?.saveSession?.(JSON.stringify(data.session));
              } catch {}
            }
          }
          localStorage.removeItem(NATIVE_BOOTSTRAP_KEY);
        }

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session) {
          navigate({ to: "/app", replace: true });
        } else {
          navigate({ to: "/app-login", replace: true });
        }
      } catch {
        try {
          localStorage.removeItem(NATIVE_BOOTSTRAP_KEY);
          nativeBridge?.clearSession?.();
        } catch {}
        if (!cancelled) navigate({ to: "/app-login", replace: true });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="ambient-bg flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}