package app.solarops.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * LockscreenLiveService — Notificación "siempre activa" tipo Live Notification
 * que muestra PV / Batería / Carga en la pantalla de bloqueo y barra de
 * notificaciones SIN necesidad de desbloquear el teléfono.
 *
 * Funciona en cualquier Android 8+ (Xiaomi/MIUI, Samsung, Pixel, etc).
 * En MIUI el usuario debe habilitar manualmente "Mostrar en pantalla bloqueada"
 * para la app — ver instrucciones en la UI web.
 */
class LockscreenLiveService : Service() {

    @Volatile private var stopped = false
    private var worker: Thread? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        // Token opcional para fijar un sitio específico. Si no, usa el primero disponible.
        intent?.getStringExtra(EXTRA_TOKEN)?.let { tk ->
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_TOKEN, tk)
                .putString(KEY_SITE_NAME, intent.getStringExtra(EXTRA_NAME) ?: "")
                .apply()
        }
        startForeground(NOTIF_ID, buildNotification(null))
        startLoop()
        return START_STICKY
    }

    override fun onDestroy() {
        stopped = true
        worker?.interrupt()
        worker = null
        super.onDestroy()
    }

    private fun startLoop() {
        if (worker?.isAlive == true) return
        stopped = false
        worker = thread(start = true, isDaemon = true, name = "lockscreen-live") {
            val base = WidgetCommon.baseUrl(this)
            while (!stopped && !Thread.currentThread().isInterrupted) {
                val token = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TOKEN, null)
                    ?: pickFirstToken()
                if (!token.isNullOrBlank()) {
                    val json = WidgetCommon.fetchSnapshot(token, base)
                    handler.post { updateNotification(json) }
                }
                try { Thread.sleep(REFRESH_MS) } catch (_: InterruptedException) { return@thread }
            }
        }
    }

    private fun pickFirstToken(): String? {
        val all = getSharedPreferences(WidgetCommon.PREFS, MODE_PRIVATE).all
        for ((k, v) in all) {
            if (k.startsWith("${WidgetCommon.KEY_TOKEN}.") && v is String && v.isNotBlank()) return v
        }
        return null
    }

    private fun updateNotification(json: JSONObject?) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, buildNotification(json))
        } catch (_: Exception) { }
    }

    private fun buildNotification(json: JSONObject?): Notification {
        ensureChannel()

        val siteName = json?.optJSONObject("site")?.optString("name")
            ?: getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SITE_NAME, BrandSync.cached(this).appName)
            ?: BrandSync.cached(this).appName
        val s = json?.optJSONObject("sample")
        val pv = (s?.optDouble("pv_w", 0.0) ?: 0.0).toInt()
        val load = (s?.optDouble("load_w", 0.0) ?: 0.0).toInt()
        val bat = (s?.optDouble("battery_pct", 0.0) ?: 0.0).toInt().coerceIn(0, 100)
        val grid = (s?.optDouble("grid_v", 0.0) ?: 0.0).toInt()

        val pvStr = if (pv >= 1000) String.format("%.1fkW", pv / 1000.0) else "${pv}W"
        val loadStr = if (load >= 1000) String.format("%.1fkW", load / 1000.0) else "${load}W"

        val collapsed = RemoteViews(packageName, R.layout.notif_lockscreen_collapsed).apply {
            setTextViewText(R.id.notif_pv, pvStr)
            setTextViewText(R.id.notif_bat, "${bat}%")
            setTextViewText(R.id.notif_load, loadStr)
        }
        val expanded = RemoteViews(packageName, R.layout.notif_lockscreen).apply {
            setTextViewText(R.id.notif_site, siteName)
            setTextViewText(R.id.notif_pv_value, "$pv W")
            setTextViewText(R.id.notif_bat_value, "$bat%")
            setProgressBar(R.id.notif_bat_bar, 100, bat, false)
            setTextViewText(R.id.notif_load_value, "$load W")
            setTextViewText(R.id.notif_grid_value, if (grid > 50) "RED $grid V" else "RED OFF")
            setTextViewText(R.id.notif_updated, if (json == null) "● SIN CONEXIÓN" else "● EN VIVO")
        }

        val open = packageManager.getLaunchIntentForPackage(packageName)
        val openPi = if (open != null)
            PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        else null

        val stopIntent = Intent(this, LockscreenLiveService::class.java).apply { action = ACTION_STOP }
        val stopPi = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        // Texto nativo de respaldo — siempre visible aunque el sistema ignore el custom view
        val tickerText = "☀ $pvStr   🔋 $bat%   🏠 $loadStr"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle(siteName)
            .setContentText(tickerText)
            .setSubText(if (json == null) "Sin conexión" else "En vivo")
            .setTicker(tickerText)
            .setCustomContentView(collapsed)
            .setCustomBigContentView(expanded)
            .setCustomHeadsUpContentView(collapsed)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(openPi)
            .addAction(0, "Detener", stopPi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }



    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    "Métricas en vivo",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Notificación persistente con métricas solares (pantalla de bloqueo)"
                    setShowBadge(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    enableVibration(false)
                    setSound(null, null)
                }
                nm.createNotificationChannel(ch)
            }
        }
    }

    companion object {
        const val PREFS = "solarops_lockscreen_prefs"
        const val KEY_TOKEN = "lock_token"
        const val KEY_SITE_NAME = "lock_site_name"
        const val KEY_ENABLED = "lock_enabled"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_NAME = "name"
        const val ACTION_STOP = "app.solarops.client.LOCKSCREEN_STOP"

        private const val CHANNEL_ID = "solarops_lockscreen_live"
        private const val NOTIF_ID = 4812
        private const val REFRESH_MS = 30_000L

        fun start(context: Context, token: String?, name: String?) {
            val intent = Intent(context, LockscreenLiveService::class.java)
            if (!token.isNullOrBlank()) intent.putExtra(EXTRA_TOKEN, token)
            if (!name.isNullOrBlank()) intent.putExtra(EXTRA_NAME, name)
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_ENABLED, true).apply()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_ENABLED, false).apply()
            val intent = Intent(context, LockscreenLiveService::class.java).apply { action = ACTION_STOP }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun isEnabled(context: Context): Boolean =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)
    }
}
