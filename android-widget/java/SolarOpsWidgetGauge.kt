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

/**
 * Variante GAUGE — un gran arco circular con % de batería + dos métricas
 * laterales (Solar / Carga). Similar al "speedometer" de iOS / Google Fit.
 */
class SolarOpsWidgetGauge : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidgetGauge::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidgetGauge::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidgetGauge::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops_gauge)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))

        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            views.setTextViewText(R.id.gauge_site, "Sin token")
            mgr.updateAppWidget(widgetId, views); return
        }
        val base = WidgetCommon.baseUrl(context)
        thread {
            val json = WidgetCommon.fetchSnapshot(token, base)
            Handler(Looper.getMainLooper()).post { apply(mgr, widgetId, views, json) }
        }
    }

    private fun apply(mgr: AppWidgetManager, id: Int, v: RemoteViews, json: JSONObject?) {
        if (json == null) {
            v.setTextViewText(R.id.gauge_site, "Sin conexión")
            mgr.updateAppWidget(id, v); return
        }
        val site = json.optJSONObject("site")
        val s = json.optJSONObject("sample")
        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0).toInt()
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0).toInt()
        val bat = (s?.optDouble("battery_pct", 0.0) ?: 0.0).toInt().coerceIn(0, 100)

        v.setTextViewText(R.id.gauge_site, site?.optString("name") ?: "SolarOps")
        v.setTextViewText(R.id.gauge_pct, "$bat%")
        v.setTextViewText(R.id.gauge_pv, "☀ $pv W")
        v.setTextViewText(R.id.gauge_load, "⚡ $load W")
        v.setProgressBar(R.id.gauge_ring, 100, bat, false)
        mgr.updateAppWidget(id, v)
    }
}
