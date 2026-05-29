import { useEffect, useState } from "react";
import type { WidgetDef, WidgetState, WidgetWidth } from "./DashboardGrid";
import { defaultWidth } from "./DashboardGrid";

export type { WidgetDef, WidgetState, WidgetWidth };

const STORAGE_PREFIX = "dashboard.layout.v4.";
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

/** Merge saved state with defaults: keeps user prefs, adds any newly-introduced widgets. */
function mergeWithDefaults(defaults: WidgetDef[], saved: WidgetState[]): WidgetState[] {
  const known = new Set(defaults.map((d) => d.id));
  const seen = new Set<string>();
  const merged: WidgetState[] = [];
  for (const s of saved) {
    if (known.has(s.id) && !seen.has(s.id)) {
      merged.push(s);
      seen.add(s.id);
    }
  }
  for (const d of defaults) {
    if (!seen.has(d.id)) {
      merged.push({
        id: d.id,
        visible: true,
        width: defaultWidth(d.id),
        widthTablet: defaultWidth(d.id),
        widthDesktop: defaultWidth(d.id),
      });
    }
  }
  return merged;
}

export function useDashboardLayout(siteId: string, defaults: WidgetDef[]) {
  const [state, setState] = useState<WidgetState[]>(() => buildDefaultLayout(defaults));
  const [loaded, setLoaded] = useState(false);
  const storageKey = STORAGE_PREFIX + siteId;

  useEffect(() => {
    if (typeof window === "undefined") {
      setState(buildDefaultLayout(defaults));
      setLoaded(true);
      return;
    }
    for (const prefix of LEGACY_STORAGE_PREFIXES) {
      try { localStorage.removeItem(prefix + siteId); } catch { /* ignore */ }
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as WidgetState[];
        if (Array.isArray(parsed)) {
          setState(mergeWithDefaults(defaults, parsed));
          setLoaded(true);
          return;
        }
      }
    } catch { /* ignore */ }
    setState(buildDefaultLayout(defaults));
    setLoaded(true);
  }, [siteId, defaults, storageKey]);

  async function persist(next: WidgetState[]) {
    setState(next);
    if (typeof window === "undefined") return;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }

  return { state, loaded, persist };
}

// Re-export DashboardGrid as the new replacement for the old customizer modal.
export { DashboardGrid } from "./DashboardGrid";
