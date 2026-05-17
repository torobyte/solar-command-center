import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const apkAuthStorageKey = "sb-mtsxmdwraxnwobxsdrqr-auth-token";
const apkBootstrapStorageKey = "solarops_native_session_bootstrap";

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
                !data.start_path || data.start_path === "/app-login"
                  ? "/apk-auth"
                  : data.start_path,
            }
          : {
              app_id: "app.solarops.client",
              app_name: "SolarOps",
              version_name: "1.0.0",
              version_code: 1,
              server_url: "https://appsolar.torobyte.com",
              start_path: "/apk-auth",
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

export const BootstrapRoute = createFileRoute("/api/public/apk-bootstrap")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = new URL(request.url).origin;
        const targetUrl = `${baseUrl}/app-login`;

        const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>SolarOps APK Bootstrap</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0a0a0a;
        color: #e2e8f0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .shell {
        width: min(100%, 440px);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 20px;
        padding: 24px;
        background: rgba(15,23,42,0.82);
        box-shadow: 0 24px 60px rgba(0,0,0,0.35);
      }
      h1 { margin: 0 0 10px; font-size: 20px; }
      p { margin: 0; color: #94a3b8; line-height: 1.5; font-size: 14px; }
      code {
        display: block;
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255,255,255,0.06);
        color: #e2e8f0;
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Preparando acceso seguro…</h1>
      <p id="message">Sincronizando sesión nativa antes de abrir el login web.</p>
      <code id="debug">bootstrap-version=apk-bootstrap-2026-05-17-v1\ninitial-url=${targetUrl}</code>
    </div>
    <script>
      (function () {
        const authKey = ${JSON.stringify(apkAuthStorageKey)};
        const bootstrapKey = ${JSON.stringify(apkBootstrapStorageKey)};
        const targetUrl = ${JSON.stringify(targetUrl)};
        const debug = document.getElementById("debug");
        const message = document.getElementById("message");

        function append(line) {
          if (debug) debug.textContent += "\\n" + line;
          try { window.SolarWidgetBridge?.appendLaunchLog?.("BOOT " + line); } catch {}
        }

        try {
          const bootstrap = localStorage.getItem(bootstrapKey);
          const auth = localStorage.getItem(authKey);
          append("bootstrap-present=" + (bootstrap ? "yes" : "no"));
          append("auth-present=" + (auth ? "yes" : "no"));

          if (bootstrap && !auth) {
            localStorage.setItem(authKey, bootstrap);
            append("copied-bootstrap-to-auth=yes");
          }
        } catch (err) {
          append("localStorage-error=" + (err instanceof Error ? err.message : String(err)));
        }

        message.textContent = "Redirigiendo al login de la APK…";
        window.location.replace(targetUrl);
      })();
    </script>
  </body>
</html>`;

        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        });
      },
    },
  },
});
