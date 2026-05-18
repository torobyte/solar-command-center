import { useEffect, useState } from "react";
import { Smartphone, BellRing, Power, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tarjeta que activa/desactiva la notificación persistente "Live" en la
 * pantalla de bloqueo del móvil, usando el bridge JS expuesto por la APK
 * nativa (window.SolarWidgetBridge). En el navegador normal el botón
 * indica que la función requiere la app móvil.
 */

declare global {
  interface Window {
    SolarWidgetBridge?: {
      enableLockscreen?: (token: string, name: string) => void;
      disableLockscreen?: () => void;
      isLockscreenEnabled?: () => string;
      isNativeApp?: () => string;
    };
  }
}

export function LockscreenLiveCard({
  siteToken,
  siteName,
}: {
  siteToken: string;
  siteName: string;
}) {
  const bridge = typeof window !== "undefined" ? window.SolarWidgetBridge : undefined;
  const isNative = !!bridge?.isNativeApp?.();
  const [enabled, setEnabled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (bridge?.isLockscreenEnabled) {
      try { setEnabled(bridge.isLockscreenEnabled() === "1"); } catch { /* ignore */ }
    }
  }, [bridge]);

  const toggle = () => {
    if (!bridge) return;
    if (enabled) {
      bridge.disableLockscreen?.();
      setEnabled(false);
    } else {
      bridge.enableLockscreen?.(siteToken, siteName);
      setEnabled(true);
      setShowInstructions(true);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
          <BellRing className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold">Pantalla de bloqueo en vivo</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mantiene una notificación persistente con PV, Batería y Carga, visible sin desbloquear el teléfono. Se actualiza cada 30 s.
          </p>

          {!isNative ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Solo disponible desde la app Android (APK). Descárgala desde tu cuenta e inicia sesión.</span>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={enabled ? "destructive" : "default"}
                onClick={toggle}
              >
                <Power className="mr-1.5 h-3.5 w-3.5" />
                {enabled ? "Desactivar" : "Activar"}
              </Button>
              {enabled && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  ● en vivo
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => setShowInstructions((v) => !v)}>
                <Info className="mr-1.5 h-3.5 w-3.5" />
                Xiaomi / MIUI
              </Button>
            </div>
          )}

          {showInstructions && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              <p className="font-medium">Para que se vea en la pantalla de bloqueo (Xiaomi / MIUI):</p>
              <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-muted-foreground">
                <li>Ajustes → Notificaciones → SolarOps</li>
                <li>Activa <b>Mostrar en pantalla bloqueada</b> y <b>Mostrar contenido</b></li>
                <li>Ajustes → Apps → SolarOps → <b>Ahorro de batería</b> → <i>Sin restricciones</i></li>
                <li>Bloquea la app en la pantalla de recientes (icono de candado)</li>
              </ol>
              <p className="mt-2 text-muted-foreground">
                En Samsung/Pixel/otros: Ajustes → Pantalla de bloqueo → <b>Notificaciones en pantalla bloqueada</b> debe estar activo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
