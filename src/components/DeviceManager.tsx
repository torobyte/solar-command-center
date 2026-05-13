import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cpu, Plus, Star, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export interface Device {
  id: string;
  site_id: string;
  name: string;
  model: string | null;
  serial_number: string | null;
  driver: string | null;
  is_primary: boolean;
  sort_order: number;
}

const STORAGE_PREFIX = "selected.device.v1.";

export function useDevices(siteId: string) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from("devices")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Device[];
    setDevices(list);
    setLoaded(true);
    setSelectedId((cur) => {
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_PREFIX + siteId) : null;
      const valid = list.find((d) => d.id === cur || d.id === stored);
      return valid?.id ?? list.find((d) => d.is_primary)?.id ?? list[0]?.id ?? null;
    });
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`devices-${siteId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "devices", filter: `site_id=eq.${siteId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  function select(id: string) {
    setSelectedId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_PREFIX + siteId, id);
  }

  const selected = devices.find((d) => d.id === selectedId) ?? null;
  return { devices, selected, selectedId, select, loaded, refresh };
}

export function DeviceSelector({ siteId }: { siteId: string }) {
  const { devices, selectedId, select, refresh } = useDevices(siteId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftModel, setDraftModel] = useState("");

  async function addDevice() {
    if (!draftName.trim()) { toast.error("Pon un nombre"); return; }
    const { data, error } = await supabase.from("devices").insert({
      site_id: siteId,
      name: draftName.trim(),
      model: draftModel.trim() || null,
      is_primary: devices.length === 0,
      sort_order: devices.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success("Inversor añadido");
    setAdding(false); setDraftName(""); setDraftModel("");
    if (data) select((data as Device).id);
    refresh();
  }

  async function setPrimary(id: string) {
    await supabase.from("devices").update({ is_primary: false }).eq("site_id", siteId);
    const { error } = await supabase.from("devices").update({ is_primary: true }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Inversor principal actualizado"); refresh(); }
  }

  async function rename(id: string) {
    if (!draftName.trim()) return;
    const { error } = await supabase.from("devices").update({
      name: draftName.trim(), model: draftModel.trim() || null,
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Renombrado"); setEditingId(null); refresh(); }
  }

  async function remove(id: string) {
    const dev = devices.find((d) => d.id === id);
    if (!dev) return;
    if (dev.is_primary && devices.length > 1) {
      toast.error("Marca otro inversor como principal antes de borrar éste");
      return;
    }
    if (!confirm(`¿Borrar el inversor "${dev.name}" y todos sus datos asociados?`)) return;
    const { error } = await supabase.from("devices").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Inversor borrado"); refresh(); }
  }

  return (
    <div className="rounded-2xl border bg-card/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" strokeWidth={2.2} /> Inversor
        </div>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => select(d.id)}
              className={[
                "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                d.id === selectedId
                  ? "border-accent/60 bg-accent/15 text-accent shadow-sm"
                  : "border-border/60 bg-background text-foreground/80 hover:bg-muted",
              ].join(" ")}
              title={d.model ?? ""}
            >
              {d.is_primary && <Star className="h-3 w-3 fill-current" />}
              {d.name}
            </button>
          ))}
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => { setAdding(true); setDraftName(""); setDraftModel(""); }}>
            <Plus className="mr-1 h-3 w-3" /> Añadir
          </Button>
        </div>
      </div>

      {adding && (
        <div className="mt-3 grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label className="text-[10px]">Nombre</Label>
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="ej. Inversor casa principal" className="h-8" />
          </div>
          <div>
            <Label className="text-[10px]">Modelo (opcional)</Label>
            <Input value={draftModel} onChange={(e) => setDraftModel(e.target.value)} placeholder="ej. Voltronic 5kVA" className="h-8" />
          </div>
          <div className="flex items-end gap-1">
            <Button size="sm" onClick={addDevice}><Check className="mr-1 h-3.5 w-3.5" />Añadir</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      {devices.length > 1 && (
        <div className="mt-3 space-y-1">
          {devices.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5 text-xs">
              {editingId === d.id ? (
                <>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-7 flex-1" />
                  <Input value={draftModel} onChange={(e) => setDraftModel(e.target.value)} className="h-7 flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => rename(d.id)}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{d.name}</span>
                  <span className="text-muted-foreground">{d.model ?? "—"}</span>
                  {!d.is_primary && (
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setPrimary(d.id)} title="Marcar como principal">
                      <Star className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setEditingId(d.id); setDraftName(d.name); setDraftModel(d.model ?? ""); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive" onClick={() => remove(d.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
