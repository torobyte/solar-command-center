import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ErrorKind = "login" | "realtime" | "generic";

export interface ErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: ErrorKind;
  title?: string;
  message?: string;
  details?: string;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
}

const COPY: Record<ErrorKind, { title: string; hint: string; steps: string[] }> = {
  login: {
    title: "No pudimos iniciar sesión",
    hint: "Revisa tus credenciales y la conexión a internet, luego vuelve a intentarlo.",
    steps: [
      "Verifica que el correo y la contraseña sean correctos.",
      "Si olvidaste tu contraseña, usa “¿Olvidaste tu contraseña?”.",
      "Revisa tu conexión a internet o desactiva la VPN.",
    ],
  },
  realtime: {
    title: "Conexión en tiempo real interrumpida",
    hint: "Perdimos la conexión con el servidor de datos en vivo. Los valores podrían no actualizarse hasta reconectar.",
    steps: [
      "Pulsa “Reintentar” para reconectar el canal.",
      "Comprueba tu conexión a internet o cambia de red.",
      "Si persiste, recarga la página completa.",
    ],
  },
  generic: {
    title: "Algo salió mal",
    hint: "Ocurrió un error inesperado. Inténtalo de nuevo.",
    steps: ["Pulsa “Reintentar”.", "Si vuelve a ocurrir, recarga la página."],
  },
};

export function ErrorDialog({
  open, onOpenChange, kind = "generic", title, message, details, onRetry, retrying,
}: ErrorDialogProps) {
  const copy = COPY[kind];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" strokeWidth={2.2} />
          </div>
          <DialogTitle className="text-center">{title ?? copy.title}</DialogTitle>
          <DialogDescription className="text-center">{message ?? copy.hint}</DialogDescription>
        </DialogHeader>

        <ul className="mt-2 list-disc space-y-1.5 rounded-lg bg-muted/50 p-4 pl-8 text-sm text-foreground/90">
          {copy.steps.map((s) => <li key={s}>{s}</li>)}
        </ul>

        {details && (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] text-muted-foreground">
            {details}
          </pre>
        )}

        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-4 w-4" /> Cerrar
          </Button>
          {onRetry && (
            <Button onClick={() => onRetry()} disabled={retrying}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Reintentando…" : "Reintentar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
