import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    SolarWidgetBridge?: {
      saveSession?: (payload: string) => void;
      clearSession?: () => void;
      getLaunchDiagnostics?: () => string;
      appendLaunchLog?: (message: string) => void;
    };
  }
}

export const Route = createFileRoute("/apk-auth")({
  component: ApkAuthPage,
});

const NATIVE_BOOTSTRAP_KEY = "solarops_native_session_bootstrap";
const SUPABASE_AUTH_STORAGE_KEY = "sb-mtsxmdwraxnwobxsdrqr-auth-token";

type StepState = "pending" | "running" | "success" | "error";

type DiagnosticStep = {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
};

type NativeDiagnostics = {
  bootstrap_version?: string;
  activity_name?: string;
  base_url?: string;
  initial_url?: string;
  webview_url?: string;
  session_present?: boolean;
  last_log?: string;
  logs?: string[];
};

const INITIAL_STEPS: DiagnosticStep[] = [
  { key: "native", label: "Verificación del arranque Android", state: "pending" },
  { key: "bootstrap", label: "Lectura del bootstrap nativo", state: "pending" },
  { key: "setSession", label: "supabase.auth.setSession", state: "pending" },
  { key: "getSession", label: "supabase.auth.getSession", state: "pending" },
  { key: "getUser", label: "supabase.auth.getUser", state: "pending" },
  { key: "route", label: "Decisión final antes de /app", state: "pending" },
];

