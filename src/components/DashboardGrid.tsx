import { useRef, useState } from "react";
import { GripVertical, Eye, EyeOff, Maximize2, Settings2, RotateCcw, Square, RectangleHorizontal, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type WidgetWidth = 25 | 50 | 75 | 100;
export interface WidgetDef { id: string; label: string }
export interface WidgetState { id: string; visible: boolean; width?: WidgetWidth }

const WIDTH_TO_COL: Record<WidgetWidth, string> = {
  25: "col-span-1 md:col-span-3",
  50: "col-span-1 md:col-span-6",
  75: "col-span-2 md:col-span-9",
  100: "col-span-2 md:col-span-12",
};

const WIDTH_OPTIONS: { value: WidgetWidth; label: string; icon: React.ReactNode }[] = [
  { value: 25, label: "¼", icon: <Square className="h-3 w-3" /> },
  { value: 50, label: "½", icon: <RectangleHorizontal className="h-3 w-3" /> },
  { value: 75, label: "¾", icon: <RectangleHorizontal className="h-3 w-3" /> },
  { value: 100, label: "1/1", icon: <Maximize2 className="h-3 w-3" /> },
];

export function defaultWidth(id: string): WidgetWidth {
  // Sensible defaults — heavy widgets full-width, summaries half/quarter.
  if (["icons", "mode", "flow", "forecast"].includes(id)) return 100;
  return 50;
}

interface GridProps {
  defs: WidgetDef[];
  state: WidgetState[];
  onChange: (next: WidgetState[]) => void;
  render: (id: string) => React.ReactNode;
}

/**
 * 12-col responsive grid with native drag-and-drop on the cards
 * themselves and a width control (¼ ½ ¾ 1/1) per card. On desktop
 * the bottom-right corner also exposes an edge resize handle that
 * snaps to the nearest 25% step.
 */
export function DashboardGrid({ defs, state, onChange, render }: GridProps) {
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const visible = state.filter((w) => w.visible);
  const hidden = state.filter((w) => !w.visible);

  function setWidth(id: string, width: WidgetWidth) {
    onChange(state.map((w) => (w.id === id ? { ...w, width } : w)));
  }
  function toggleVisible(id: string) {
    onChange(state.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }
  function reset() {
    onChange(defs.map((d) => ({ id: d.id, visible: true, width: defaultWidth(d.id) })));
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Arrastra las tarjetas para reordenarlas. Usa <kbd className="rounded border px-1">¼ ½ ¾ 1/1</kbd> para cambiar el ancho.
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-4">
        {visible.map((w) => {
          const def = defs.find((d) => d.id === w.id);
          if (!def) return null;
          const width = w.width ?? defaultWidth(w.id);
          const isOver = overId === w.id;
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
                "@container group relative transition-all",
                WIDTH_TO_COL[width],
                isOver ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-background rounded-2xl -translate-y-0.5" : "",
              ].join(" ")}
            >
              {/* Hover overlay: drag handle + width buttons + hide */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <div className="pointer-events-auto flex cursor-grab items-center gap-1 rounded-full border bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm active:cursor-grabbing">
                  <GripVertical className="h-3 w-3" /> Mover
                </div>
                <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-card/90 px-1 py-1 shadow-sm backdrop-blur-sm">
                  {WIDTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); setWidth(w.id, opt.value); }}
                      className={[
                        "inline-flex h-6 min-w-[26px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold transition-colors",
                        width === opt.value
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      ].join(" ")}
                      title={`Ancho ${opt.value}%`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVisible(w.id); }}
                    className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Ocultar widget"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {render(w.id)}

              {/* Desktop edge-resize handle (snaps to 25% steps) */}
              <ResizeHandle currentWidth={width} onWidth={(nw) => setWidth(w.id, nw)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResizeHandle({ currentWidth, onWidth }: { currentWidth: WidgetWidth; onWidth: (w: WidgetWidth) => void }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef<WidgetWidth>(currentWidth);

  function snap(deltaPx: number, parentWidth: number): WidgetWidth {
    // 12-col grid; each 25% step is parentWidth/4 of the parent.
    // We treat the card as siblings sharing the row. Use raw px delta divided by ~quarter.
    const quarter = parentWidth / 4;
    const steps = Math.round(deltaPx / quarter);
    const next = Math.max(25, Math.min(100, startWidth.current + steps * 25));
    return next as WidgetWidth;
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const parent = (e.currentTarget as HTMLElement).closest(".grid") as HTMLElement | null;
    const parentWidth = parent?.clientWidth ?? 1200;
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = currentWidth;
    function move(ev: MouseEvent) {
      if (!dragging.current) return;
      onWidth(snap(ev.clientX - startX.current, parentWidth));
    }
    function up() {
      dragging.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div
      onMouseDown={onMouseDown}
      title="Arrastra para cambiar ancho"
      className="pointer-events-auto absolute right-0 top-1/2 hidden h-12 w-1.5 -translate-y-1/2 cursor-col-resize rounded-l-md bg-accent/0 opacity-0 transition-all group-hover:bg-accent/50 group-hover:opacity-100 md:block"
    />
  );
}
