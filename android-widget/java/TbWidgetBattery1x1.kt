package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/** TOROBYTE — Widget 1x1 BATERÍA mínimo. */
class TbWidgetBattery1x1 : AppWidgetProvider() {

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
        WidgetCommon.scheduleAlarmFor(context, TbWidgetBattery1x1::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, TbWidgetBattery1x1::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, TbWidgetBattery1x1::class.java))
            refreshOne(context, mgr, id)
    }

    private fun refreshOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        TbCommon.refresh(
            context, mgr, widgetId, R.layout.widget_tb_battery_1x1,
            applyError = { v -> v.setTextViewText(R.id.tb_b1_pct, "—") },
            applySnapshot = { v, s ->
                v.setTextViewText(R.id.tb_b1_pct, s.batteryPct.toString())
                val ringIdx = (s.batteryPct / 10).coerceIn(0, 10)
                val res = context.resources.getIdentifier("gauge_arc_%02d".format(ringIdx), "drawable", context.packageName)
                if (res != 0) v.setImageViewResource(R.id.tb_b1_ring, res)
            },
        )
    }
}
