import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sun } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ErrorDialog } from "@/components/ErrorDialog";
import { useBranding } from "@/lib/branding";
import { useAuth } from "@/lib/auth";
import { sendRecoveryEmail } from "@/lib/auth-emails.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const sendRecovery = useServerFn(sendRecoveryEmail);
  const { t } = useI18n();
  const { branding, resolvedLogo } = useBranding();
  const { user, loading: authLoading } = useAuth();
  const siteName = branding?.site_name ?? "SolarOps";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | undefined>();

  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: "/app", replace: true });
    }
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar sesión";
      setErrorDetails(message);
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await attemptLogin();
  }

  async function withGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) {
      setErrorDetails(result.error.message);
      setErrorOpen(true);
      setLoading(false);
    } else if (!result.redirected) {
      setLoading(false);
      navigate({ to: "/app", replace: true });
    }
  }

  async function forgot() {
    if (!email) return toast.error(t("login.forgotEmpty"));
    try {
      await sendRecovery({ data: { email, origin: window.location.origin } });
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "No se pudo enviar el correo");
    }
    toast.success(t("login.resetSent"));
  }

  if (authLoading) {
    return (
      <div className="ambient-bg flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-4 top-4"><LangSwitcher /></div>
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          {resolvedLogo ? (
            <img src={resolvedLogo} alt={siteName} className="h-12 max-w-[220px] object-contain" />
          ) : (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
                <Sun className="h-5 w-5 text-accent" />
              </div>
              <span className="text-lg font-bold">{siteName}</span>
            </>
          )}
        </Link>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("login.subtitle")}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? t("login.submitting") : t("login.submit")}</Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> {t("login.or")} <div className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={withGoogle}>
            {t("login.google")}
          </Button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" onClick={forgot} className="text-muted-foreground hover:text-foreground">
              {t("login.forgot")}
            </button>
            <Link to="/signup" className="text-accent hover:underline">{t("login.create")}</Link>
          </div>
        </div>
      </div>
      <ErrorDialog
        open={errorOpen}
        onOpenChange={setErrorOpen}
        kind="login"
        details={errorDetails}
        retrying={loading}
        onRetry={attemptLogin}
      />
    </div>
  );
}
