package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/** TOROBYTE — Widget 4x1 RESUMEN. */
class TbWidgetSummary : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetCommon.ACTION_TICK) {
            refreshAll(context)
            // Re-agenda el siguiente tick (alarm one-shot exact) y asegura
            // que el stream service esté vivo: si el sistema lo mató en Doze
            // los widgets se quedaban congelados durante horas.
            WidgetCommon.scheduleAlarmFor(context, TbWidgetSummary::class.java)
            try { WidgetStreamService.start(context) } catch (_: Exception) {}
        }
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) refreshOne(context, mgr, id)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetStreamService.start(context)
        WidgetCommon.scheduleAlarmFor(context, TbWidgetSummary::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, TbWidgetSummary::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, TbWidgetSummary::class.java))
            refreshOne(context, mgr, id)
    }

    private fun refreshOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        TbCommon.refresh(
            context, mgr, widgetId, R.layout.widget_tb_summary,
            applyError = { v ->
                v.setTextViewText(R.id.tb_sum_state, "SIN CONEXIÓN")
            },
            applySnapshot = { v, s ->
                v.setProgressBar(R.id.tb_sum_bat, 100, s.batteryPct, false)
                v.setTextViewText(R.id.tb_sum_pct, s.batteryPct.toString())
                v.setTextViewText(R.id.tb_sum_state, TbCommon.stateLabel(s))
                v.setTextViewText(R.id.tb_sum_eta, if (s.etaMinutes > 0) TbCommon.formatEta(s.etaMinutes) else "—")
                v.setTextViewText(R.id.tb_sum_pv, TbCommon.formatKw(s.pvKw))
                v.setTextViewText(R.id.tb_sum_load, TbCommon.formatKw(s.loadKw))
                v.setTextViewText(R.id.tb_sum_grid, TbCommon.formatKw(s.gridKw))
            },
        )
    }
}
