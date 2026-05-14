import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WidgetDef, WidgetState, WidgetWidth } from "./DashboardGrid";
import { defaultWidth } from "./DashboardGrid";

export type { WidgetDef, WidgetState, WidgetWidth };

const STORAGE_PREFIX = "dashboard.layout.v2.";

export function useDashboardLayout(siteId: string, defaults: WidgetDef[]) {
  const [state, setState] = useState<WidgetState[]>(() =>
    defaults.map((d) => ({ id: d.id, visible: true, width: defaultWidth(d.id) }))
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const local = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_PREFIX + siteId) : null;
      let next: WidgetState[] | null = null;
      if (user) {
        const { data } = await supabase.from("dashboard_layouts")
          .select("widgets").eq("user_id", user.id).eq("site_id", siteId).maybeSingle();
        if (data?.widgets) next = data.widgets as unknown as WidgetState[];
      }
      if (!next && local) { try { next = JSON.parse(local); } catch { /* ignore */ } }
      if (next) {
        const known = new Set(defaults.map((d) => d.id));
        const reordered: WidgetState[] = next
          .filter((w) => known.has(w.id))
          .map((w) => ({
            id: w.id,
            visible: w.visible !== false,
            width: (w.width ?? defaultWidth(w.id)) as WidgetWidth,
            widthMobile: w.widthMobile,
            widthTablet: w.widthTablet,
            widthDesktop: w.widthDesktop,
          }));
        for (const d of defaults) {
          if (!reordered.find((w) => w.id === d.id)) {
            reordered.push({ id: d.id, visible: true, width: defaultWidth(d.id) });
          }
        }
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

// Re-export DashboardGrid as the new replacement for the old customizer modal.
export { DashboardGrid } from "./DashboardGrid";
