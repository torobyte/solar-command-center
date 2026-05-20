import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, Fingerprint, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useBranding } from "@/lib/branding";

/**
 * Pantalla de login estilo Torobyte (oscura, hero con batería, glass-card).
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
  const { branding, resolvedLogo } = useBranding();
  const siteName = branding?.site_name ?? "TOROBYTE";
  const [showPwd, setShowPwd] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050914] text-slate-100">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.35),transparent_60%)] blur-2xl" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.18),transparent_60%)] blur-3xl" />
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.25) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(to top, black, transparent)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-8">
        {/* Logo + name */}
        <div className="flex flex-col items-center gap-2 pt-6">
          {resolvedLogo ? (
            <img src={resolvedLogo} alt={siteName} className="h-14 max-w-[200px] object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-[0_0_30px_rgba(56,189,248,0.55)]">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-[0.18em] text-white">
            {siteName.toUpperCase()}
          </h1>
          <p className="text-xs font-medium tracking-[0.35em] text-sky-400">
            SOLAR <span className="text-amber-400">MONITOR</span>
          </p>
        </div>

        {/* Battery hero */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute h-44 w-44 rounded-full border border-sky-500/30" />
          <div className="absolute h-52 w-52 rounded-full border border-sky-500/15" />
          <div className="absolute h-60 w-60 rounded-full border border-sky-500/10" />
          <div className="relative flex h-40 w-24 items-end justify-center rounded-2xl border-2 border-sky-400/60 bg-gradient-to-b from-sky-500/10 to-orange-500/10 p-2 shadow-[0_0_40px_rgba(56,189,248,0.35)]">
            <div className="absolute -top-2 left-1/2 h-2 w-8 -translate-x-1/2 rounded-sm bg-sky-400" />
            <div className="h-3/4 w-full rounded-xl bg-gradient-to-t from-amber-500 via-amber-400 to-sky-400 shadow-[0_0_30px_rgba(251,191,36,0.6)]">
              <div className="flex h-full items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-white/90 drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">
                  <path d="M13 2 L4 14 H11 L9 22 L20 9 H13 Z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Glass card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="text-2xl font-bold">
            Bienvenido <span className="text-sky-400">de nuevo</span>
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Ingresa a tu cuenta para continuar monitoreando tu sistema solar.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                type="email"
                placeholder="tu@empresa.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl border-white/10 bg-white/[0.04] pl-11 text-base text-white placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:ring-sky-400/30"
              />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                type={showPwd ? "text" : "password"}
                placeholder="••••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl border-white/10 bg-white/[0.04] pl-11 pr-11 text-base text-white placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:ring-sky-400/30"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:text-white"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1 text-sm">
              <label className="flex items-center gap-2 text-slate-300">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                  className="border-white/20 data-[state=checked]:border-sky-400 data-[state=checked]:bg-sky-500"
                />
                Recordarme
              </label>
              <button
                type="button"
                onClick={onForgot}
                className="font-medium text-sky-400 hover:text-sky-300"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-3 h-12 w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-base font-semibold shadow-[0_8px_30px_rgba(56,189,248,0.35)] transition hover:from-sky-400 hover:to-blue-400"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Iniciar sesión
                </>
              )}
            </Button>
          </form>

          {(onBiometric || onFaceId) && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
                <div className="h-px flex-1 bg-white/10" />
                o continúa con
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBiometric}
                  className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:text-white"
                >
                  <Fingerprint className="mr-2 h-5 w-5 text-sky-400" />
                  Huella digital
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onFaceId}
                  className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:text-white"
                >
                  <ScanFace className="mr-2 h-5 w-5 text-sky-400" />
                  Face ID
                </Button>
              </div>
            </>
          )}

          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
            Acceso seguro y protegido con encriptación de nivel bancario.
          </p>

          {showSignupLink && (
            <div className="mt-4 text-center text-sm text-slate-400">
              ¿Nuevo aquí?{" "}
              <Link to="/signup" className="font-medium text-sky-400 hover:text-sky-300">
                Crear cuenta
              </Link>
            </div>
          )}
        </div>

        {footer && <div className="mt-auto pt-6">{footer}</div>}
      </div>
    </div>
  );
}
