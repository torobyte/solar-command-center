import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** User must type this exact string to enable the confirm button */
  expectedText: string;
  /** Visible label for what they need to type */
  expectedLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ConfirmDestructiveDialog({
  open, onOpenChange, title, description,
  expectedText, expectedLabel, confirmLabel = "Eliminar",
  destructive = true, requireReason = false, onConfirm,
}: ConfirmDeleteProps) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = typed.trim() === expectedText && (!requireReason || reason.trim().length >= 3);

  function reset() {
    setTyped(""); setReason(""); setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={destructive ? "h-5 w-5 text-destructive" : "h-5 w-5 text-warning"} />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">
              Para confirmar, escribe <span className="font-mono font-bold text-foreground">{expectedLabel ?? expectedText}</span>
            </Label>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expectedText}
              className="font-mono"
            />
          </div>
          {requireReason && (
            <div className="space-y-2">
              <Label className="text-xs">Motivo (registrado en auditoría)</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Cliente solicitó cancelación, código generado por error…"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(reason.trim()); onOpenChange(false); reset(); }
              finally { setBusy(false); }
            }}
          >
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
