package app.solarops.client

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Shared helpers for the four Torobyte widgets.
 * Reads token, fetches /api/public/widget, exposes a normalized snapshot
 * with units adapted to W / kW and ETA in "Xh Ym" format.
 */
internal object TbCommon {

    data class Snapshot(
        val siteName: String,
        val batteryPct: Int,
        val pvKw: Double,
        val loadKw: Double,
        val gridKw: Double,
        val efficiency: Int,
        val charging: Boolean,
        val discharging: Boolean,
        val etaMinutes: Int,
        val online: Boolean,
    )

    fun stateLabel(s: Snapshot): String = when {
        !s.online -> "SIN CONEXIÓN"
        s.batteryPct < 15 -> "BAJA BATERÍA"
        s.charging -> "CARGANDO"
        s.discharging -> "DESCARGANDO"
        else -> "EN REPOSO"
    }

    fun formatKw(kw: Double): String {
        val abs = kotlin.math.abs(kw)
        return if (abs >= 1.0) String.format("%.2f kW", kw)
        else String.format("%d W", (kw * 1000).toInt())
    }

    fun formatEta(mins: Int): String {
        if (mins <= 0) return "—"
        val h = mins / 60
        val m = mins % 60
        return if (h > 0) "${h}h ${m}m" else "${m}m"
    }

    fun parse(json: JSONObject?): Snapshot? {
        if (json == null) return null
        val site = json.optJSONObject("site")
        val s = json.optJSONObject("sample") ?: JSONObject()
        val pvW = s.optDouble("pv_w", 0.0)
        val loadW = s.optDouble("load_w", 0.0)
        // grid_w may be negative when exporting; some payloads only have grid_v
        val gridW = s.optDouble("grid_w", s.optDouble("grid_kw", 0.0) * 1000.0)
        val batPct = s.optDouble("battery_pct", 0.0).toInt().coerceIn(0, 100)
        val batW = s.optDouble("battery_w", 0.0)
        val charging = batW > 25 || s.optBoolean("charging", false)
        val discharging = batW < -25 || s.optBoolean("discharging", false)
        // crude efficiency: how much of consumption was self-produced
        val eff = if (loadW > 0) ((pvW / kotlin.math.max(pvW + kotlin.math.max(0.0, gridW), 1.0)) * 100).toInt().coerceIn(0, 100) else 0
        // ETA real (minutos): prefer pre-computed eta_minutes from the API.
        // Fallback: compute from usable battery_capacity_wh if provided.
        val apiEta = s.optInt("eta_minutes", -1)
        val capacityWh = s.optDouble("battery_capacity_wh", 0.0)
        val etaMin = when {
            apiEta > 0 -> apiEta
            capacityWh > 0 && discharging && batW < -25 ->
                ((capacityWh * batPct / 100.0) / kotlin.math.abs(batW) * 60).toInt()
            capacityWh > 0 && charging && batW > 25 ->
                ((capacityWh * (100 - batPct) / 100.0) / batW * 60).toInt()
            else -> 0
        }
        return Snapshot(
            siteName = site?.optString("name") ?: "",
            batteryPct = batPct,
            pvKw = pvW / 1000.0,
            loadKw = loadW / 1000.0,
            gridKw = gridW / 1000.0,
            efficiency = eff,
            charging = charging,
            discharging = discharging,
            etaMinutes = etaMin,
            online = json.optBoolean("online", true),
        )
    }

    fun refresh(
        context: Context,
        mgr: AppWidgetManager,
        widgetId: Int,
        layoutRes: Int,
        applyError: (RemoteViews) -> Unit,
        applySnapshot: (RemoteViews, Snapshot) -> Unit,
    ) {
        val views = RemoteViews(context.packageName, layoutRes)
        // IMPORTANT: must reference an id that actually exists in the layout.
        // Using android.R.id.background would crash RemoteViews ("No se pudo cargar el widget").
        views.setOnClickPendingIntent(R.id.tb_root, WidgetCommon.openAppIntent(context, widgetId))
        val token = WidgetCommon.tokenFor(context, widgetId)
        if (token.isNullOrBlank()) {
            applyError(views); mgr.updateAppWidget(widgetId, views); return
        }
        val base = WidgetCommon.baseUrl(context)
        thread {
            val json = WidgetCommon.fetchSnapshot(token, base)
            val snap = parse(json)
            Handler(Looper.getMainLooper()).post {
                if (snap == null) applyError(views) else applySnapshot(views, snap)
                mgr.updateAppWidget(widgetId, views)
            }
        }
    }

    /** 0..100 -> @drawable/gauge_arc_NN (11 frames every 10%). */
    fun ringResFor(pct: Int): Int {
        val idx = ((pct.coerceIn(0, 100)) / 10).coerceIn(0, 10)
        val name = "gauge_arc_%02d".format(idx)
        // Resolved by reflection-free trick at call site via context.resources.getIdentifier
        return idx
    }
}
