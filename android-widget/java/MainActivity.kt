package app.solarops.client

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
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

        /** Activa la notificación persistente en la pantalla de bloqueo. */
        @JavascriptInterface
        fun enableLockscreen(token: String?, name: String?) {
            Log.d(launchLogTag, "Bridge.enableLockscreen($name)")
            LockscreenLiveService.start(applicationContext, token, name)
        }

        /** Detiene la notificación de pantalla de bloqueo. */
        @JavascriptInterface
        fun disableLockscreen() {
            Log.d(launchLogTag, "Bridge.disableLockscreen()")
            LockscreenLiveService.stop(applicationContext)
        }

        /** Devuelve "1" si la notificación está activa, "0" si no. */
        @JavascriptInterface
        fun isLockscreenEnabled(): String =
            if (LockscreenLiveService.isEnabled(applicationContext)) "1" else "0"

        /** Marca que esta sesión está corriendo dentro de la APK nativa. */
        @JavascriptInterface
        fun isNativeApp(): String = "1"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        super.onCreate(savedInstanceState)
        actionBar?.hide()

        // Cargar branding cacheado (instantáneo, sin red) y refrescar en background.
        val brand = BrandSync.cached(this)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(brand.bgColor))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = brand.bgColor
            window.navigationBarColor = brand.bgColor
        }
        thread { runCatching { BrandSync.refresh(applicationContext) } }

        updateManager = UpdateManager(applicationContext)
        thread { runCatching { updateManager.checkForUpdates() } }

        val baseUrl = WidgetCommon.baseUrl(this).trimEnd('/')
        val savedSession = appPrefs().getString(WidgetSetupActivity.KEY_AUTH_SESSION, null)

        Log.d(launchLogTag, "BOOT $buildStamp baseUrl=$baseUrl session=${!savedSession.isNullOrBlank()}")

        if (savedSession.isNullOrBlank()) {
            web = buildWebView()
            setContentView(web)
            web.loadUrl("$baseUrl/api/public/apk-login")
            return
        }

        // Splash branded (color + icono configurados por el superadmin).
        setContentView(buildBrandedSplash(brand))

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
        }

        web = buildWebView()
        // Pequeño delay para que el splash sea visible antes de cargar WebView.
        Handler(Looper.getMainLooper()).postDelayed({
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
        }, 700)
    }

    private fun buildBrandedSplash(brand: BrandSync.Brand): FrameLayout {
        return FrameLayout(this).apply {
            setBackgroundColor(brand.splashColor)
            // Icono centrado: usa splash si existe, si no el icon, si no la inicial.
            val centerBmp = brand.splashBitmap ?: brand.iconBitmap
            if (centerBmp != null) {
                addView(
                    ImageView(this@MainActivity).apply { setImageBitmap(centerBmp) },
                    FrameLayout.LayoutParams(360, 360).apply { gravity = Gravity.CENTER },
                )
            } else {
                addView(TextView(this@MainActivity).apply {
                    text = brand.appName.firstOrNull()?.uppercase() ?: "S"
                    setTextColor(0xFFFFFFFF.toInt())
                    textSize = 64f
                    gravity = Gravity.CENTER
                    setBackgroundColor(brand.primaryColor)
                }, FrameLayout.LayoutParams(220, 220).apply { gravity = Gravity.CENTER })
            }
            addView(TextView(this@MainActivity).apply {
                text = brand.appName
                gravity = Gravity.CENTER_HORIZONTAL
                setTextColor(0xFFFFFFFF.toInt())
                textSize = 18f
            }, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT).apply {
                topMargin = 540
                gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            })
            addView(ProgressBar(this@MainActivity).apply { isIndeterminate = true },
                FrameLayout.LayoutParams(72, 72).apply {
                    gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    bottomMargin = 200
                })
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
        setBackgroundColor(0xFF0A0A0A.toInt())
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
