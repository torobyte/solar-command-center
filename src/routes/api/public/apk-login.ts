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
          .select("app_name, primary_color, background_color")
          .eq("id", 1)
          .maybeSingle();

        const appName = apkConfig?.app_name || "SolarOps";
        const primary = apkConfig?.primary_color || "#f59e0b";
        const background = apkConfig?.background_color || "#0a0a0a";

        const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${appName} APK Login</title>
    <style>
      :root {
        --bg: ${background};
        --fg: #f8fafc;
        --muted: #94a3b8;
        --line: rgba(255,255,255,0.12);
        --panel: rgba(15,23,42,0.84);
        --input: rgba(255,255,255,0.08);
        --primary: ${primary};
        --danger: #ef4444;
        --ok: #10b981;
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
        padding: 24px;
      }
      .shell {
        width: min(100%, 460px);
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel);
        box-shadow: 0 32px 80px rgba(0,0,0,0.45);
        padding: 24px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 8px 0 0;
        color: var(--muted);
        line-height: 1.5;
      }
      form {
        margin-top: 20px;
        display: grid;
        gap: 12px;
      }
      label {
        font-size: 13px;
        color: var(--muted);
      }
      input {
        width: 100%;
        border: 1px solid transparent;
        outline: none;
        border-radius: 14px;
        background: var(--input);
        color: var(--fg);
        padding: 14px 16px;
        font-size: 16px;
      }
      input:focus {
        border-color: color-mix(in srgb, var(--primary) 80%, white 20%);
      }
      button {
        border: 0;
        border-radius: 14px;
        padding: 14px 16px;
        background: var(--primary);
        color: white;
        font-size: 16px;
        font-weight: 700;
      }
      button[disabled] {
        opacity: .7;
      }
      .secondary {
        background: transparent;
        border: 1px solid var(--line);
        color: var(--fg);
      }
      .stack { display: grid; gap: 10px; }
      .status, .diag {
        margin-top: 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px;
        background: rgba(255,255,255,0.03);
      }
      .status.ok { border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
      .status.error { border-color: color-mix(in srgb, var(--danger) 35%, transparent); color: #fecaca; }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .row {
        display: flex;
        gap: 10px;
        margin-top: 12px;
      }
      .row > * { flex: 1; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>${appName}</h1>
      <p>Acceso directo de la APK. Esta pantalla valida la sesión antes de entrar al panel.</p>

      <form id="login-form" class="stack">
        <div class="stack">
          <label for="email">Correo</label>
          <input id="email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="stack">
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <button id="submit" type="submit">Entrar</button>
      </form>

      <div id="status" class="status mono">Inicializando diagnóstico de sesión…</div>
      <div class="diag mono" id="diag">Cargando logs nativos…</div>

      <div class="row">
        <button id="retry" type="button" class="secondary">Revalidar sesión</button>
        <button id="open-app" type="button" class="secondary">Entrar a /app</button>
      </div>
    </div>

    <script>
      (function () {
        const AUTH_KEY = ${JSON.stringify(apkAuthStorageKey)};
        const BOOTSTRAP_KEY = ${JSON.stringify(apkBootstrapStorageKey)};
        const BASE_URL = ${JSON.stringify(baseUrl)};
        const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
        const API_KEY = ${JSON.stringify(publishableKey)};
        const statusEl = document.getElementById('status');
        const diagEl = document.getElementById('diag');
        const form = document.getElementById('login-form');
        const submit = document.getElementById('submit');
        const retryBtn = document.getElementById('retry');
        const openAppBtn = document.getElementById('open-app');

        function setStatus(text, kind) {
          statusEl.textContent = text;
          statusEl.className = 'status mono' + (kind ? ' ' + kind : '');
          appendLog('status=' + text);
        }

        function appendLog(line) {
          diagEl.textContent += '\\n' + line;
          try { window.SolarWidgetBridge?.appendLaunchLog?.('LOGIN ' + line); } catch {}
        }

        function setSessionPayload(payload) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
          localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload));
          try { window.SolarWidgetBridge?.saveSession?.(JSON.stringify(payload)); } catch {}
          appendLog('session-saved=yes');
        }

        async function validateToken(payload) {
          if (!payload?.access_token) {
            appendLog('validateToken=no-access-token');
            return false;
          }
          const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: {
              apikey: API_KEY,
              Authorization: 'Bearer ' + payload.access_token,
            },
          });
          appendLog('getUser-status=' + res.status);
          if (!res.ok) return false;
          const user = await res.json().catch(() => null);
          appendLog('getUser-id=' + (user?.id || 'unknown'));
          return true;
        }

        async function tryExistingSession() {
          setStatus('Verificando sesión existente…');
          let raw = null;
          try {
            raw = localStorage.getItem(AUTH_KEY) || localStorage.getItem(BOOTSTRAP_KEY);
          } catch (err) {
            appendLog('storage-read-error=' + (err instanceof Error ? err.message : String(err)));
          }
          appendLog('existing-session=' + (raw ? 'yes' : 'no'));
          if (!raw) {
            setStatus('No hay sesión guardada. Ingresa tus credenciales.');
            return;
          }
          try {
            const payload = JSON.parse(raw);
            const ok = await validateToken(payload);
            if (ok) {
              setSessionPayload(payload);
              setStatus('Sesión válida. Entrando al panel…', 'ok');
              window.location.replace(BASE_URL + '/app');
              return;
            }
            setStatus('La sesión guardada ya no es válida. Ingresa de nuevo.', 'error');
          } catch (err) {
            appendLog('existing-session-parse-error=' + (err instanceof Error ? err.message : String(err)));
            setStatus('No se pudo leer la sesión guardada.', 'error');
          }
        }

        async function login(email, password) {
          setStatus('Iniciando sesión…');
          submit.disabled = true;
          try {
            const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
              method: 'POST',
              headers: {
                apikey: API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email, password }),
            });
            appendLog('signIn-status=' + res.status);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(payload?.msg || payload?.error_description || payload?.error || 'Login rechazado');
            }
            const ok = await validateToken(payload);
            if (!ok) throw new Error('El backend rechazó el access token recién emitido');
            setSessionPayload(payload);
            setStatus('Login correcto. Entrando al panel…', 'ok');
            window.location.replace(BASE_URL + '/app');
          } catch (err) {
            setStatus(err instanceof Error ? err.message : String(err), 'error');
          } finally {
            submit.disabled = false;
          }
        }

        try {
          const native = window.SolarWidgetBridge?.getLaunchDiagnostics?.();
          diagEl.textContent = native ? String(native) : 'native-diagnostics=unavailable';
        } catch (err) {
          diagEl.textContent = 'native-diagnostics-error=' + (err instanceof Error ? err.message : String(err));
        }

        form.addEventListener('submit', function (event) {
          event.preventDefault();
          const email = document.getElementById('email').value.trim();
          const password = document.getElementById('password').value;
          void login(email, password);
        });
        retryBtn.addEventListener('click', function () { void tryExistingSession(); });
        openAppBtn.addEventListener('click', function () { window.location.replace(BASE_URL + '/app'); });
        void tryExistingSession();
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