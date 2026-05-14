package app.solarops.client

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Variante COMPACTA (3 columnas: Solar / Carga / Batería).
 * Es la opción "limpia y minimal". Layout: R.layout.widget_solarops.
 */
class SolarOpsWidget : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetCommon.ACTION_TICK) refreshAll(context)
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) refresh(context, mgr, id)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetCommon.scheduleAlarmFor(context, SolarOpsWidget::class.java)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetCommon.cancelAlarmFor(context, SolarOpsWidget::class.java)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val e = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("${WidgetCommon.KEY_TOKEN}.$id")
        e.apply()
    }

    private fun refreshAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        for (id in WidgetCommon.widgetIdsFor(context, SolarOpsWidget::class.java))
            refresh(context, mgr, id)
    }

    private fun refresh(context: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solarops)
        views.setOnClickPendingIntent(android.R.id.background, WidgetCommon.openAppIntent(context, widgetId))

        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            views.setTextViewText(R.id.widget_title, "SolarOps")
            views.setTextViewText(R.id.widget_updated, "Configura el token")
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
            v.setTextViewText(R.id.widget_updated, "Sin conexión")
            v.setInt(R.id.widget_status, "setTextColor", 0xFFEF4444.toInt())
            mgr.updateAppWidget(id, v); return
        }
        val site = json.optJSONObject("site")
        val sample = json.optJSONObject("sample")
        val fresh = site?.optBoolean("fresh") ?: false
        val ageSec = site?.optInt("age_seconds", -1) ?: -1

        v.setTextViewText(R.id.widget_title, site?.optString("name") ?: "SolarOps")
        v.setInt(R.id.widget_status, "setTextColor",
            if (fresh) 0xFF22C55E.toInt() else 0xFFF59E0B.toInt())
        v.setTextViewText(R.id.widget_updated,
            "Hace ${WidgetCommon.formatAge(ageSec)} · ${SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())}")

        v.setTextViewText(R.id.widget_pv, "${(sample?.optDouble("pv_w", 0.0) ?: 0.0).toInt()} W")
        v.setTextViewText(R.id.widget_load, "${(sample?.optDouble("load_w", 0.0) ?: 0.0).toInt()} W")
        v.setTextViewText(R.id.widget_battery, "${(sample?.optDouble("battery_pct", 0.0) ?: 0.0).toInt()} %")
        mgr.updateAppWidget(id, v)
    }
}
