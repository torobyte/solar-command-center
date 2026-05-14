package app.solarops.client

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

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
            webViewClient = WebViewClient() // mantener la navegación dentro del WebView
        }
        setContentView(web)

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl("https://solar-heartbeat-sync.lovable.app")
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
