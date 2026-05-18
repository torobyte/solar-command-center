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

/** Variante STATS — Mosaico 2x2 con 4 métricas grandes estilo dashboard MIUI. */
class SolarOpsWidgetStats : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetCommon.ACTION_TICK) refreshAll(context)
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) refresh(context, mgr, id)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetStreamService.start(context)
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidgetStats::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidgetStats::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidgetStats::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops_stats)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))
        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) { mgr.updateAppWidget(widgetId, views); return }
        val base = WidgetCommon.baseUrl(context)
        thread {
            val json = WidgetCommon.fetchSnapshot(token, base)
            Handler(Looper.getMainLooper()).post { apply(mgr, widgetId, views, json) }
        }
    }

    private fun apply(mgr: AppWidgetManager, id: Int, v: RemoteViews, json: JSONObject?) {
        if (json == null) { mgr.updateAppWidget(id, v); return }
        val s = json.optJSONObject("sample")
        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0).toInt()
        val bat = (s?.optDouble("battery_pct", 0.0) ?: 0.0).toInt().coerceIn(0, 100)
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0).toInt()
        val grid = (s?.optDouble("grid_v", 0.0) ?: 0.0).toInt()
        v.setTextViewText(R.id.stats_pv, "$pv")
        v.setTextViewText(R.id.stats_bat, "$bat")
        v.setProgressBar(R.id.stats_bat_bar, 100, bat, false)
        v.setTextViewText(R.id.stats_load, "$load")
        v.setTextViewText(R.id.stats_grid, "$grid")
        mgr.updateAppWidget(id, v)
    }
}
