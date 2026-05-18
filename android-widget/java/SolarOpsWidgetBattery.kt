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
 * Variante BATTERY — réplica del card "Batería" de la web:
 *  - Batería vertical con relleno verde animado (nivel = SoC).
 *  - A la derecha, métricas grandes de Solar (PV) y Consumo (carga).
 *  - Pill superior derecha con estado (Cargando / Descargando / Lleno).
 */
class SolarOpsWidgetBattery : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidgetBattery::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidgetBattery::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidgetBattery::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops_battery)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))
        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            views.setTextViewText(R.id.bat_state, "Sin token")
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
            v.setTextViewText(R.id.bat_state, "Sin red")
            mgr.updateAppWidget(id, v); return
        }
        val site = json.optJSONObject("site")
        val s = json.optJSONObject("sample")
        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0).toInt().coerceAtLeast(0)
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0).toInt().coerceAtLeast(0)
        val batPct = (s?.optDouble("battery_pct", 0.0) ?: 0.0).toInt().coerceIn(0, 100)
        val batV = s?.optDouble("battery_v", 0.0) ?: 0.0

        v.setTextViewText(R.id.bat_title, site?.optString("name")?.ifBlank { "Batería" } ?: "Batería")
        v.setTextViewText(R.id.bat_pct, "$batPct%")
        v.setTextViewText(R.id.bat_volt, if (batV > 0) String.format("%.1f V", batV) else "")
        v.setProgressBar(R.id.bat_level, 100, batPct, false)
        v.setTextViewText(R.id.bat_pv, "$pv W")
        v.setTextViewText(R.id.bat_load, "$load W")

        val state = when {
            batPct >= 99 -> "Lleno"
            pv > load + 50 -> "Cargando"
            load > pv + 50 -> "Descargando"
            else -> "Estable"
        }
        v.setTextViewText(R.id.bat_state, state)
        mgr.updateAppWidget(id, v)
    }
}
