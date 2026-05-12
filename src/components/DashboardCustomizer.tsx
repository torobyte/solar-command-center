import { useEffect, useState } from "react";
import { Eye, EyeOff, ArrowUp, ArrowDown, Settings2, RotateCcw } from "lucide-react";
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

  // Load layout: cloud first, fallback to localStorage
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
        // merge with current defaults (add new widgets, drop removed ones)
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

  function toggle(id: string) {
    onChange(state.map((w) => w.id === id ? { ...w, visible: !w.visible } : w));
  }
  function move(id: string, dir: -1 | 1) {
    const idx = state.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const nIdx = idx + dir;
    if (nIdx < 0 || nIdx >= state.length) return;
    const next = state.slice();
    [next[idx], next[nIdx]] = [next[nIdx], next[idx]];
    onChange(next);
  }
  function reset() {
    onChange(defs.map((d) => ({ id: d.id, visible: true })));
    toast.success("Layout restablecido");
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
            <p className="mb-3 text-xs text-muted-foreground">Activa, oculta y reordena los widgets. Se guarda automáticamente.</p>
            <ul className="space-y-1.5">
              {state.map((w, i) => {
                const def = defs.find((d) => d.id === w.id);
                if (!def) return null;
                return (
                  <li key={w.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <button disabled={i === 0} onClick={() => move(w.id, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button disabled={i === state.length - 1} onClick={() => move(w.id, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="flex-1 text-sm">{def.label}</span>
                    <button onClick={() => toggle(w.id)} className={`rounded-md p-1.5 ${w.visible ? "text-primary" : "text-muted-foreground"}`}>
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
