package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.view.View

/**
 * TOROBYTE — Widget 4x2 FLUJO de energía.
 * Visualiza Solar → Casa, Batería ↔ Casa, Red ↔ Casa con flechas direccionales
 * inspirado en la vista de "Flujo de energía" de la app.
 */
class TbWidgetFlow : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetCommon.ACTION_TICK) {
            refreshAll(context)
            // Re-agenda el siguiente tick (alarm one-shot exact) y asegura
            // que el stream service esté vivo: si el sistema lo mató en Doze
            // los widgets se quedaban congelados durante horas.
            WidgetCommon.scheduleAlarmFor(context, TbWidgetFlow::class.java)
            try { WidgetStreamService.start(context) } catch (_: Exception) {}
        }
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) refreshOne(context, mgr, id)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetStreamService.start(context)
        WidgetCommon.scheduleAlarmFor(context, TbWidgetFlow::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, TbWidgetFlow::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
        WidgetStreamService.stopIfNoWidgets(context)
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, TbWidgetFlow::class.java))
            refreshOne(context, mgr, id)
    }

    private fun refreshOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        TbCommon.refresh(
            context, mgr, widgetId, R.layout.widget_tb_flow,
            applyError = { v ->
                v.setTextViewText(R.id.tb_fl_pv, "—")
                v.setTextViewText(R.id.tb_fl_bat, "—")
                v.setTextViewText(R.id.tb_fl_grid, "—")
                v.setTextViewText(R.id.tb_fl_load, "—")
                v.setTextViewText(R.id.tb_fl_state, "SIN CONEXIÓN")
                v.setViewVisibility(R.id.tb_fl_arrow_pv, View.INVISIBLE)
                v.setViewVisibility(R.id.tb_fl_arrow_bat, View.INVISIBLE)
                v.setViewVisibility(R.id.tb_fl_arrow_grid, View.INVISIBLE)
            },
            applySnapshot = { v, s ->
                v.setTextViewText(R.id.tb_fl_pv, TbCommon.formatKw(s.pvKw))
                v.setTextViewText(R.id.tb_fl_bat, "${s.batteryPct}%")
                v.setTextViewText(R.id.tb_fl_grid, TbCommon.formatKw(kotlin.math.abs(s.gridKw)))
                v.setTextViewText(R.id.tb_fl_load, TbCommon.formatKw(s.loadKw))
                v.setTextViewText(R.id.tb_fl_state, TbCommon.stateLabel(s))

                // Flechas direccionales:
                // PV→Casa cuando hay producción solar
                v.setViewVisibility(
                    R.id.tb_fl_arrow_pv,
                    if (s.pvKw > 0.05) View.VISIBLE else View.INVISIBLE,
                )
                // Batería: si descarga → Bat→Casa; si carga → Casa→Bat
                v.setViewVisibility(R.id.tb_fl_arrow_bat, View.VISIBLE)
                v.setImageViewResource(
                    R.id.tb_fl_arrow_bat,
                    if (s.discharging) R.drawable.tb_arrow_right else R.drawable.tb_arrow_left,
                )
                // Red: si importa (grid>0) → Red→Casa; si exporta → Casa→Red
                v.setViewVisibility(R.id.tb_fl_arrow_grid, View.VISIBLE)
                v.setImageViewResource(
                    R.id.tb_fl_arrow_grid,
                    if (s.gridKw > 0.05) R.drawable.tb_arrow_left else R.drawable.tb_arrow_right,
                )
            },
        )
    }
}