function maskToken(value?: string | null) {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function readLocalStorageValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseNativeDiagnostics(raw?: string | null): NativeDiagnostics | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NativeDiagnostics;
    return {
      ...parsed,
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return null;
  }
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "success") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (state === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (state === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <div className="h-4 w-4 rounded-full border border-border bg-muted" />;
}

function ApkAuthPage() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<DiagnosticStep[]>(INITIAL_STEPS);
  const [message, setMessage] = useState("Preparando diagnóstico…");
  const [nativeDiagnostics, setNativeDiagnostics] = useState<NativeDiagnostics | null>(null);
  const [bootstrapSession, setBootstrapSession] = useState<{
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  } | null>(null);
  const [webSession, setWebSession] = useState<{
    accessToken?: string | null;
    refreshToken?: string | null;
    userId?: string | null;
  } | null>(null);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [autoContinue, setAutoContinue] = useState(true);
  const nativeBridge = typeof window !== "undefined"
    ? window.SolarWidgetBridge
    : undefined;

  const storageSnapshot = useMemo(() => {
    const authStorage = readLocalStorageValue(SUPABASE_AUTH_STORAGE_KEY);
    return {
      bootstrapPresent: !!readLocalStorageValue(NATIVE_BOOTSTRAP_KEY),
      authStoragePresent: !!authStorage,
      authStoragePreview: maskToken(authStorage),
    };
  }, [steps, webSession, bootstrapSession]);

  const updateStep = (key: string, patch: Partial<DiagnosticStep>) => {
    setSteps((current) =>
      current.map((step) => (step.key === key ? { ...step, ...patch } : step)),
    );
  };

  const refreshNativeDiagnostics = () => {
    try {
      const raw = nativeBridge?.getLaunchDiagnostics?.();
      const parsed = parseNativeDiagnostics(raw);
      if (parsed) setNativeDiagnostics(parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const appendBridgeLog = (entry: string) => {
    try {
      nativeBridge?.appendLaunchLog?.(entry);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    let continueTimer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        updateStep("native", { state: "running", detail: "Consultando logs del launcher Android" });
        const nativeInfo = refreshNativeDiagnostics();
        if (nativeInfo?.activity_name) {
          updateStep("native", {
            state: "success",
            detail: `${nativeInfo.activity_name} · ${nativeInfo.bootstrap_version ?? "sin versión"}`,
          });
        } else {
          updateStep("native", {
            state: "error",
            detail: "No se pudo leer el bridge nativo o la Activity no expuso diagnóstico.",
          });
        }

        const raw = localStorage.getItem(NATIVE_BOOTSTRAP_KEY);
        appendBridgeLog(`apk-auth inició; bootstrap=${raw ? "present" : "missing"}`);
        updateStep("bootstrap", { state: "running", detail: raw ? "Payload encontrado en localStorage" : "No hay payload bootstrap" });

        if (raw) {
          const parsed = JSON.parse(raw) as {
            access_token?: string;
            refresh_token?: string;
            expires_at?: number;
            expires_in?: number;
          };
          setBootstrapSession(parsed);
          updateStep("bootstrap", {
            state: "success",
            detail: `access=${parsed.access_token ? "sí" : "no"} · refresh=${parsed.refresh_token ? "sí" : "no"}`,
          });

          if (parsed.access_token && parsed.refresh_token) {
            setMessage("Sincronizando sesión en la WebView…");
            updateStep("setSession", { state: "running", detail: "Escribiendo sesión en Supabase Auth" });
            appendBridgeLog("Ejecutando supabase.auth.setSession desde /apk-auth");
            const { error } = await supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            });
            if (error) throw error;
            updateStep("setSession", { state: "success", detail: "setSession completado sin error" });

            updateStep("getSession", { state: "running", detail: "Leyendo sesión persistida" });
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (sessionData.session) {
              setWebSession({
                accessToken: sessionData.session.access_token,
                refreshToken: sessionData.session.refresh_token,
                userId: sessionData.session.user.id,
              });
              updateStep("getSession", {
                state: "success",
                detail: `session.user=${sessionData.session.user.id}`,
              });
              try {
                nativeBridge?.saveSession?.(JSON.stringify(sessionData.session));
              } catch {}
            } else {
              updateStep("getSession", {
                state: "error",
                detail: "getSession devolvió null después de setSession",
              });
            }
          } else {
            updateStep("setSession", {
              state: "error",
              detail: "El bootstrap no contiene access_token y refresh_token válidos",
            });
          }
          localStorage.removeItem(NATIVE_BOOTSTRAP_KEY);
          appendBridgeLog("Bootstrap eliminado de localStorage tras el intento de sincronización");
        } else {
          updateStep("bootstrap", { state: "error", detail: "No existe solarops_native_session_bootstrap en localStorage" });
        }

        updateStep("getUser", { state: "running", detail: "Consultando usuario actual" });
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;

        if (!error && data.user) {
          updateStep("getUser", { state: "success", detail: `${data.user.id} · ${data.user.email ?? "sin email"}` });
          updateStep("route", { state: "success", detail: "La sesión parece válida; listo para entrar a /app" });
          setMessage("Sesión validada. Mostrando diagnóstico antes de entrar…");
          appendBridgeLog(`getUser OK para ${data.user.id}; listo para navegar a /app`);
          if (autoContinue) {
            continueTimer = setTimeout(() => {
              navigate({ to: "/app", replace: true });
            }, 4000);
          }
        } else {
          updateStep("getUser", {
            state: "error",
            detail: error?.message ?? "getUser no devolvió usuario autenticado",
          });
          updateStep("route", { state: "error", detail: "Se redirige al login porque la sesión no quedó válida" });
          setFinalError(error?.message ?? "getUser no devolvió usuario");
          setMessage("La sesión no quedó válida; revisa el diagnóstico.");
          appendBridgeLog(`getUser falló: ${error?.message ?? "sin usuario"}`);
        }
      } catch (err) {
        const messageText = err instanceof Error ? err.message : "Fallo desconocido al validar la sesión";
        try {
          localStorage.removeItem(NATIVE_BOOTSTRAP_KEY);
          nativeBridge?.clearSession?.();
        } catch {}
        if (!cancelled) {
          updateStep("setSession", { state: "error", detail: messageText });
          updateStep("route", { state: "error", detail: "No es seguro entrar a /app" });
          setFinalError(messageText);
          setMessage("Falló la validación de la sesión.");
          appendBridgeLog(`Excepción en /apk-auth: ${messageText}`);
          refreshNativeDiagnostics();
        }
      }
      refreshNativeDiagnostics();
    };

    void run();
    return () => {
      cancelled = true;
      if (continueTimer) clearTimeout(continueTimer);
    };
  }, [autoContinue, navigate]);

  const hasBlockingError = steps.some((step) => step.state === "error");

  return (
    <div className="ambient-bg min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" /> Diagnóstico de login APK
            </div>
            <h1 className="mt-3 text-2xl font-semibold">Estado de autenticación antes de /app</h1>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
              className="rounded-full"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" /> Reintentar
            </Button>
            <Button
              type="button"
              variant={hasBlockingError ? "default" : "secondary"}
              onClick={() => navigate({ to: hasBlockingError ? "/app-login" : "/app", replace: true })}
              className="rounded-full"
            >
              {hasBlockingError ? "Ir al login" : "Entrar ahora"}
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>

        {!hasBlockingError && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {autoContinue ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>Si todo está correcto, la app avanzará automáticamente a <code>/app</code> en unos segundos.</span>
                <Button type="button" variant="ghost" className="h-8 rounded-full px-3" onClick={() => setAutoContinue(false)}>
                  Mantener esta pantalla
                </Button>
              </div>
            ) : (
              <span>La navegación automática está pausada para que puedas revisar el diagnóstico.</span>
            )}
          </div>
        )}

        {finalError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {finalError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-base font-semibold">Validaciones del flujo</h2>
            <div className="mt-4 space-y-3">
              {steps.map((step) => (
                <div key={step.key} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                  <div className="mt-0.5"><StepIcon state={step.state} /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{step.detail ?? "Pendiente"}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-base font-semibold">Tokens y sesión</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bootstrap access token</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{maskToken(bootstrapSession?.access_token)}</dd>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bootstrap refresh token</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{maskToken(bootstrapSession?.refresh_token)}</dd>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Web session access token</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{maskToken(webSession?.accessToken)}</dd>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Web session user_id</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{webSession?.userId ?? "—"}</dd>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">localStorage auth key</dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {storageSnapshot.authStoragePresent ? storageSnapshot.authStoragePreview : "No presente"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-base font-semibold">Arranque Android detectado</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Activity</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{nativeDiagnostics?.activity_name ?? "No detectada"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bootstrap version</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{nativeDiagnostics?.bootstrap_version ?? "No detectada"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Initial URL</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{nativeDiagnostics?.initial_url ?? "No detectada"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">WebView URL actual</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{nativeDiagnostics?.webview_url ?? "No detectada"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Base URL</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{nativeDiagnostics?.base_url ?? "No detectada"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bootstrap localStorage presente</dt>
                  <dd className="mt-1 text-xs">{storageSnapshot.bootstrapPresent ? "Sí" : "No"}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>

        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Logs visibles del launcher</h2>
            <Button type="button" variant="ghost" className="h-8 rounded-full px-3" onClick={() => refreshNativeDiagnostics()}>
              Actualizar logs
            </Button>
          </div>
          <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border border-border/70 bg-background/70 p-4 font-mono text-xs text-muted-foreground">
            {nativeDiagnostics?.logs?.length ? (
              <div className="space-y-2">
                {nativeDiagnostics.logs.map((line, index) => (
                  <div key={`${line}-${index}`} className="break-words">{line}</div>
                ))}
              </div>
            ) : (
              <div>No hay logs nativos visibles todavía.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}