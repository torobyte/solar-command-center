package app.solarops.client

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Shared logic for every SolarOps widget variant:
 *  - reads the device_token saved by WidgetConfigActivity (keyed by widgetId)
 *  - fetches /api/public/widget
 *  - schedules the AlarmManager tick that drives near-realtime refresh
 *
 * Each variant (Compact / Tiles / Gauge) is its own AppWidgetProvider with
 * its own layout, and just consumes the JSON returned here.
 */
object WidgetCommon {
    const val PREFS = "solarops_widget_prefs"
    const val KEY_TOKEN = "device_token"
    const val KEY_BASE_URL = "base_url"
    const val DEFAULT_BASE_URL =
        "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"

    const val ACTION_TICK = "app.solarops.client.WIDGET_TICK"
    const val REFRESH_SEC = 30L

    fun tokenFor(context: Context, widgetId: Int): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("$KEY_TOKEN.$widgetId", null)

    fun baseUrl(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL

    fun openAppIntent(context: Context, widgetId: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(baseUrl(context))).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return PendingIntent.getActivity(
            context, widgetId, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    fun fetchSnapshot(token: String, base: String): JSONObject? = try {
        val conn = (URL("$base/api/public/widget?token=$token").openConnection() as HttpURLConnection).apply {
            connectTimeout = 5000; readTimeout = 5000
            requestMethod = "GET"
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-cache")
        }
        if (conn.responseCode in 200..299)
            JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        else null
    } catch (_: Exception) { null }

    fun scheduleAlarmFor(context: Context, providerClass: Class<*>) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = tickIntent(context, providerClass)
        val intervalMs = REFRESH_SEC * 1000L
        val first = SystemClock.elapsedRealtime() + intervalMs
        am.setRepeating(AlarmManager.ELAPSED_REALTIME, first, intervalMs, pi)
    }

    fun cancelAlarmFor(context: Context, providerClass: Class<*>) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(tickIntent(context, providerClass))
    }

    private fun tickIntent(context: Context, providerClass: Class<*>): PendingIntent {
        val intent = Intent(context, providerClass).apply {
            action = ACTION_TICK
            component = ComponentName(context, providerClass)
        }
        return PendingIntent.getBroadcast(
            context, providerClass.name.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun widgetIdsFor(context: Context, providerClass: Class<*>): IntArray =
        AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, providerClass))

    fun formatAge(sec: Int): String = when {
        sec < 0 -> "—"
        sec < 60 -> "${sec}s"
        sec < 3600 -> "${sec / 60}m"
        sec < 86400 -> "${sec / 3600}h"
        else -> "${sec / 86400}d"
    }
}
