import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";

export interface Branding {
  site_name: string;
  tagline: string | null;
  logo_url: string | null;
  logo_url_dark: string | null;
  favicon_url: string | null;
  favicon_url_dark: string | null;
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
  primary_color_dark: string;
  primary_foreground_dark: string;
  accent_color_dark: string;
  background_color_dark: string;
  foreground_color_dark: string;
  card_color_dark: string;
  muted_color_dark: string;
  border_color_dark: string;
  success_color_dark: string;
  warning_color_dark: string;
  destructive_color_dark: string;
  font_display: string;
  font_body: string;
  radius: string;
  pwa_name: string;
  pwa_short_name: string;
  pwa_description: string | null;
  pwa_theme_color: string;
  pwa_theme_color_dark: string;
  pwa_background_color: string;
  pwa_background_color_dark: string;
  pwa_display: string;
  pwa_icon_192: string | null;
  pwa_icon_192_dark: string | null;
  pwa_icon_512: string | null;
  pwa_icon_512_dark: string | null;
  login_bg_url: string | null;
  login_bg_url_dark: string | null;
  login_bg_overlay: number;
}

const Ctx = createContext<{
  branding: Branding | null;
  reload: () => Promise<void>;
  resolvedLogo: string | null;
  resolvedFavicon: string | null;
  resolvedLoginBg: string | null;
}>({
  branding: null,
  reload: async () => {},
  resolvedLogo: null,
  resolvedFavicon: null,
  resolvedLoginBg: null,
});

export const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Poppins", "Montserrat", "Lato", "Nunito",
  "Plus Jakarta Sans", "DM Sans", "Manrope", "Space Grotesk", "Outfit",
  "Work Sans", "Raleway", "Rubik", "Quicksand", "Source Sans 3",
  "Playfair Display", "Merriweather", "Lora", "Bebas Neue", "Oswald",
  "Archivo", "Figtree", "JetBrains Mono", "Fira Code",
] as const;

const SYSTEM_FONTS = new Set(["system-ui", "ui-sans-serif", "sans-serif", "serif", "monospace", "SF Pro Display", "SF Pro Text", "-apple-system"]);

export function ensureGoogleFont(family: string) {
  if (typeof document === "undefined" || !family) return;
  const f = family.replace(/['"]/g, "").split(",")[0].trim();
  if (!f || SYSTEM_FONTS.has(f)) return;
  const id = `gfont-${f.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

export function applyBrandingToDOM(b: Branding, mode: "light" | "dark" = "dark") {
  if (typeof document === "undefined") return;
  const r = document.documentElement.style;
  const set = (k: string, v: string) => r.setProperty(k, v);
  const pick = <T,>(light: T, dark: T) => (mode === "dark" ? (dark ?? light) : light);

  const fg = pick(b.foreground_color, b.foreground_color_dark);
  const card = pick(b.card_color, b.card_color_dark);
  const muted = pick(b.muted_color, b.muted_color_dark);
  const border = pick(b.border_color, b.border_color_dark);
  set("--background", pick(b.background_color, b.background_color_dark));
  set("--foreground", fg);
  set("--card", card);
  set("--card-foreground", fg);
  set("--popover", card);
  set("--popover-foreground", fg);
  set("--muted", muted);
  set("--muted-foreground", fg);
  set("--secondary", muted);
  set("--secondary-foreground", fg);
  set("--border", border);
  set("--input", border);
  set("--primary", pick(b.primary_color, b.primary_color_dark));
  set("--primary-foreground", pick(b.primary_foreground, b.primary_foreground_dark));
  set("--accent", pick(b.accent_color, b.accent_color_dark));
  set("--accent-foreground", pick(b.primary_foreground, b.primary_foreground_dark));
  set("--destructive", pick(b.destructive_color, b.destructive_color_dark));
  set("--destructive-foreground", pick(b.primary_foreground, b.primary_foreground_dark));
  set("--success", pick(b.success_color, b.success_color_dark));
  set("--warning", pick(b.warning_color, b.warning_color_dark));
  set("--ring", pick(b.primary_color, b.primary_color_dark));
  set("--radius", b.radius);
  set("--font-display", b.font_display);
  set("--font-body", b.font_body);
  document.body.style.fontFamily = b.font_body;
  ensureGoogleFont(b.font_display);
  ensureGoogleFont(b.font_body);

  if (b.site_name) document.title = b.site_name;
  const fav = pick(b.favicon_url, b.favicon_url_dark);
  if (fav) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = fav;
  }
}

const BRANDING_CACHE_KEY = "branding.cache.v1";

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(BRANDING_CACHE_KEY);
      if (raw) return JSON.parse(raw) as Branding;
    } catch { /* noop */ }
    return null;
  });
  const { resolved } = useTheme();

  async function load() {
    try {
      const fetchP = supabase.from("branding_settings").select("*").eq("key", "global").maybeSingle();
      const timeout = new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 4000));
      const { data } = (await Promise.race([fetchP, timeout])) as { data: Branding | null };
      if (data) {
        setBranding(data);
        try { localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(data)); } catch { /* noop */ }
      }
    } catch { /* offline: usamos caché */ }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (branding) applyBrandingToDOM(branding, resolved); }, [branding, resolved]);

  const resolvedLogo = branding ? (resolved === "dark" ? (branding.logo_url_dark || branding.logo_url) : branding.logo_url) : null;
  const resolvedFavicon = branding ? (resolved === "dark" ? (branding.favicon_url_dark || branding.favicon_url) : branding.favicon_url) : null;
  const resolvedLoginBg = branding ? (resolved === "dark" ? (branding.login_bg_url_dark || branding.login_bg_url) : branding.login_bg_url) : null;

  return <Ctx.Provider value={{ branding, reload: load, resolvedLogo, resolvedFavicon, resolvedLoginBg }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
