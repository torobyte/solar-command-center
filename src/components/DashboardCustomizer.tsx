import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Settings2, RotateCcw, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WidgetDef { id: string; label: string }
export interface WidgetState { id: string; visible: boolean }

const STORAGE_PREFIX = "dashboard.layout.v1.";

export function useDashboardLayout(siteId: string, defaults: WidgetDef[]) {
  const [state, setState] = useState<WidgetState[]>(() =>
    defaults.map((d) => ({ id: d.id, visible: true }))
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const local = typeof window !== "undefined" ? localStorage.getItem(STORAGE_PREFIX + siteId) : null;
      let next: WidgetState[] | null = null;
      if (user) {
        const { data } = await supabase.from("dashboard_layouts")
          .select("widgets").eq("user_id", user.id).eq("site_id", siteId).maybeSingle();
        if (data?.widgets) next = data.widgets as unknown as WidgetState[];
      }
      if (!next && local) { try { next = JSON.parse(local); } catch { /* ignore */ } }
      if (next) {
        const known = new Set(defaults.map((d) => d.id));
        const reordered = next.filter((w) => known.has(w.id));
        for (const d of defaults) if (!reordered.find((w) => w.id === d.id)) reordered.push({ id: d.id, visible: true });
        if (!cancelled) setState(reordered);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function persist(next: WidgetState[]) {
    setState(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_PREFIX + siteId, JSON.stringify(next));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("dashboard_layouts").upsert(
        { user_id: user.id, site_id: siteId, widgets: next as never },
        { onConflict: "user_id,site_id" }
      );
    }
  }

  return { state, loaded, persist };
}

export function DashboardCustomizer({ defs, state, onChange }: {
  defs: WidgetDef[]; state: WidgetState[]; onChange: (next: WidgetState[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function toggle(id: string) {
    onChange(state.map((w) => w.id === id ? { ...w, visible: !w.visible } : w));
  }
  function reset() {
    onChange(defs.map((d) => ({ id: d.id, visible: true })));
    toast.success("Layout restablecido");
  }

  function handleDragStart(id: string) { dragId.current = id; }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (overId !== id) setOverId(id);
  }
  function handleDrop(targetId: string) {
    const sourceId = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const next = state.slice();
    const from = next.findIndex((w) => w.id === sourceId);
    const to = next.findIndex((w) => w.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Settings2 className="mr-1.5 h-4 w-4" /> Personalizar
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Widgets del dashboard</h3>
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Reiniciar</Button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Arrastra los widgets para reordenarlos. Tu orden se guarda automáticamente.
            </p>
            <ul className="space-y-1.5">
              {state.map((w) => {
                const def = defs.find((d) => d.id === w.id);
                if (!def) return null;
                const dragging = dragId.current === w.id;
                const isOver = overId === w.id;
                return (
                  <li
                    key={w.id}
                    draggable
                    onDragStart={() => handleDragStart(w.id)}
                    onDragOver={(e) => handleDragOver(e, w.id)}
                    onDragLeave={() => setOverId((v) => (v === w.id ? null : v))}
                    onDrop={() => handleDrop(w.id)}
                    onDragEnd={() => { dragId.current = null; setOverId(null); }}
                    className={[
                      "group flex items-center gap-2 rounded-lg border bg-background px-3 py-2 transition-all",
                      dragging ? "opacity-40" : "",
                      isOver ? "border-accent ring-2 ring-accent/30 -translate-y-0.5" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                      title="Arrastrar para reordenar"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="flex-1 text-sm">{def.label}</span>
                    <button
                      onClick={() => toggle(w.id)}
                      className={`rounded-md p-1.5 transition-colors ${w.visible ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}
                      title={w.visible ? "Ocultar" : "Mostrar"}
                    >
                      {w.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setOpen(false)}>Listo</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
