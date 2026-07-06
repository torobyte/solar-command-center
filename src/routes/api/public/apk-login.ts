import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const apkAuthStorageKey = "sb-mtsxmdwraxnwobxsdrqr-auth-token";
const apkBootstrapStorageKey = "solarops_native_session_bootstrap";

export const Route = createFileRoute("/api/public/apk-login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = new URL(request.url).origin;
        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!supabaseUrl || !publishableKey) {
          return new Response("Missing backend auth configuration", { status: 500 });
        }

        const { data: apkConfig } = await supabaseAdmin
          .from("apk_config")
          .select("app_name, primary_color, background_color, icon_url")
          .eq("id", 1)
          .maybeSingle();

        const appName = apkConfig?.app_name || "SolarOps";
        const primary = apkConfig?.primary_color || "#f59e0b";
        const background = apkConfig?.background_color || "#0a0a0a";
        const iconUrl = apkConfig?.icon_url || "";

        const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${appName}</title>
    <style>
      :root {
        --bg: ${background};
        --fg: #f8fafc;
        --muted: #94a3b8;
        --line: rgba(255,255,255,0.10);
        --input: rgba(255,255,255,0.08);
        --primary: ${primary};
        --danger: #ef4444;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        background: var(--bg);
        color: var(--fg);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 28px;
      }
      .shell {
        width: min(100%, 380px);
        display: grid;
        gap: 24px;
      }
      .brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
      }
      .brand img {
        height: 80px;
        max-width: 220px;
        object-fit: contain;
      }
      .brand .fallback {
        width: 80px; height: 80px;
        border-radius: 22px;
        background: var(--primary);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 36px; font-weight: 800;
      }
      .brand h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
      form { display: grid; gap: 12px; }
      input {
        width: 100%;
        border: 1px solid transparent;
        outline: none;
        border-radius: 16px;
        background: var(--input);
        color: var(--fg);
        padding: 16px 18px;
        font-size: 16px;
      }
      input:focus { border-color: color-mix(in srgb, var(--primary) 70%, transparent); }
      button {
        position: relative;
        border: 0;
        border-radius: 16px;
        padding: 16px 18px;
        background: var(--primary);
        color: white;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity .15s ease;
      }
      button[disabled] { opacity: .75; cursor: progress; }
      .spinner {
        display: inline-block;
        width: 18px; height: 18px;
        border: 2px solid rgba(255,255,255,.35);
        border-top-color: white;
        border-radius: 50%;
        animation: spin .8s linear infinite;
        vertical-align: -4px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error {
        display: none;
        border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
        background: color-mix(in srgb, var(--danger) 12%, transparent);
        color: #fecaca;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 13px;
        line-height: 1.4;
      }
      .error.show { display: block; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="brand">
        ${iconUrl
          ? `<img src="${iconUrl}" alt="${appName}" />`
          : `<div class="fallback">${appName.slice(0, 1).toUpperCase()}</div>`}
        <h1>${appName}</h1>
      </div>

      <form id="login-form">
        <input id="email" name="email" type="email" autocomplete="email" placeholder="Correo" required />
        <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Contraseña" required />
        <button id="submit" type="submit"><span id="btn-label">Entrar</span></button>
      </form>

      <div id="error" class="error"></div>
    </div>

    <script>
      (function () {
        const AUTH_KEY = ${JSON.stringify(apkAuthStorageKey)};
        const BOOTSTRAP_KEY = ${JSON.stringify(apkBootstrapStorageKey)};
        const BASE_URL = ${JSON.stringify(baseUrl)};
        const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
        const API_KEY = ${JSON.stringify(publishableKey)};
        const form = document.getElementById('login-form');
        const submit = document.getElementById('submit');
        const btnLabel = document.getElementById('btn-label');
        const errorEl = document.getElementById('error');

        function setLoading(on) {
          submit.disabled = on;
          btnLabel.innerHTML = on ? '<span class="spinner"></span>' : 'Entrar';
        }
        function showError(msg) {
          errorEl.textContent = msg;
          errorEl.classList.add('show');
        }
        function clearError() {
          errorEl.classList.remove('show');
          errorEl.textContent = '';
        }
        function persist(payload) {
          try { localStorage.setItem(AUTH_KEY, JSON.stringify(payload)); } catch {}
          try { localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload)); } catch {}
          try { window.SolarWidgetBridge?.saveSession?.(JSON.stringify(payload)); } catch {}
        }

        async function validate(payload) {
          if (!payload?.access_token) return false;
          try {
            const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
              headers: { apikey: API_KEY, Authorization: 'Bearer ' + payload.access_token },
            });
            return res.ok;
          } catch { return false; }
        }

        async function refresh(payload) {
          if (!payload?.refresh_token) return null;
          try {
            const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
              method: 'POST',
              headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: payload.refresh_token }),
            });
            if (!res.ok) return null;
            return await res.json();
          } catch { return null; }
        }

        async function tryExisting() {
          let raw = null;
          try { raw = localStorage.getItem(AUTH_KEY) || localStorage.getItem(BOOTSTRAP_KEY); } catch {}
          if (!raw) return;
          try {
            const payload = JSON.parse(raw);
            if (await validate(payload)) {
              persist(payload);
              window.location.replace(BASE_URL + '/app');
              return;
            }
            // try refresh silently
            const refreshed = await refresh(payload);
            if (refreshed && await validate(refreshed)) {
              persist(refreshed);
              window.location.replace(BASE_URL + '/app');
            }
          } catch {}
        }

        function friendlyError(status, payload, fallback) {
          const raw = (payload && (payload.msg || payload.error_description || payload.error_code || payload.error)) || '';
          const s = String(raw).toLowerCase();
          if (status === 429 || s.includes('rate limit') || s.includes('too many')) {
            return 'Demasiados intentos. Espera unos minutos y vuelve a probar (o cambia de red / desactiva la VPN).';
          }
          if (s.includes('invalid login') || s.includes('invalid credentials') || s.includes('invalid_grant')) {
            return 'Correo o contraseña incorrectos.';
          }
          if (s.includes('email not confirmed')) {
            return 'Debes confirmar tu correo antes de iniciar sesión.';
          }
          if (!raw) return fallback;
          return raw;
        }

        async function login(email, password) {
          clearError();
          setLoading(true);
          try {
            const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
              method: 'POST',
              headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(friendlyError(res.status, payload, 'No se pudo iniciar sesión'));
            }
            persist(payload);
            window.location.replace(BASE_URL + '/app');
          } catch (err) {
            setLoading(false);
            showError(err instanceof Error ? err.message : String(err));
          }
        }

        form.addEventListener('submit', function (event) {
          event.preventDefault();
          const email = document.getElementById('email').value.trim();
          const password = document.getElementById('password').value;
          void login(email, password);
        });
        void tryExisting();
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
