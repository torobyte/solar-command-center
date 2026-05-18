package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.concurrent.thread

/** Variante WAVE — % batería gigante con gráfico de onda decorativo. */
class SolarOpsWidgetWave : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetCommon.ACTION_TICK) refreshAll(context)
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) refresh(context, mgr, id)
        WaveAnimator.start(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetStreamService.start(context)
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidgetWave::class.java)
        WaveAnimator.start(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidgetWave::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) {
            e.remove("${WidgetCommon.KEY_TOKEN}.$id")
            e.remove("${WidgetCommon.KEY_METRIC}.$id")
            e.remove("${WidgetCommon.KEY_INTERVAL}.$id")
        }
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidgetWave::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops_wave)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))
        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            views.setTextViewText(R.id.wave_sub, "Sin token")
            mgr.updateAppWidget(widgetId, views); return
        }
        val base = WidgetCommon.baseUrl(context)
        val metric = WidgetCommon.metricFor(context, widgetId)
        thread {
            val json = WidgetCommon.fetchSnapshot(token, base)
            Handler(Looper.getMainLooper()).post { apply(mgr, widgetId, views, json, metric) }
        }
    }

    private fun apply(mgr: AppWidgetManager, id: Int, v: RemoteViews, json: JSONObject?, metric: String) {
        if (json == null) {
            v.setTextViewText(R.id.wave_sub, "Sin conexión")
            mgr.updateAppWidget(id, v); return
        }
        val site = json.optJSONObject("site")
        val s = json.optJSONObject("sample")
        val bat = (s?.optDouble("battery_pct", 0.0) ?: 0.0).toInt().coerceIn(0, 100)
        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0).toInt()
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0).toInt()

        val (title, valueText, subText) = when (metric) {
            "pv" -> Triple("Solar", "$pv", "W · ${site?.optString("name") ?: ""}")
            "load" -> Triple("Carga", "$load", "W · ${site?.optString("name") ?: ""}")
            else -> Triple(
                site?.optString("name") ?: "Batería",
                "$bat",
                when {
                    pv > 50 -> "cargando · $pv W"
                    bat >= 80 -> "óptimo"
                    bat >= 40 -> "estable"
                    else -> "bajo"
                },
            )
        }
        v.setTextViewText(R.id.wave_title, title)
        v.setTextViewText(R.id.wave_value, valueText)
        v.setTextViewText(R.id.wave_sub, subText)
        // El recurso base se mantiene; WaveAnimator se encarga de la animación de frames.
        mgr.updateAppWidget(id, v)
    }
}
