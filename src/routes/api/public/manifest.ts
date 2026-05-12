import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("branding_settings")
          .select("*")
          .eq("key", "global")
          .maybeSingle();
        const b = data ?? {};
        const manifest = {
          name: (b as { pwa_name?: string }).pwa_name ?? "SolarOps",
          short_name: (b as { pwa_short_name?: string }).pwa_short_name ?? "SolarOps",
          description: (b as { pwa_description?: string }).pwa_description ?? "Monitor your solar inverter",
          start_url: "/",
          scope: "/",
          display: (b as { pwa_display?: string }).pwa_display ?? "standalone",
          background_color: (b as { pwa_background_color?: string }).pwa_background_color ?? "#0a0a0a",
          theme_color: (b as { pwa_theme_color?: string }).pwa_theme_color ?? "#f59e0b",
          icons: [
            (b as { pwa_icon_192?: string }).pwa_icon_192
              ? { src: (b as { pwa_icon_192?: string }).pwa_icon_192, sizes: "192x192", type: "image/png", purpose: "any maskable" }
              : { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
            (b as { pwa_icon_512?: string }).pwa_icon_512
              ? { src: (b as { pwa_icon_512?: string }).pwa_icon_512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
              : { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
          ],
        };
        return new Response(JSON.stringify(manifest), {
          headers: {
            "content-type": "application/manifest+json",
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
