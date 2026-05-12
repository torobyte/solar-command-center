import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Branding {
  site_name: string;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  primary_foreground: string;
  accent_color: string;
  background_color: string;
  foreground_color: string;
  card_color: string;
  muted_color: string;
  border_color: string;
  success_color: string;
  warning_color: string;
  destructive_color: string;
  font_display: string;
  font_body: string;
  radius: string;
  pwa_name: string;
  pwa_short_name: string;
  pwa_description: string | null;
  pwa_theme_color: string;
  pwa_background_color: string;
  pwa_display: string;
  pwa_icon_192: string | null;
  pwa_icon_512: string | null;
}

const Ctx = createContext<{ branding: Branding | null; reload: () => Promise<void> }>({
  branding: null,
  reload: async () => {},
});

function hexToOklch(hex: string): string {
  // Lightweight: just return the hex; CSS supports hex inside oklch fallback via raw color.
  // We expose colors as raw hex and write them directly into CSS custom props.
  return hex;
}

export function applyBrandingToDOM(b: Branding) {
  if (typeof document === "undefined") return;
  const r = document.documentElement.style;
  const set = (k: string, v: string) => r.setProperty(k, v);
  set("--background", hexToOklch(b.background_color));
  set("--foreground", hexToOklch(b.foreground_color));
  set("--card", hexToOklch(b.card_color));
  set("--card-foreground", hexToOklch(b.foreground_color));
  set("--popover", hexToOklch(b.card_color));
  set("--popover-foreground", hexToOklch(b.foreground_color));
  set("--primary", hexToOklch(b.primary_color));
  set("--primary-foreground", hexToOklch(b.primary_foreground));
  set("--secondary", hexToOklch(b.muted_color));
  set("--secondary-foreground", hexToOklch(b.foreground_color));
  set("--muted", hexToOklch(b.muted_color));
  set("--muted-foreground", hexToOklch(b.foreground_color));
  set("--accent", hexToOklch(b.accent_color));
  set("--accent-foreground", hexToOklch(b.primary_foreground));
  set("--destructive", hexToOklch(b.destructive_color));
  set("--destructive-foreground", hexToOklch(b.primary_foreground));
  set("--success", hexToOklch(b.success_color));
  set("--warning", hexToOklch(b.warning_color));
  set("--border", hexToOklch(b.border_color));
  set("--input", hexToOklch(b.border_color));
  set("--ring", hexToOklch(b.primary_color));
  set("--radius", b.radius);
  set("--font-display", b.font_display);
  set("--font-body", b.font_body);
  document.body.style.fontFamily = b.font_body;
  // Title + favicon
  if (b.site_name) document.title = b.site_name;
  if (b.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.favicon_url;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);

  async function load() {
    const { data } = await supabase.from("branding_settings").select("*").eq("key", "global").maybeSingle();
    if (data) {
      setBranding(data as Branding);
      applyBrandingToDOM(data as Branding);
    }
  }
  useEffect(() => { load(); }, []);
  return <Ctx.Provider value={{ branding, reload: load }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
