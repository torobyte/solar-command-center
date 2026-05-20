import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ErrorDialog } from "@/components/ErrorDialog";
import { useAuth } from "@/lib/auth";
import { sendRecoveryEmail } from "@/lib/auth-emails.functions";
import { TorobyteLoginShell } from "@/components/TorobyteLoginShell";
import { LangSwitcher } from "@/components/LangSwitcher";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const sendRecovery = useServerFn(sendRecoveryEmail);
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | undefined>();

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/app", replace: true });
  }, [authLoading, user, navigate]);

  async function attemptLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setErrorDetails(error.message);
        setErrorOpen(true);
        return;
      }
      navigate({ to: "/app", replace: true });
    } catch (err) {
      setErrorDetails(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    if (!email) return toast.error("Escribe tu correo primero");
    try {
      await sendRecovery({ data: { email, origin: window.location.origin } });
      toast.success("Te enviamos un enlace para restablecer la contraseña");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el correo");
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050914]">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <>
      <div className="absolute right-4 top-4 z-10"><LangSwitcher /></div>
      <TorobyteLoginShell
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        loading={loading}
        remember={remember}
        setRemember={setRemember}
        onSubmit={(e) => { e.preventDefault(); attemptLogin(); }}
        onForgot={forgot}
      />
      <ErrorDialog
        open={errorOpen}
        onOpenChange={setErrorOpen}
        kind="login"
        details={errorDetails}
        retrying={loading}
        onRetry={attemptLogin}
      />
    </>
  );
}
