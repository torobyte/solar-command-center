package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * TOROBYTE — Widget 4x1 ESTADO.
 * Barra horizontal con estado grande + 3 KPIs (PV/Carga/Red) en chips,
 * inspirado en la barra de estado del dashboard móvil.
 */
class TbWidgetStatus : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, TbWidgetStatus::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, TbWidgetStatus::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, TbWidgetStatus::class.java))
            refreshOne(context, mgr, id)
    }

    private fun refreshOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        TbCommon.refresh(
            context, mgr, widgetId, R.layout.widget_tb_status,
            applyError = { v ->
                v.setTextViewText(R.id.tb_st_state, "SIN CONEXIÓN")
                v.setTextViewText(R.id.tb_st_pct, "—")
                v.setTextViewText(R.id.tb_st_pv, "—")
                v.setTextViewText(R.id.tb_st_load, "—")
                v.setTextViewText(R.id.tb_st_grid, "—")
            },
            applySnapshot = { v, s ->
                v.setTextViewText(R.id.tb_st_state, TbCommon.stateLabel(s))
                v.setTextViewText(R.id.tb_st_pct, "${s.batteryPct}%")
                v.setTextViewText(R.id.tb_st_pv, TbCommon.formatKw(s.pvKw))
                v.setTextViewText(R.id.tb_st_load, TbCommon.formatKw(s.loadKw))
                v.setTextViewText(R.id.tb_st_grid, TbCommon.formatKw(s.gridKw))
            },
        )
    }
}
