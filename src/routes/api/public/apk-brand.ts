import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function normalizeApkBrandUrl(raw?: string | null) {
  const fallback = "https://appsolar.torobyte.com";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const blocked = new Set([
      "project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app",
      "project--7cb3041b-eb20-43aa-ba17-b0848cb53051-dev.lovable.app",
      "id-preview--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app",
    ]);

    return blocked.has(url.hostname.toLowerCase())
      ? fallback
      : `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

/**
 * Public endpoint consumed by the GitHub Actions APK builder.
 * Returns only the brand fields needed to skin the Android shell —
 * no secrets, no user data.
 */
export const Route = createFileRoute("/api/public/apk-brand")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("apk_config")
          .select(
            "app_id, app_name, version_name, version_code, server_url, start_path, primary_color, background_color, splash_color, status_bar_style, icon_url, splash_url, cleartext",
          )
          .eq("id", 1)
          .maybeSingle();

        const body = data
          ? {
              ...data,
              server_url: normalizeApkBrandUrl(data.server_url),
              start_path:
                !data.start_path || data.start_path === "/app-login" || data.start_path === "/apk-auth"
                  ? "/api/public/apk-bootstrap"
                  : data.start_path,
            }
          : {
              app_id: "app.solarops.client",
              app_name: "SolarOps",
              version_name: "1.0.0",
              version_code: 1,
              server_url: "https://appsolar.torobyte.com",
              start_path: "/api/public/apk-bootstrap",
              primary_color: "#f59e0b",
              background_color: "#0a0a0a",
              splash_color: "#0a0a0a",
              status_bar_style: "dark",
              icon_url: null,
              splash_url: null,
              cleartext: false,
            };

        return new Response(JSON.stringify(body), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=30",
          },
        });
      },
      HEAD: async () =>
        new Response(null, {
          headers: {
            "cache-control": "public, max-age=30",
          },
        }),
    },
  },
});
