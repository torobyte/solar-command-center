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
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Launcher de la app SolarOps.
 *
 * Estrategia:
 *  - Si hay sesión guardada, se intenta refrescar en background y se abre el
 *    WebView de inmediato. Si el refresh falla, NO se cierra la sesión: se
 *    reintenta más tarde. Una vez logueado, la sesión persiste para siempre.
 *  - Sincroniza la lista de sitios para los widgets sin depender del WebView.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var updateManager: UpdateManager
    private val authStorageKey = "sb-mtsxmdwraxnwobxsdrqr-auth-token"
    private val bootstrapStorageKey = "solarops_native_session_bootstrap"
    private val launchLogTag = "SolarOpsLaunch"
    private val buildStamp = "mainactivity-2026-05-17-v6"

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
            Log.d(launchLogTag, "Bridge.saveSession() recibió sesión nueva")
            // Re-sincronizar sitios en background con la sesión nueva.
            thread { runCatching { syncSitesFromSession(payload) } }
        }

        @JavascriptInterface
        fun clearSession() {
            // Política nueva: NO borramos la sesión aunque la web lo pida.
            // El usuario solo cierra sesión desde la propia app web.
            Log.d(launchLogTag, "Bridge.clearSession() ignorado (sesión perpetua)")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        updateManager = UpdateManager(applicationContext)

        val baseUrl = WidgetCommon.baseUrl(this).trimEnd('/')
        val targetUrl = "$baseUrl/api/public/apk-login"
        val savedSession = appPrefs().getString(WidgetSetupActivity.KEY_AUTH_SESSION, null)

        Log.d(launchLogTag, "BOOT $buildStamp baseUrl=$baseUrl session=${!savedSession.isNullOrBlank()}")
        Toast.makeText(this, "SolarOps build $buildStamp", Toast.LENGTH_SHORT).show()

        if (savedSession.isNullOrBlank()) {
            Log.d(launchLogTag, "Sin sesión guardada -> WidgetSetupActivity")
            startActivity(Intent(this, WidgetSetupActivity::class.java))
            finish()
            return
        }

        // Mostramos splash mientras se prepara el WebView.
        setContentView(
            FrameLayout(this).apply {
                setBackgroundColor(0xFF0A0A0A.toInt())
                addView(ProgressBar(this@MainActivity).apply { isIndeterminate = true },
                    FrameLayout.LayoutParams(96, 96).apply { gravity = Gravity.CENTER })
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

        // Refresh + sincronización en background, pero abrimos el WebView ya.
        thread {
            val refreshed = runCatching { ensureFreshSession(savedSession) }
                .onFailure { Log.w(launchLogTag, "ensureFreshSession falló: ${it.message}") }
                .getOrNull()
            val effective = refreshed ?: savedSession
            if (refreshed != null && refreshed != savedSession) {
                appPrefs().edit()
                    .putString(WidgetSetupActivity.KEY_AUTH_SESSION, refreshed)
                    .apply()
            }
            runCatching { syncSitesFromSession(effective) }
                .onSuccess { Log.d(launchLogTag, "Sitios sincronizados: $it") }
                .onFailure { Log.w(launchLogTag, "Sync sitios: ${it.message}") }
            runCatching { updateManager.checkForUpdates() }
                .onFailure { Log.w(launchLogTag, "Auto-update: ${it.message}") }
        }

        web = buildWebView()
        setContentView(web)
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
            val restored = web.url
            if (restored.isNullOrBlank() || !restored.startsWith(baseUrl)) {
                loadBootstrapPage(savedSession)
            }
        } else {
            loadBootstrapPage(savedSession)
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
        addJavascriptInterface(SolarWidgetBridge(), "SolarWidgetBridge")
        webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Log.d(launchLogTag, "WebView onPageStarted $url")
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectSavedSession()
            }
        }
    }

    private fun loadBootstrapPage(rawSession: String) {
        val baseUrl = WidgetCommon.baseUrl(this).trimEnd('/')
        val targetUrl = "$baseUrl/app"
        val storageKey = JSONObject.quote(authStorageKey)
        val bootstrapKey = JSONObject.quote(bootstrapStorageKey)
        val escapedSession = JSONObject.quote(rawSession)
        val escapedTarget = JSONObject.quote(targetUrl)
        val html = """
            <!doctype html>
            <html><head><meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
            <style>html,body{margin:0;height:100%;background:#0a0a0a}</style>
            </head><body>
            <script>
              try { localStorage.setItem($storageKey, $escapedSession); } catch (e) {}
              try { localStorage.setItem($bootstrapKey, $escapedSession); } catch (e) {}
              window.location.replace($escapedTarget);
            </script></body></html>
        """.trimIndent()
        web.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null)
    }

    private fun injectSavedSession() {
        val raw = appPrefs().getString(WidgetSetupActivity.KEY_AUTH_SESSION, null) ?: return
        val escaped = JSONObject.quote(raw)
        web.evaluateJavascript(
            "(function(){try{localStorage.setItem('$authStorageKey',$escaped);}catch(e){}})();",
            null,
        )
    }

    private fun ensureFreshSession(rawSession: String): String {
        val session = ensureExpiresAt(JSONObject(rawSession))
        val accessToken = session.optString("access_token")
        val refreshToken = session.optString("refresh_token")
        val expiresAt = session.optLong("expires_at", 0L)
        val now = System.currentTimeMillis() / 1000L
        if (accessToken.isNotBlank() && expiresAt > now + 120L) {
            return session.toString()
        }
        if (refreshToken.isBlank()) return session.toString()
        val refreshed = ensureExpiresAt(JSONObject(refreshSession(refreshToken)))
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
            connectTimeout = 8000; readTimeout = 8000
            setRequestProperty("apikey", WidgetSetupActivity.SUPABASE_ANON)
            setRequestProperty("Content-Type", "application/json")
        }
        OutputStreamWriter(conn.outputStream).use {
            it.write(JSONObject().put("refresh_token", refreshToken).toString())
        }
        if (conn.responseCode !in 200..299) {
            throw IllegalStateException("Refresh HTTP ${conn.responseCode}")
        }
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    private fun appPrefs() = getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE)

    private fun syncSitesFromSession(rawSession: String): Int {
        val accessToken = JSONObject(rawSession).optString("access_token")
        if (accessToken.isBlank()) throw IllegalStateException("Sin access_token")
        val conn = (URL("${WidgetSetupActivity.SUPABASE_URL}/rest/v1/sites?select=id,name,device_token&order=name.asc").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000; readTimeout = 8000
            setRequestProperty("apikey", WidgetSetupActivity.SUPABASE_ANON)
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Accept", "application/json")
        }
        if (conn.responseCode !in 200..299) throw IllegalStateException("sites HTTP ${conn.responseCode}")
        val arr = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.put(JSONObject()
                .put("id", o.optString("id"))
                .put("name", o.optString("name"))
                .put("token", o.optString("device_token")))
        }
        appPrefs().edit().putString(WidgetSetupActivity.KEY_SITES_JSON, out.toString()).apply()
        return out.length()
    }
}
