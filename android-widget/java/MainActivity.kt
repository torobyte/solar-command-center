package app.solarops.client

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * Launcher de la app SolarOps.
 *
 * Es un WebView a pantalla completa que carga el sitio web publicado.
 * Así el usuario ve EXACTAMENTE lo mismo que en el navegador / PWA,
 * sin pasos extras. El login del widget vive en WidgetSetupActivity
 * y solo se abre desde el picker del widget.
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

        web = WebView(this).apply {
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
        setContentView(web)

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl("https://appsolar.torobyte.com/app")
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
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
}
