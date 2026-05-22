import { useCallback, useEffect, useState } from "react";
import { Wifi, RefreshCw, Lock, Trash2, Loader2, Radio } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { AgentFetcher } from "@/routes/local";

interface WifiNet { ssid: string; signal?: number; security?: string; in_use?: boolean }
interface WifiStatus { connected?: boolean; ssid?: string | null; ip?: string | null; signal?: number | null; iface?: string | null; internet_up?: boolean; ip_eth?: string | null; ip_wlan?: string | null }
interface HotspotInfo { active?: boolean; ssid?: string; password?: string; internet_up?: boolean; ip_eth?: string | null; ip_wlan?: string | null }


export function WifiConfigDialog({
  open, onOpenChange, agentFetch,
}: { open: boolean; onOpenChange: (v: boolean) => void; agentFetch: AgentFetcher }) {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [radio, setRadio] = useState<boolean>(true);
  const [nets, setNets] = useState<WifiNet[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<WifiNet | null>(null);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    const [s, r] = await Promise.all([
      agentFetch("/api/wifi/status"),
      agentFetch("/api/wifi/radio"),
    ]);
    if (s.ok) setStatus((s.json as WifiStatus) ?? null);
    if (r.ok) setRadio(Boolean((r.json as { enabled?: boolean })?.enabled));
  }, [agentFetch]);

  const scan = useCallback(async () => {
    setScanning(true);
    const r = await agentFetch("/api/wifi/scan");
    setScanning(false);
    if (r.ok) {
      const list = ((r.json as { networks?: WifiNet[] })?.networks ?? []) as WifiNet[];
      setNets(list);
    } else {
      toast.error(r.error || `Escaneo falló (HTTP ${r.status})`);
    }
  }, [agentFetch]);

  useEffect(() => {
    if (!open) return;
    setSelected(null); setPassword("");
    loadStatus(); scan();
  }, [open, loadStatus, scan]);

  const toggleRadio = async (next: boolean) => {
    setRadio(next);
    const r = await agentFetch("/api/wifi/radio", { method: "POST", body: { enabled: next } });
    if (!r.ok) {
      setRadio(!next);
      toast.error(r.error || "No se pudo cambiar el radio WiFi");
    }
  };

  const connect = async () => {
    if (!selected) return;
    const needsPwd = (selected.security || "").toUpperCase() !== "" && (selected.security || "").toUpperCase() !== "NONE";
    if (needsPwd && password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setConnecting(true);
    const r = await agentFetch("/api/wifi/connect", { method: "POST", body: { ssid: selected.ssid, password } });
    setConnecting(false);
    if (r.ok) {
      toast.success(`Conectado a ${selected.ssid}`);
      setSelected(null); setPassword("");
      loadStatus();
    } else {
      const msg = (r.json as { error?: string })?.error || r.error || `Error (HTTP ${r.status})`;
      toast.error(msg);
    }
  };

  const forget = async (ssid: string) => {
    if (!confirm(`¿Olvidar la red "${ssid}"?`)) return;
    const r = await agentFetch("/api/wifi/forget", { method: "POST", body: { ssid } });
    if (r.ok) { toast.success("Red olvidada"); loadStatus(); scan(); }
    else toast.error(r.error || `HTTP ${r.status}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" /> Configurar WiFi
          </DialogTitle>
          <DialogDescription>
            Gestiona la conexión inalámbrica del equipo sin salir de la app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Estado actual */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Estado</div>
                <div className="font-medium">
                  {status?.connected ? `Conectado a ${status.ssid}` : "Desconectado"}
                </div>
                {status?.ip && <div className="text-xs text-muted-foreground font-mono">{status.ip}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Radio</span>
                <Switch checked={radio} onCheckedChange={toggleRadio} />
              </div>
            </div>
          </div>

          {/* Lista de redes */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redes disponibles</div>
              <Button size="sm" variant="ghost" onClick={scan} disabled={scanning}>
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span className="ml-1">Escanear</span>
              </Button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {nets.length === 0 && !scanning && (
                <div className="p-3 text-xs text-muted-foreground text-center">Sin redes detectadas.</div>
              )}
              {nets.map((n) => {
                const isSel = selected?.ssid === n.ssid;
                const isActive = n.in_use || (status?.connected && status.ssid === n.ssid);
                return (
                  <div
                    key={n.ssid + (n.signal ?? 0)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/40 ${isSel ? "bg-accent/60" : ""}`}
                    onClick={() => setSelected(n)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        {n.security && n.security !== "NONE" && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="truncate">{n.ssid || "(oculta)"}</span>
                        {isActive && <span className="text-[10px] rounded-full bg-success/15 text-success px-1.5 py-0.5">activa</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {n.security || "abierta"} · señal {n.signal ?? "—"}
                      </div>
                    </div>
                    {isActive && (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); forget(n.ssid); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conectar */}
          {selected && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm">
                Conectar a <span className="font-semibold">{selected.ssid}</span>
              </div>
              {(selected.security || "").toUpperCase() !== "NONE" && selected.security && (
                <Input
                  type="password"
                  placeholder="Contraseña WiFi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setPassword(""); }}>Cancelar</Button>
                <Button size="sm" onClick={connect} disabled={connecting}>
                  {connecting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Conectar
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
