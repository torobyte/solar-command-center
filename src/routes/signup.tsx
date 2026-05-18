import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useBranding } from "@/lib/branding";
import { signUpWithCustomEmail } from "@/lib/auth-emails.functions";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const signupWithEmail = useServerFn(signUpWithCustomEmail);
  const { t } = useI18n();
  const { branding, resolvedLogo } = useBranding();
  const siteName = branding?.site_name ?? "Mi plataforma";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const mismatch = password2.length > 0 && password !== password2;
  const tooShort = password.length > 0 && password.length < 8;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) return toast.error("Las contraseñas no coinciden");
    if (password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
    setLoading(true);
    try {
      await signupWithEmail({
        data: {
          email,
          password,
          full_name: name,
          origin: window.location.origin,
        },
      });
      toast.success(t("signup.created"));
    } catch (error) {
      setLoading(false);
      return toast.error(error instanceof Error ? error.message : "No se pudo crear la cuenta");
    }
    setLoading(false);
    navigate({ to: "/login" });
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
          <h1 className="text-xl font-semibold">{t("signup.title")}</h1>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("signup.fullName")}</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input id="password" type="password" minLength={8} autoComplete="new-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
              {tooShort && <p className="text-xs text-destructive">Mínimo 8 caracteres</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password2">Repetir contraseña</Label>
              <Input id="password2" type="password" minLength={8} autoComplete="new-password" required
                value={password2} onChange={(e) => setPassword2(e.target.value)}
                aria-invalid={mismatch} className={mismatch ? "border-destructive focus-visible:ring-destructive" : ""} />
              {mismatch && <p className="text-xs text-destructive">Las contraseñas no coinciden</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading || mismatch || tooShort}>
              {loading ? t("signup.submitting") : t("signup.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("signup.have")} <Link to="/login" className="text-accent hover:underline">{t("signup.signin")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
