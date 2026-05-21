import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { transferLicenseToSite } from "@/lib/licenses.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { KeyRound, ArrowRightLeft, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface MyLicense {
  id: string;
  code: string;
  plan: string;
  duration_days: number;
  is_lifetime: boolean;
  assigned_email: string | null;
  site_name: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
  redeemed_by_site: string | null;
}
interface MySite { id: string; name: string; owner_id: string }

export function LicensesPanel() {
  const { user } = useAuth();
  const transferLicense = useServerFn(transferLicenseToSite);
  const [licenses, setLicenses] = useState<MyLicense[]>([]);
  const [sites, setSites] = useState<MySite[]>([]);
  const [transferLic, setTransferLic] = useState<MyLicense | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: lic, error: licErr }, { data: s }] = await Promise.all([
      supabase.from("license_codes")
        .select("id,code,plan,duration_days,is_lifetime,assigned_email,site_name,redeemed_at,revoked_at,redeemed_by_site")
        .order("created_at", { ascending: false }),
      supabase.from("sites").select("id,name,owner_id"),
    ]);
    if (licErr) toast.error(licErr.message);
    setLicenses((lic ?? []) as MyLicense[]);
    setSites((s ?? []) as MySite[]);
  }
  useEffect(() => {
    if (!user) return;
    void load();
    // Refresh when window regains focus so transfers from other tabs show up
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);


  const pending = licenses.filter((l) => !l.redeemed_at && !l.revoked_at);
  const redeemed = licenses.filter((l) => l.redeemed_at && !l.revoked_at && l.redeemed_by_site);
  const revoked = licenses.filter((l) => l.revoked_at);

  if (licenses.length === 0) {
    return <p className="text-sm text-muted-foreground">No tienes licencias asignadas.</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {pending.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Sparkles className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{l.code}</div>
                <div className="text-xs text-muted-foreground">
                  {l.plan} · {l.is_lifetime ? "De por vida" : `${l.duration_days} días`} · <span className="text-amber-600">Pendiente</span>
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" className="rounded-full"
              onClick={() => { navigator.clipboard.writeText(l.code); toast.success("Código copiado"); }}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        ))}
        {redeemed.map((l) => {
          const cur = sites.find(s => s.id === l.redeemed_by_site);
          const canTransfer = sites.some(s => s.owner_id === user?.id && s.id !== l.redeemed_by_site);
          return (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <KeyRound className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-sm truncate">{l.code}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {l.plan} · Activa en <strong>{cur?.name ?? "—"}</strong>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Activada</Badge>
                {canTransfer && (
                  <Button size="sm" variant="outline" className="rounded-full"
                    onClick={() => { setTransferLic(l); setTarget(""); }}>
                    <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transferir
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {revoked.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl border bg-background p-3 opacity-60">
            <div className="font-mono text-sm">{l.code}</div>
            <Badge variant="destructive" className="rounded-full">Revocada</Badge>
          </div>
        ))}
      </div>

      <Dialog open={transferLic != null} onOpenChange={(o) => { if (!o) { setTransferLic(null); setTarget(""); } }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-accent" /> Transferir licencia
            </DialogTitle>
            <DialogDescription>
              Mueve la licencia <code className="font-mono">{transferLic?.code}</code> a otro sitio de tu cuenta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Sitio destino</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder="Selecciona un sitio…" /></SelectTrigger>
              <SelectContent>
                {sites
                  .filter(s => s.owner_id === user?.id && s.id !== transferLic?.redeemed_by_site)
                  .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              disabled={!target || busy}
              onClick={async () => {
                if (!transferLic || !target) return;
                setBusy(true);
                try {
                  await transferLicense({ data: { license_id: transferLic.id, new_site_id: target } });
                  toast.success("Licencia transferida");
                  setTransferLic(null); setTarget("");
                  setLicenses([]); // force visual reset
                  await load();
                  // Retry once after a brief delay in case of read-after-write lag
                  setTimeout(() => { void load(); }, 600);
                } catch (e) {
                  toast.error((e as Error).message);
                } finally { setBusy(false); }
              }}
            >
              {busy ? "Transfiriendo…" : "Transferir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
