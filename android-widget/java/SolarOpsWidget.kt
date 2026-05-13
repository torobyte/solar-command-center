package app.solarops.client

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.RemoteViews
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * SolarOps home-screen widget — REAL-TIME refresh.
 *
 * Android's `updatePeriodMillis` has a hard floor of 30 min, so we ignore it
 * and instead schedule an `AlarmManager` repeating alarm every REFRESH_SEC
 * seconds (default 30s). The alarm broadcasts ACTION_TICK back to this
 * provider, which re-fetches the snapshot for every active widget.
 *
 * Drop into: android/app/src/main/java/app/solarops/client/SolarOpsWidget.kt
 */
class SolarOpsWidget : AppWidgetProvider() {

    companion object {
        const val PREFS = "solarops_widget_prefs"
        const val KEY_TOKEN = "device_token"
        const val KEY_BASE_URL = "base_url"
        const val DEFAULT_BASE_URL =
            "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"

        const val ACTION_TICK = "app.solarops.client.WIDGET_TICK"
        const val REFRESH_SEC = 30L // tick every 30s — near real-time

        private fun tickIntent(context: Context): PendingIntent {
            val intent = Intent(context, SolarOpsWidget::class.java).apply {
                action = ACTION_TICK
                component = ComponentName(context, SolarOpsWidget::class.java)
            }
            return PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        fun scheduleAlarm(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = tickIntent(context)
            val intervalMs = REFRESH_SEC * 1000L
            val first = SystemClock.elapsedRealtime() + intervalMs
            // setRepeating may be inexact on API 19+, but it's the lightest option
            // that survives Doze better than an exact alarm chain.
            am.setRepeating(AlarmManager.ELAPSED_REALTIME, first, intervalMs, pi)
        }

        fun cancelAlarm(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(tickIntent(context))
        }

        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, SolarOpsWidget::class.java))
            for (id in ids) refreshWidget(context, mgr, id)
        }

        private fun refreshWidget(context: Context, mgr: AppWidgetManager, widgetId: Int) {
            val prefs: SharedPreferences =
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val token = prefs.getString("$KEY_TOKEN.$widgetId", null)
            val baseUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL

            val views = RemoteViews(context.packageName, R.layout.widget_solarops)

            val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(baseUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pi = PendingIntent.getActivity(
                context, widgetId, openIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            views.setOnClickPendingIntent(android.R.id.background, pi)

            if (token.isNullOrBlank()) {
                views.setTextViewText(R.id.widget_title, "SolarOps")
                views.setTextViewText(R.id.widget_updated, "Configura el token")
                mgr.updateAppWidget(widgetId, views)
                return
            }

            thread {
                val data = fetchSnapshot("$baseUrl/api/public/widget?token=$token")
                Handler(Looper.getMainLooper()).post {
                    applyData(mgr, widgetId, views, data)
                }
            }
        }

        private fun applyData(
            mgr: AppWidgetManager,
            widgetId: Int,
            views: RemoteViews,
            json: JSONObject?,
        ) {
            if (json == null) {
                views.setTextViewText(R.id.widget_updated, "Sin conexión")
                views.setInt(R.id.widget_status, "setTextColor", 0xFFEF4444.toInt())
                mgr.updateAppWidget(widgetId, views)
                return
            }
            val site = json.optJSONObject("site")
            val sample = json.optJSONObject("sample")

            val name = site?.optString("name") ?: "SolarOps"
            val fresh = site?.optBoolean("fresh") ?: false
            val ageSec = site?.optInt("age_seconds", -1) ?: -1

            views.setTextViewText(R.id.widget_title, name)
            views.setInt(
                R.id.widget_status, "setTextColor",
                if (fresh) 0xFF22C55E.toInt() else 0xFFF59E0B.toInt(),
            )
            views.setTextViewText(
                R.id.widget_updated,
                if (ageSec < 0) "—"
                else "Hace ${formatAge(ageSec)} · ${
                    SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                }",
            )

            if (sample != null) {
                views.setTextViewText(
                    R.id.widget_pv, "${sample.optDouble("pv_w", 0.0).toInt()} W",
                )
                views.setTextViewText(
                    R.id.widget_load, "${sample.optDouble("load_w", 0.0).toInt()} W",
                )
                views.setTextViewText(
                    R.id.widget_battery,
                    "${sample.optDouble("battery_pct", 0.0).toInt()} %",
                )
            } else {
                views.setTextViewText(R.id.widget_pv, "—")
                views.setTextViewText(R.id.widget_load, "—")
                views.setTextViewText(R.id.widget_battery, "—")
            }

            mgr.updateAppWidget(widgetId, views)
        }

        private fun formatAge(sec: Int): String = when {
            sec < 60 -> "${sec}s"
            sec < 3600 -> "${sec / 60}m"
            sec < 86400 -> "${sec / 3600}h"
            else -> "${sec / 86400}d"
        }

        private fun fetchSnapshot(urlStr: String): JSONObject? = try {
            val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 5000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Cache-Control", "no-cache")
            }
            if (conn.responseCode in 200..299) {
                JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            } else null
        } catch (_: Exception) { null }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_TICK) {
            refreshAll(context)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (id in appWidgetIds) refreshWidget(context, appWidgetManager, id)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        scheduleAlarm(context) // start ticking when first widget is added
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        cancelAlarm(context) // stop ticking when last widget is removed
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        for (id in appWidgetIds) prefs.remove("$KEY_TOKEN.$id")
        prefs.apply()
    }
}
