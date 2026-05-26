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
 *  - reads the per-widget metric + refresh interval
 *  - fetches /api/public/widget
 *  - schedules the AlarmManager tick that drives near-realtime refresh
 */
object WidgetCommon {
    const val PREFS = "solarops_widget_prefs"
    const val KEY_TOKEN = "device_token"
    const val KEY_METRIC = "metric"          // "auto" | "pv" | "battery" | "load"
    const val KEY_INTERVAL = "interval_sec"  // per-widget int
    const val KEY_BASE_URL = "base_url"
    const val DEFAULT_BASE_URL = "https://appsolar.torobyte.com"

    const val ACTION_TICK = "app.solarops.client.WIDGET_TICK"
    const val DEFAULT_REFRESH_SEC = 15

    // Allowed values
    val METRICS = listOf("auto", "pv", "battery", "load")
    val INTERVALS = listOf(15, 30, 60, 300, 900)

    fun tokenFor(context: Context, widgetId: Int): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("$KEY_TOKEN.$widgetId", null)

    fun metricFor(context: Context, widgetId: Int): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("$KEY_METRIC.$widgetId", "auto") ?: "auto"

    fun intervalFor(context: Context, widgetId: Int): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt("$KEY_INTERVAL.$widgetId", DEFAULT_REFRESH_SEC)

    fun baseUrl(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL

    /** PendingIntent que dispara un TICK a TODOS los providers del paquete. */
    fun refreshAllIntent(context: Context, widgetId: Int): PendingIntent {
        val intent = Intent(ACTION_TICK).apply { `package` = context.packageName }
        return PendingIntent.getBroadcast(
            context, widgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun openAppIntent(context: Context, widgetId: Int): PendingIntent {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(Intent.ACTION_VIEW, Uri.parse(baseUrl(context)))
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context, widgetId, launch,
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

    /**
     * Programa el siguiente tick para [providerClass].
     *
     * `setRepeating` en Android 5+ es inexacto y Doze lo silencia tras unas
     * horas, por eso usamos un alarm one-shot con `setExactAndAllowWhileIdle`
     * y nos re-agendamos cada vez que el tick se dispara (el provider llama a
     * scheduleAlarmFor en cada onReceive). Así los widgets siguen vivos aunque
     * el dispositivo entre en Doze profundo.
     */
    fun scheduleAlarmFor(context: Context, providerClass: Class<*>) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = tickIntent(context, providerClass)
        val ids = widgetIdsFor(context, providerClass)
        if (ids.isEmpty()) { am.cancel(pi); return }
        val intervalSec = ids.minOf { intervalFor(context, it) }.coerceAtLeast(15)
        val intervalMs = intervalSec * 1000L
        val triggerAt = SystemClock.elapsedRealtime() + intervalMs
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            }
        } catch (_: SecurityException) {
            // setExact* puede requerir permiso en Android 12+; caer en inexact.
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
        } catch (_: Exception) {
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
        }
    }

    fun cancelAlarmFor(context: Context, providerClass: Class<*>) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(tickIntent(context, providerClass))
    }

    /** Todas las clases de widget conocidas — usado por [kickAll]. */
    private val ALL_PROVIDERS: List<Class<*>> by lazy {
        listOf(
            TbWidgetMain::class.java,
            TbWidgetSummary::class.java,
            TbWidgetBattery2x2::class.java,
            TbWidgetBattery1x1::class.java,
            TbWidgetFlow::class.java,
            TbWidgetRing::class.java,
            TbWidgetStatus::class.java,
        )
    }

    /**
     * Re-agenda alarmas, levanta el WidgetStreamService y fuerza un tick
     * inmediato en cada provider con widgets activos. Llamar desde
     * MainActivity.onResume para resucitar widgets que el sistema haya
     * dejado dormir.
     */
    fun kickAll(context: Context) {
        try { WidgetStreamService.start(context) } catch (_: Exception) {}
        for (cls in ALL_PROVIDERS) {
            val ids = widgetIdsFor(context, cls)
            if (ids.isEmpty()) continue
            scheduleAlarmFor(context, cls)
            try {
                val intent = Intent(context, cls).apply { action = ACTION_TICK }
                context.sendBroadcast(intent)
            } catch (_: Exception) {}
        }
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
