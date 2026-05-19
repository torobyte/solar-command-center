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
 * Variante TILES — mosaico 2x2 con 4 tarjetas coloridas
 * (Solar / Carga / Batería / Red), inspirado en widgets iOS.
 */
class SolarOpsWidgetTiles : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidgetTiles::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidgetTiles::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidgetTiles::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops_tiles)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))

        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            views.setTextViewText(R.id.tile_site, "Configura el token")
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
            v.setTextViewText(R.id.tile_site, "Sin conexión")
            mgr.updateAppWidget(id, v); return
        }
        val site = json.optJSONObject("site")
        val s = json.optJSONObject("sample")
        v.setTextViewText(R.id.tile_site, site?.optString("name") ?: BrandSync.cached(context).appName)

        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0).toInt()
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0).toInt()
        val bat = (s?.optDouble("battery_pct", 0.0) ?: 0.0).toInt()
        val gridV = (s?.optDouble("grid_v", 0.0) ?: 0.0).toInt()

        v.setTextViewText(R.id.tile_pv_value, "$pv")
        v.setTextViewText(R.id.tile_load_value, "$load")
        v.setTextViewText(R.id.tile_bat_value, "$bat%")
        v.setTextViewText(R.id.tile_grid_value, if (gridV > 50) "${gridV}V" else "OFF")

        // Battery fill bar (0..100 → width via setInt level on a progressbar-like view)
        v.setProgressBar(R.id.tile_bat_bar, 100, bat.coerceIn(0, 100), false)
        mgr.updateAppWidget(id, v)
    }
}
