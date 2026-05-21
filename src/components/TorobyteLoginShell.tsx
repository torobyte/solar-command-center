import { type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBranding } from "@/lib/branding";

/**
 * Pantalla de login Torobyte replicando la referencia subida por el usuario.
 * Usada por /login (web) y /app-login (APK).
 */
export function TorobyteLoginShell({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  onSubmit,
  remember,
  setRemember,
  onForgot,
  onBiometric,
  onFaceId,
  showSignupLink = true,
  footer,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  onForgot: () => void;
  onBiometric?: () => void;
  onFaceId?: () => void;
  showSignupLink?: boolean;
  footer?: ReactNode;
}) {
  const { branding, resolvedLogo, resolvedLoginBg } = useBranding();
  const siteName = branding?.site_name ?? "TOROBYTE";
  const overlay = branding?.login_bg_overlay ?? 0.55;
  return (
    <div className="tb-login-theme relative min-h-screen bg-[var(--tb-login-bg)] text-[var(--tb-login-text)]">
      {resolvedLoginBg && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${resolvedLoginBg})` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${overlay})` }}
            aria-hidden
          />
        </>
      )}
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-7 pb-10 pt-12 sm:justify-center">
        <div className="flex flex-col items-center gap-4 pt-8">
          {resolvedLogo ? (
            <img src={resolvedLogo} alt={siteName} className="h-24 w-24 rounded-[22px] object-contain" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-[22px] tb-login-surface text-3xl font-semibold">
              T
            </div>
          )}
          <h1 className="text-[2.2rem] font-medium text-[var(--tb-login-text)]">{siteName}</h1>
        </div>

        <form onSubmit={onSubmit} className="mt-12 space-y-7">
          <Input
            type="email"
            placeholder="tu@empresa.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="tb-login-field h-18 rounded-[22px] border-0 px-6 text-[1.1rem] shadow-none focus-visible:ring-0"
          />
          <Input
            type="password"
            placeholder="••••••••••"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="tb-login-field tb-login-field-accent h-18 rounded-[22px] px-6 text-[1.1rem] shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-1 text-sm">
            <button type="button" onClick={() => setRemember(!remember)} className="tb-login-link transition-colors">
              {remember ? "Recordarme" : "No recordar"}
            </button>
            <button type="button" onClick={onForgot} className="tb-login-link transition-colors">
              Recuperar acceso
            </button>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="tb-login-button h-18 w-full rounded-[22px] text-[1.15rem] font-semibold transition-colors"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
          </Button>
        </form>

        {(onBiometric || onFaceId) && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBiometric}
              className="tb-login-surface h-12 rounded-2xl border-0 text-sm text-[var(--tb-login-text)] hover:bg-[var(--tb-login-surface-strong)] hover:text-[var(--tb-login-text)]"
            >
              Huella
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onFaceId}
              className="tb-login-surface h-12 rounded-2xl border-0 text-sm text-[var(--tb-login-text)] hover:bg-[var(--tb-login-surface-strong)] hover:text-[var(--tb-login-text)]"
            >
              Face ID
            </Button>
          </div>
        )}

        {showSignupLink && (
          <div className="mt-8 text-center text-sm text-[var(--tb-login-muted)]">
            ¿Nuevo aquí?{" "}
            <Link to="/signup" className="text-[var(--tb-login-text)] underline underline-offset-4">
              Crear cuenta
            </Link>
          </div>
        )}

        {footer && <div className="mt-auto pt-6">{footer}</div>}
      </div>
    </div>
  );
}
