import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type VerifyType = "signup" | "recovery" | "invite" | "magiclink" | "email_change" | "email";

const ALLOWED: VerifyType[] = [
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
  "email",
];

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: (search: Record<string, unknown>) => ({
    token_hash: typeof search.token_hash === "string" ? search.token_hash : "",
    type: typeof search.type === "string" ? (search.type as VerifyType) : ("signup" as VerifyType),
    next: typeof search.next === "string" ? search.next : "/app",
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token_hash, type, next } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Verificando tu enlace…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token_hash || !ALLOWED.includes(type)) {
        setStatus("error");
        setMessage("Enlace inválido o incompleto.");
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });
      if (cancelled) return;
      if (error) {
        setStatus("error");
        setMessage(error.message || "No se pudo verificar el enlace. Es posible que haya expirado.");
        return;
      }
      setStatus("ok");
      setMessage("Verificado. Redirigiendo…");
      const safeNext = next.startsWith("/") ? next : "/app";
      setTimeout(() => navigate({ to: safeNext as any, replace: true }), 600);
    })();
    return () => {
      cancelled = true;
    };
  }, [token_hash, type, next, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-foreground mb-2">
          {status === "working" && "Confirmando…"}
          {status === "ok" && "¡Listo!"}
          {status === "error" && "No se pudo confirmar"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <a
            href="/login"
            className="inline-flex mt-6 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ir al inicio de sesión
          </a>
        )}
      </div>
    </div>
  );
}
