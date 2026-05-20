package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** TOROBYTE — Widget 4x2 PRINCIPAL: batería + 4 métricas con sparklines. */
class TbWidgetMain : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, TbWidgetMain::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, TbWidgetMain::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, TbWidgetMain::class.java))
            refreshOne(context, mgr, id)
    }

    private fun refreshOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        TbCommon.refresh(
            context, mgr, widgetId, R.layout.widget_tb_main,
            applyError = { v ->
                v.setTextViewText(R.id.tb_main_site, "Sin conexión")
                v.setTextViewText(R.id.tb_main_state, "SIN DATOS")
                v.setTextColor(R.id.tb_main_status, 0xFFEF4444.toInt())
            },
            applySnapshot = { v, s ->
                v.setTextViewText(R.id.tb_main_site, s.siteName.ifBlank { "TOROBYTE" })
                v.setTextColor(R.id.tb_main_status, if (s.online) 0xFF22C55E.toInt() else 0xFFEF4444.toInt())
                v.setTextViewText(R.id.tb_main_pct, s.batteryPct.toString())
                v.setProgressBar(R.id.tb_main_bat, 100, s.batteryPct, false)
                v.setTextViewText(R.id.tb_main_state, TbCommon.stateLabel(s))
                v.setTextViewText(R.id.tb_main_eta, if (s.etaMinutes > 0) TbCommon.formatEta(s.etaMinutes) else "—")
                v.setTextViewText(R.id.tb_main_pv, TbCommon.formatKw(s.pvKw))
                v.setTextViewText(R.id.tb_main_load, TbCommon.formatKw(s.loadKw))
                v.setTextViewText(R.id.tb_main_grid, TbCommon.formatKw(s.gridKw))
                v.setTextViewText(R.id.tb_main_eff, "${s.efficiency}%")
                v.setProgressBar(R.id.tb_main_eff_bar, 100, s.efficiency, false)
            },
        )
    }
}
