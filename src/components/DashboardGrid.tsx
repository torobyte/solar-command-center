import { useEffect, useRef, useState } from "react";
import { GripVertical, Eye, EyeOff, Maximize2, Settings2, RotateCcw, Square, RectangleHorizontal, LayoutGrid, Smartphone, Tablet, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type WidgetWidth = 25 | 50 | 75 | 100;
export type Breakpoint = "mobile" | "tablet" | "desktop";

export interface WidgetDef { id: string; label: string }
export interface WidgetState {
  id: string;
  visible: boolean;
  /** legacy single-width (used as fallback when per-breakpoint missing) */
  width?: WidgetWidth;
  widthMobile?: WidgetWidth;
  widthTablet?: WidgetWidth;
  widthDesktop?: WidgetWidth;
}

// Mobile uses a 4-col grid, tablet 8-col, desktop 12-col
// 25/50/75/100 → 1/2/3/4  | 2/4/6/8 | 3/6/9/12
const COL_MAP: Record<Breakpoint, Record<WidgetWidth, string>> = {
  mobile: { 25: "col-span-1", 50: "col-span-2", 75: "col-span-3", 100: "col-span-4" },
  tablet: { 25: "md:col-span-2", 50: "md:col-span-4", 75: "md:col-span-6", 100: "md:col-span-8" },
  desktop: { 25: "lg:col-span-3", 50: "lg:col-span-6", 75: "lg:col-span-9", 100: "lg:col-span-12" },
};

const WIDTH_OPTIONS: { value: WidgetWidth; label: string }[] = [
  { value: 25, label: "¼" }, { value: 50, label: "½" }, { value: 75, label: "¾" }, { value: 100, label: "1/1" },
];

export function defaultWidth(id: string): WidgetWidth {
  if (["icons", "mode", "flow", "forecast"].includes(id)) return 100;
  return 50;
}

function defaultMobile(id: string): WidgetWidth {
  // Heavy widgets full width on mobile; numeric summaries in 2 columns of 4 (=50%).
  if (["icons", "mode", "flow", "forecast", "history", "gauges", "advanced"].includes(id)) return 100;
  return 50;
}

function getWidth(w: WidgetState, bp: Breakpoint): WidgetWidth {
  const fallback = w.width ?? defaultWidth(w.id);
  if (bp === "mobile") return w.widthMobile ?? defaultMobile(w.id);
  if (bp === "tablet") return w.widthTablet ?? fallback;
  return w.widthDesktop ?? fallback;
}

function setWidthFor(w: WidgetState, bp: Breakpoint, v: WidgetWidth): WidgetState {
  if (bp === "mobile") return { ...w, widthMobile: v };
  if (bp === "tablet") return { ...w, widthTablet: v };
  return { ...w, widthDesktop: v, width: v };
}

interface GridProps {
  defs: WidgetDef[];
  state: WidgetState[];
  onChange: (next: WidgetState[]) => void;
  render: (id: string) => React.ReactNode;
}

export function DashboardGrid({ defs, state, onChange, render }: GridProps) {
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  // Which breakpoint width controls are currently editing.
  const [editBp, setEditBp] = useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "desktop";
    if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
    if (window.matchMedia("(max-width: 1023px)").matches) return "tablet";
    return "desktop";
  });

  const visible = state.filter((w) => w.visible);
  const hidden = state.filter((w) => !w.visible);

  function setWidth(id: string, v: WidgetWidth) {
    onChange(state.map((w) => (w.id === id ? setWidthFor(w, editBp, v) : w)));
  }
  function toggleVisible(id: string) {
    onChange(state.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }
  function reset() {
    onChange(defs.map((d) => ({
      id: d.id, visible: true,
      widthMobile: defaultMobile(d.id),
      widthTablet: defaultWidth(d.id),
      widthDesktop: defaultWidth(d.id),
      width: defaultWidth(d.id),
    })));
    toast.success("Layout restablecido");
  }

  function onDragStart(e: React.DragEvent, id: string) {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch { /* ignore */ }
  }
  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (overId !== id) setOverId(id);
  }
  function onDrop(targetId: string) {
    const sourceId = dragId.current;
    dragId.current = null; setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const next = state.slice();
    const from = next.findIndex((w) => w.id === sourceId);
    const to = next.findIndex((w) => w.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  const BP_TABS: { id: Breakpoint; icon: React.ReactNode; label: string }[] = [
    { id: "mobile", icon: <Smartphone className="h-3.5 w-3.5" />, label: "Móvil" },
    { id: "tablet", icon: <Tablet className="h-3.5 w-3.5" />, label: "Tablet" },
    { id: "desktop", icon: <Monitor className="h-3.5 w-3.5" />, label: "Escritorio" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-muted-foreground">
            Edita anchos para:
          </div>
          <div className="inline-flex rounded-full border bg-card p-0.5 text-xs">
            {BP_TABS.map((b) => (
              <button
                key={b.id}
                onClick={() => setEditBp(b.id)}
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors",
                  editBp === b.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                ].join(" ")}
                title={`Editar anchos de ${b.label}`}
              >
                {b.icon} <span className="hidden sm:inline">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {hidden.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowHidden((v) => !v)}>
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Ocultas ({hidden.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reiniciar
          </Button>
        </div>
      </div>

      {showHidden && hidden.length > 0 && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Widgets ocultos</div>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((w) => {
              const def = defs.find((d) => d.id === w.id);
              if (!def) return null;
              return (
                <button key={w.id} onClick={() => toggleVisible(w.id)}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted">
                  <Eye className="h-3 w-3" /> {def.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 md:grid-cols-8 md:gap-3 lg:grid-cols-12 lg:gap-4">
        {visible.map((w) => {
          const def = defs.find((d) => d.id === w.id);
          if (!def) return null;
          const wm = getWidth(w, "mobile");
          const wt = getWidth(w, "tablet");
          const wd = getWidth(w, "desktop");
          const isOver = overId === w.id;
          const currentForBp = getWidth(w, editBp);
          return (
            <div
              key={w.id}
              draggable
              onDragStart={(e) => onDragStart(e, w.id)}
              onDragOver={(e) => onDragOver(e, w.id)}
              onDragLeave={() => setOverId((v) => (v === w.id ? null : v))}
              onDrop={() => onDrop(w.id)}
              onDragEnd={() => { dragId.current = null; setOverId(null); }}
              className={[
                "@container group relative transition-all min-w-0",
                COL_MAP.mobile[wm], COL_MAP.tablet[wt], COL_MAP.desktop[wd],
                isOver ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-background rounded-2xl -translate-y-0.5" : "",
              ].join(" ")}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <div className="pointer-events-auto hidden cursor-grab items-center gap-1 rounded-full border bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm active:cursor-grabbing md:inline-flex">
                  <GripVertical className="h-3 w-3" /> Mover
                </div>
                <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-full border bg-card/95 px-1 py-1 shadow-sm backdrop-blur-sm">
                  {WIDTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); setWidth(w.id, opt.value); }}
                      className={[
                        "inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 text-[11px] font-bold transition-colors",
                        currentForBp === opt.value
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      ].join(" ")}
                      title={`Ancho ${opt.value}% (${editBp})`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVisible(w.id); }}
                    className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Ocultar widget"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="h-full min-w-0 pt-10 md:pt-0">{render(w.id)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
