package app.solarops.client

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Picker que aparece al añadir el widget. Carga la lista de sitios usando:
 *  1) caché local (KEY_SITES_JSON)
 *  2) si hay sesión guardada, consulta Supabase REST directamente
 *     (refrescando access_token si hace falta) — sin depender del WebView.
 *  3) si no hay sesión, abre WidgetSetupActivity para login nativo.
 */
class WidgetConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private lateinit var root: LinearLayout
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 40, 40, 40)
        }
        TextView(this).apply {
            text = "Elige el sitio"
            textSize = 18f
            setPadding(0, 0, 0, 16)
            root.addView(this)
        }
        status = TextView(this).apply {
            setTextColor(0xFF94A3B8.toInt())
            setPadding(0, 0, 0, 12)
        }
        root.addView(status)
        setContentView(ScrollView(this).apply { addView(root) })

        renderSites(WidgetSetupActivity.savedSites(this), fromCache = true)

        // Siempre intentamos refrescar desde Supabase para tener la lista al día.
        val session = getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE)
            .getString(WidgetSetupActivity.KEY_AUTH_SESSION, null)
        if (!session.isNullOrBlank()) {
            status.text = "Sincronizando sitios…"
            val progress = ProgressBar(this)
            root.addView(progress, 1)
            thread {
                val result = runCatching { fetchSitesNative(session) }
                Handler(Looper.getMainLooper()).post {
                    root.removeView(progress)
                    result.onSuccess { sites ->
                        getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE).edit()
                            .putString(WidgetSetupActivity.KEY_SITES_JSON, sites.toString())
                            .apply()
                        status.text = "${sites.length()} sitio(s)"
                        renderSites(sites, fromCache = false)
                    }.onFailure {
                        status.text = "No se pudieron sincronizar (${it.message?.take(60)})"
                    }
                }
            }
        }
    }

    private fun renderSites(sites: JSONArray, fromCache: Boolean) {
        // Limpia botones previos (mantiene título + status + progress).
        while (root.childCount > 2) root.removeViewAt(2)

        if (sites.length() == 0) {
            root.addView(TextView(this).apply {
                text = if (fromCache) "Cargando sitios…" else "No hay sitios en tu cuenta."
                setPadding(0, 0, 0, 16)
            })
            root.addView(Button(this).apply {
                text = "Iniciar sesión / Refrescar"
                setOnClickListener {
                    startActivity(Intent(this@WidgetConfigActivity, WidgetSetupActivity::class.java))
                    finish()
                }
            })
            return
        }

        for (i in 0 until sites.length()) {
            val site = sites.getJSONObject(i)
            val name = site.optString("name", "?")
            val token = site.optString("token", "")
            val btn = Button(this).apply {
                text = name
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                setOnClickListener { selectSite(token) }
            }
            root.addView(btn, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = 12 })
        }
    }

    private fun fetchSitesNative(rawSession: String): JSONArray {
        val session = JSONObject(rawSession)
        var accessToken = session.optString("access_token")
        val refreshToken = session.optString("refresh_token")
        val expiresAt = session.optLong("expires_at", 0L)
        val now = System.currentTimeMillis() / 1000L
        if ((accessToken.isBlank() || (expiresAt in 1..(now + 60))) && refreshToken.isNotBlank()) {
            val refreshed = JSONObject(refreshSession(refreshToken))
            accessToken = refreshed.optString("access_token")
            if (!refreshed.has("expires_at") && refreshed.has("expires_in")) {
                refreshed.put("expires_at", now + refreshed.optLong("expires_in", 0L))
            }
            getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE).edit()
                .putString(WidgetSetupActivity.KEY_AUTH_SESSION, refreshed.toString())
                .apply()
        }
        if (accessToken.isBlank()) throw IllegalStateException("Sin token")

        val conn = (URL("${WidgetSetupActivity.SUPABASE_URL}/rest/v1/sites?select=id,name,device_token&order=name.asc").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000; readTimeout = 8000
            setRequestProperty("apikey", WidgetSetupActivity.SUPABASE_ANON)
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Accept", "application/json")
        }
        if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
        val arr = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.put(JSONObject()
                .put("id", o.optString("id"))
                .put("name", o.optString("name"))
                .put("token", o.optString("device_token")))
        }
        return out
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
        if (conn.responseCode !in 200..299) throw IllegalStateException("Refresh HTTP ${conn.responseCode}")
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    private fun selectSite(token: String) {
        if (token.isEmpty()) { finish(); return }
        getSharedPreferences(WidgetCommon.PREFS, MODE_PRIVATE).edit()
            .putString("${WidgetCommon.KEY_TOKEN}.$widgetId", token)
            .apply()

        for (cls in listOf(
            SolarOpsWidget::class.java,
            SolarOpsWidgetTiles::class.java,
            SolarOpsWidgetGauge::class.java,
        )) {
            sendBroadcast(Intent(this, cls).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(widgetId))
            })
            WidgetCommon.scheduleAlarmFor(this, cls)
        }

        // Arranca/refresca el stream SSE para empuje en tiempo real.
        WidgetStreamService.start(this)

        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
