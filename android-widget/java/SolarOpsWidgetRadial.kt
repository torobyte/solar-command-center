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
import kotlin.math.roundToInt

/**
 * Variante RADIAL — Gauge circular con animación de relleno (0 → valor) y
 * gradiente de color rojo → ámbar → verde. Soporta métrica configurable:
 *  - "auto" / "battery": % de batería
 *  - "pv": potencia PV escalada vs su pico estimado
 *  - "load": carga vs pico de PV
 */
class SolarOpsWidgetRadial : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidgetRadial::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidgetRadial::class.java)
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
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidgetRadial::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops_radial)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))
        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            views.setTextViewText(R.id.radial_label, "Sin token")
            mgr.updateAppWidget(widgetId, views); return
        }
        val base = WidgetCommon.baseUrl(context)
        val metric = WidgetCommon.metricFor(context, widgetId)
        thread {
            val json = WidgetCommon.fetchSnapshot(token, base)
            Handler(Looper.getMainLooper()).post { apply(context, mgr, widgetId, views, json, metric) }
        }
    }

    private fun apply(
        context: Context,
        mgr: AppWidgetManager,
        id: Int,
        v: RemoteViews,
        json: JSONObject?,
        metric: String,
    ) {
        if (json == null) {
            v.setTextViewText(R.id.radial_label, "Sin conexión")
            mgr.updateAppWidget(id, v); return
        }
        val site = json.optJSONObject("site")
        val s = json.optJSONObject("sample")
        val bat = (s?.optDouble("battery_pct", 0.0) ?: 0.0)
        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0)
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0)

        // Pico estimado para escalar PV/Load → 0..100% (5000W como referencia razonable).
        val peakW = 5000.0
        val resolved = when (metric) {
            "pv" -> Triple(((pv / peakW) * 100).coerceIn(0.0, 100.0), "${pv.roundToInt()} W", "Producción PV")
            "load" -> Triple(((load / peakW) * 100).coerceIn(0.0, 100.0), "${load.roundToInt()} W", "Carga")
            else -> Triple(bat.coerceIn(0.0, 100.0), "${bat.roundToInt()}%", "Batería")
        }
        val target = resolved.first.roundToInt()
        val valueText = resolved.second
        val labelText = resolved.third

        v.setTextViewText(R.id.radial_value, valueText)
        v.setTextViewText(R.id.radial_label, labelText)
        v.setTextViewText(R.id.radial_site, site?.optString("name") ?: "")
        mgr.updateAppWidget(id, v)

        // Anima el relleno desde 0 → target con frames pre-renderizados (cada frame = 10%).
        animateGauge(context, mgr, id, target)
    }

    private fun animateGauge(context: Context, mgr: AppWidgetManager, id: Int, targetPct: Int) {
        val frames = intArrayOf(
            R.drawable.gauge_arc_00, R.drawable.gauge_arc_01, R.drawable.gauge_arc_02,
            R.drawable.gauge_arc_03, R.drawable.gauge_arc_04, R.drawable.gauge_arc_05,
            R.drawable.gauge_arc_06, R.drawable.gauge_arc_07, R.drawable.gauge_arc_08,
            R.drawable.gauge_arc_09, R.drawable.gauge_arc_10,
        )
        val targetIdx = (targetPct / 10).coerceIn(0, 10)
        val handler = Handler(Looper.getMainLooper())
        for (i in 0..targetIdx) {
            handler.postDelayed({
                val rv = RemoteViews(context.packageName, R.layout.widget_solarops_radial)
                rv.setImageViewResource(R.id.radial_arc, frames[i])
                try { mgr.partiallyUpdateAppWidget(id, rv) } catch (_: Exception) {}
            }, 70L * i)
        }
    }
}
