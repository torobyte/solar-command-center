package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * TOROBYTE — Widget 2x2 ANILLO de batería.
 * Anillo circular grande con % de batería al centro,
 * inspirado en los gauges circulares del dashboard.
 */
class TbWidgetRing : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetCommon.ACTION_TICK) refreshAll(context)
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) refreshOne(context, mgr, id)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetStreamService.start(context)
        WidgetCommon.scheduleAlarmFor(context, TbWidgetRing::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, TbWidgetRing::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, TbWidgetRing::class.java))
            refreshOne(context, mgr, id)
    }

    private fun refreshOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        TbCommon.refresh(
            context, mgr, widgetId, R.layout.widget_tb_ring,
            applyError = { v ->
                v.setTextViewText(R.id.tb_rg_pct, "—")
                v.setTextViewText(R.id.tb_rg_state, "SIN DATOS")
                v.setImageViewResource(R.id.tb_rg_arc, arcResFor(context, 0))
            },
            applySnapshot = { v, s ->
                v.setTextViewText(R.id.tb_rg_pct, s.batteryPct.toString())
                v.setTextViewText(R.id.tb_rg_state, TbCommon.stateLabel(s))
                v.setTextViewText(R.id.tb_rg_eta, if (s.etaMinutes > 0) TbCommon.formatEta(s.etaMinutes) else "—")
                v.setImageViewResource(R.id.tb_rg_arc, arcResFor(context, s.batteryPct))
            },
        )
    }

    /** Resuelve @drawable/gauge_arc_NN (00..10) según el % de batería. */
    private fun arcResFor(context: Context, pct: Int): Int {
        val idx = (pct.coerceIn(0, 100) / 10).coerceIn(0, 10)
        val name = "gauge_arc_%02d".format(idx)
        val id = context.resources.getIdentifier(name, "drawable", context.packageName)
        return if (id != 0) id else R.drawable.gauge_arc_00
    }
}
