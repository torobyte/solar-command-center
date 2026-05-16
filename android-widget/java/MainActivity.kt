package app.solarops.client

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
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

    inner class SolarWidgetBridge {
        @JavascriptInterface
        fun saveToken(payload: String) {
            getSharedPreferences(WidgetCommon.PREFS, MODE_PRIVATE).edit()
                .putString("widget_bridge_payload", payload)
                .apply()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val savedSession = getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE)
            .getString(WidgetSetupActivity.KEY_AUTH_SESSION, null)

        if (savedSession.isNullOrBlank()) {
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
            val validSession = runCatching { ensureFreshSession(savedSession) }.getOrNull()
            Handler(Looper.getMainLooper()).post {
                if (validSession.isNullOrBlank()) {
                    openNativeLogin(clearStaleSession = true)
                    return@post
                }

                if (validSession != savedSession) {
                    getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE).edit()
                        .putString(WidgetSetupActivity.KEY_AUTH_SESSION, validSession)
                        .apply()
                }

                web = buildWebView()
                setContentView(web)

                if (savedInstanceState != null) {
                    web.restoreState(savedInstanceState)
                } else {
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
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectSavedSession()
            }
        }
    }

    private fun loadBootstrapPage(rawSession: String) {
        val baseUrl = WidgetCommon.baseUrl(this).trimEnd('/')
        val targetUrl = "$baseUrl/app-login"
        val storageKey = JSONObject.quote(authStorageKey)
        val escapedSession = JSONObject.quote(rawSession)
        val escapedTarget = JSONObject.quote(targetUrl)
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
                  window.location.replace($escapedTarget);
                </script>
              </body>
            </html>
        """.trimIndent()
        web.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null)
    }

    private fun injectSavedSession() {
        val raw = getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE)
            .getString(WidgetSetupActivity.KEY_AUTH_SESSION, null) ?: return
        val escaped = JSONObject.quote(raw)
        web.evaluateJavascript(
            "(function(){try{localStorage.setItem('$authStorageKey',$escaped);}catch(e){}})();",
            null,
        )
    }

    private fun openNativeLogin(clearStaleSession: Boolean) {
        if (clearStaleSession) {
            getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE).edit()
                .remove(WidgetSetupActivity.KEY_AUTH_SESSION)
                .remove(WidgetSetupActivity.KEY_SITES_JSON)
                .apply()
        }
        startActivity(Intent(this, WidgetSetupActivity::class.java))
        finish()
    }

    private fun ensureFreshSession(rawSession: String): String {
        val session = JSONObject(rawSession)
        val withExpiry = ensureExpiresAt(session)
        val expiresAt = withExpiry.optLong("expires_at", 0L)
        val now = System.currentTimeMillis() / 1000L
        if (expiresAt == 0L || expiresAt > now + 60L) {
            return withExpiry.toString()
        }

        val refreshToken = withExpiry.optString("refresh_token")
        if (refreshToken.isBlank()) throw IllegalStateException("No refresh token available")
        return refreshSession(refreshToken)
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
            throw IllegalStateException("Refresh failed with ${conn.responseCode}")
        }
        val refreshed = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        return ensureExpiresAt(refreshed).toString()
    }
}
