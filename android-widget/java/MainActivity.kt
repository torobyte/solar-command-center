package app.solarops.client

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Launcher de la app SolarOps.
 *
 * Antes de abrir el WebView valida / refresca la sesión guardada y luego
 * carga una página bootstrap pública que escribe la sesión en localStorage
 * para evitar el "Forbidden" inicial al entrar a una ruta protegida.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val authStorageKey = "sb-mtsxmdwraxnwobxsdrqr-auth-token"
    private val bootstrapStorageKey = "solarops_native_session_bootstrap"
    private val launchDiagnosticsKey = "solarops_native_launch_diagnostics"
    private val launchLogTag = "SolarOpsLaunch"
    private val bootstrapVersion = "mainactivity-bootstrap-2026-05-17-v4"

    inner class SolarWidgetBridge {
        @JavascriptInterface
        fun saveToken(payload: String) {
            getSharedPreferences(WidgetCommon.PREFS, MODE_PRIVATE).edit()
                .putString("widget_bridge_payload", payload)
                .apply()
        }

        @JavascriptInterface
        fun saveSession(payload: String) {
            appPrefs().edit()
                .putString(WidgetSetupActivity.KEY_AUTH_SESSION, payload)
                .apply()
            logLaunch("Bridge.saveSession() recibió una sesión nueva")
        }

        @JavascriptInterface
        fun clearSession() {
            appPrefs().edit()
                .remove(WidgetSetupActivity.KEY_AUTH_SESSION)
                .apply()
            logLaunch("Bridge.clearSession() eliminó la sesión nativa")
        }

        @JavascriptInterface
        fun getLaunchDiagnostics(): String = readLaunchDiagnostics().toString()

        @JavascriptInterface
        fun appendLaunchLog(message: String) {
            logLaunch("WEB $message")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val baseUrl = WidgetCommon.baseUrl(this).trimEnd('/')
        val targetUrl = "$baseUrl/api/public/apk-bootstrap"
        val savedSession = appPrefs().getString(WidgetSetupActivity.KEY_AUTH_SESSION, null)

        resetLaunchDiagnostics(baseUrl, targetUrl, savedSession)

        if (savedSession.isNullOrBlank()) {
            logLaunch("No hay sesión guardada; se abre WidgetSetupActivity")
            openNativeLogin(clearStaleSession = false)
            return
        }

        setContentView(
            FrameLayout(this).apply {
                setBackgroundColor(0xFF0A0A0A.toInt())
                addView(ProgressBar(this@MainActivity).apply {
                    isIndeterminate = true
                }, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT).apply {
                    width = 96
                    height = 96
                    gravity = Gravity.CENTER
                })
                addView(TextView(this@MainActivity).apply {
                    text = "Abriendo SolarOps…"
                    gravity = Gravity.CENTER_HORIZONTAL
                    setTextColor(0xFFCBD5E1.toInt())
                    textSize = 16f
                }, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT).apply {
                    topMargin = 220
                    gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                })
            }
        )

        thread {
            logLaunch("Validando la sesión guardada antes de iniciar el WebView")
            val validSession = runCatching { ensureFreshSession(savedSession) }
                .onFailure { logLaunch("ensureFreshSession falló: ${it.message ?: it.javaClass.simpleName}") }
                .getOrNull()

            Handler(Looper.getMainLooper()).post {
                if (validSession.isNullOrBlank()) {
                    logLaunch("La sesión no pudo validarse; se vuelve al login nativo")
                    openNativeLogin(clearStaleSession = true)
                    return@post
                }

                if (validSession != savedSession) {
                    appPrefs().edit()
                        .putString(WidgetSetupActivity.KEY_AUTH_SESSION, validSession)
                        .apply()
                    logLaunch("La sesión fue refrescada y guardada localmente")
                }

                // Sincronizar sitios en background para que WidgetConfigActivity
                // (picker del home-screen widget) tenga datos sin requerir el
                // login nativo antiguo.
                thread {
                    runCatching { syncSitesFromSession(validSession) }
                        .onSuccess { count -> logLaunch("Sitios sincronizados para widgets: $count") }
                        .onFailure { logLaunch("Sync de sitios falló: ${it.message ?: it.javaClass.simpleName}") }
                }

                web = buildWebView()
                setContentView(web)

                if (savedInstanceState != null) {
                    web.restoreState(savedInstanceState)
                    val restoredUrl = web.url
                    logLaunch("Se restauró el estado del WebView; url restaurada=${restoredUrl ?: "null"}")
                    if (restoredUrl.isNullOrBlank() || !restoredUrl.startsWith(baseUrl)) {
                        logLaunch("El estado restaurado no apunta al bootstrap actual; se recarga $targetUrl")
                        loadBootstrapPage(validSession)
                    }
                } else {
                    logLaunch("Arranque limpio; cargando bootstrap $targetUrl")
                    loadBootstrapPage(validSession)
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) web.saveState(outState)
    }

    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView = WebView(this).apply {
        WebView.setWebContentsDebuggingEnabled(true)
        layoutParams = android.view.ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.mediaPlaybackRequiresUserGesture = false
        clearCache(true)
        clearHistory()
        logLaunch("WebView creado con cache limpia y bridge nativo activo")
        addJavascriptInterface(SolarWidgetBridge(), "SolarWidgetBridge")
        webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                updateLaunchDiagnostics {
                    put("webview_url", url ?: "")
                }
                logLaunch("WebView onPageStarted url=${url ?: "null"}")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                updateLaunchDiagnostics {
                    put("webview_url", url ?: "")
                }
                logLaunch("WebView onPageFinished url=${url ?: "null"}")
                injectSavedSession()
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                if (request?.isForMainFrame == true) {
                    logLaunch("HTTP ${errorResponse?.statusCode ?: -1} en ${request.url}")
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    logLaunch(
                        "Error WebView ${error?.errorCode ?: -1}: ${error?.description ?: "desconocido"} en ${request.url}",
                    )
                }
            }
        }
    }

    private fun loadBootstrapPage(rawSession: String) {
        val baseUrl = WidgetCommon.baseUrl(this).trimEnd('/')
        val targetUrl = "$baseUrl/api/public/apk-bootstrap"
        val storageKey = JSONObject.quote(authStorageKey)
        val bootstrapKey = JSONObject.quote(bootstrapStorageKey)
        val escapedSession = JSONObject.quote(rawSession)
        val escapedTarget = JSONObject.quote(targetUrl)
        updateLaunchDiagnostics {
            put("initial_url", targetUrl)
            put("bootstrap_session_bytes", rawSession.length)
        }
        logLaunch("Inyectando bootstrap localStorage y redirigiendo a bootstrap público $targetUrl")
        val html = """
            <!doctype html>
            <html>
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <style>
                  html, body {
                    margin: 0;
                    height: 100%;
                    background: #0a0a0a;
                    color: #e2e8f0;
                    font-family: sans-serif;
                  }
                  body {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                </style>
              </head>
              <body>
                <div>Abriendo SolarOps…</div>
                <script>
                  try { localStorage.setItem($storageKey, $escapedSession); } catch (e) {}
                  try { localStorage.setItem($bootstrapKey, $escapedSession); } catch (e) {}
                  window.location.replace($escapedTarget);
                </script>
              </body>
            </html>
        """.trimIndent()
        web.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null)
    }

    private fun injectSavedSession() {
        val raw = appPrefs().getString(WidgetSetupActivity.KEY_AUTH_SESSION, null) ?: return
        val escaped = JSONObject.quote(raw)
        logLaunch("Reinyectando sesión guardada en localStorage para la página actual")
        web.evaluateJavascript(
            "(function(){try{localStorage.setItem('$authStorageKey',$escaped);}catch(e){}})();",
            null,
        )
    }

    private fun openNativeLogin(clearStaleSession: Boolean) {
        if (clearStaleSession) {
            appPrefs().edit()
                .remove(WidgetSetupActivity.KEY_AUTH_SESSION)
                .remove(WidgetSetupActivity.KEY_SITES_JSON)
                .apply()
            logLaunch("Se limpiaron sesión y sitios locales antes de volver al login nativo")
        }
        updateLaunchDiagnostics {
            put("last_open_action", "WidgetSetupActivity")
        }
        startActivity(Intent(this, WidgetSetupActivity::class.java))
        finish()
    }

    private fun ensureFreshSession(rawSession: String): String {
        val session = JSONObject(rawSession)
        val withExpiry = ensureExpiresAt(session)
        val accessToken = withExpiry.optString("access_token")
        val refreshToken = withExpiry.optString("refresh_token")
        val expiresAt = withExpiry.optLong("expires_at", 0L)
        val now = System.currentTimeMillis() / 1000L
        if (accessToken.isNotBlank() && (expiresAt == 0L || expiresAt > now + 60L) && isAccessTokenValid(accessToken)) {
            logLaunch("El access token guardado sigue siendo válido")
            return withExpiry.toString()
        }

        if (refreshToken.isBlank()) throw IllegalStateException("No refresh token available")
        logLaunch("El access token expiró o fue rechazado; intentando refresh")
        val refreshed = ensureExpiresAt(JSONObject(refreshSession(refreshToken)))
        val refreshedAccessToken = refreshed.optString("access_token")
        if (refreshedAccessToken.isBlank() || !isAccessTokenValid(refreshedAccessToken)) {
            throw IllegalStateException("Refreshed session is invalid")
        }
        logLaunch("Refresh token válido; la sesión renovada pasó la validación")
        return refreshed.toString()
    }

    private fun ensureExpiresAt(session: JSONObject): JSONObject {
        if (!session.has("expires_at") && session.has("expires_in")) {
            val expiresIn = session.optLong("expires_in", 0L)
            if (expiresIn > 0L) {
                session.put("expires_at", (System.currentTimeMillis() / 1000L) + expiresIn)
            }
        }
        return session
    }

    private fun refreshSession(refreshToken: String): String {
        val conn = (URL("${WidgetSetupActivity.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("apikey", WidgetSetupActivity.SUPABASE_ANON)
            setRequestProperty("Content-Type", "application/json")
        }
        OutputStreamWriter(conn.outputStream).use {
            it.write(JSONObject().put("refresh_token", refreshToken).toString())
        }
        if (conn.responseCode !in 200..299) {
            logLaunch("El refresh devolvió HTTP ${conn.responseCode}")
            throw IllegalStateException("Refresh failed with ${conn.responseCode}")
        }
        val refreshed = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        return ensureExpiresAt(refreshed).toString()
    }

    private fun isAccessTokenValid(accessToken: String): Boolean {
        val conn = (URL("${WidgetSetupActivity.SUPABASE_URL}/auth/v1/user").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("apikey", WidgetSetupActivity.SUPABASE_ANON)
            setRequestProperty("Authorization", "Bearer $accessToken")
        }
        val valid = conn.responseCode in 200..299
        logLaunch("Validación /auth/v1/user -> HTTP ${conn.responseCode}")
        return valid
    }

    private fun appPrefs() = getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE)

    private fun syncSitesFromSession(rawSession: String): Int {
        val accessToken = JSONObject(rawSession).optString("access_token")
        if (accessToken.isBlank()) throw IllegalStateException("Sin access_token para sincronizar sitios")
        val conn = (URL("${WidgetSetupActivity.SUPABASE_URL}/rest/v1/sites?select=id,name,device_token&order=name.asc").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("apikey", WidgetSetupActivity.SUPABASE_ANON)
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Accept", "application/json")
        }
        if (conn.responseCode !in 200..299) {
            throw IllegalStateException("sites HTTP ${conn.responseCode}")
        }
        val arr = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.put(
                JSONObject()
                    .put("id", o.optString("id"))
                    .put("name", o.optString("name"))
                    .put("token", o.optString("device_token")),
            )
        }
        appPrefs().edit()
            .putString(WidgetSetupActivity.KEY_SITES_JSON, out.toString())
            .apply()
        return out.length()
    }

    private fun readLaunchDiagnostics(): JSONObject {
        val raw = appPrefs().getString(launchDiagnosticsKey, null)
        return try {
            if (raw.isNullOrBlank()) JSONObject() else JSONObject(raw)
        } catch (_: Exception) {
            JSONObject()
        }
    }

    private fun saveLaunchDiagnostics(payload: JSONObject) {
        appPrefs().edit().putString(launchDiagnosticsKey, payload.toString()).apply()
    }

    private fun updateLaunchDiagnostics(block: JSONObject.() -> Unit) {
        val payload = readLaunchDiagnostics()
        payload.block()
        payload.put("updated_at", System.currentTimeMillis())
        saveLaunchDiagnostics(payload)
    }

    private fun resetLaunchDiagnostics(baseUrl: String, targetUrl: String, rawSession: String?) {
        val payload = JSONObject()
            .put("bootstrap_version", bootstrapVersion)
            .put("activity_name", this::class.java.name)
            .put("base_url", baseUrl)
            .put("initial_url", targetUrl)
            .put("session_present", !rawSession.isNullOrBlank())
            .put("logs", JSONArray())
            .put("updated_at", System.currentTimeMillis())
        saveLaunchDiagnostics(payload)
        logLaunch(
            "BOOT activity=${this::class.java.name} bootstrap=$bootstrapVersion initialUrl=$targetUrl sessionPresent=${!rawSession.isNullOrBlank()}",
        )
    }

    private fun logLaunch(message: String) {
        val clean = message.replace("\n", " ").replace("\r", " ").take(260)
        Log.d(launchLogTag, clean)
        updateLaunchDiagnostics {
            val logs = optJSONArray("logs") ?: JSONArray()
            logs.put("[${System.currentTimeMillis()}] $clean")
            put("logs", trimLogs(logs))
            put("last_log", clean)
        }
    }

    private fun trimLogs(logs: JSONArray): JSONArray {
        val trimmed = JSONArray()
        val start = maxOf(0, logs.length() - 60)
        for (index in start until logs.length()) {
            trimmed.put(logs.get(index))
        }
        return trimmed
    }
}
