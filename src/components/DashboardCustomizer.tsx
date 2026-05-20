import { useEffect, useState } from "react";
import type { WidgetDef, WidgetState, WidgetWidth } from "./DashboardGrid";
import { defaultWidth } from "./DashboardGrid";

export type { WidgetDef, WidgetState, WidgetWidth };

const LEGACY_STORAGE_PREFIXES = ["dashboard.layout.v1.", "dashboard.layout.v2.", "dashboard.layout.v3."];

function buildDefaultLayout(defaults: WidgetDef[]): WidgetState[] {
  return defaults.map((d) => ({
    id: d.id,
    visible: true,
    width: defaultWidth(d.id),
    widthTablet: defaultWidth(d.id),
    widthDesktop: defaultWidth(d.id),
  }));
}

export function useDashboardLayout(siteId: string, defaults: WidgetDef[]) {
  const [state, setState] = useState<WidgetState[]>(() => buildDefaultLayout(defaults));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(buildDefaultLayout(defaults));
    setLoaded(true);

    if (typeof window === "undefined") return;
    for (const prefix of LEGACY_STORAGE_PREFIXES) {
      try { localStorage.removeItem(prefix + siteId); } catch { /* ignore */ }
    }
  }, [siteId, defaults]);

  async function persist(next: WidgetState[]) {
    setState(next);
  }

  return { state, loaded, persist };
}

// Re-export DashboardGrid as the new replacement for the old customizer modal.
export { DashboardGrid } from "./DashboardGrid";
