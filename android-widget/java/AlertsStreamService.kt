package app.solarops.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import org.json.JSONObject

/**
 * AlertsStreamService — Mantiene una conexión SSE viva con
 * /api/public/alerts-stream por cada device_token guardado, y dispara
 * notificaciones nativas (sonido / vibración / pantalla de bloqueo) cuando
 * el backend emite un nuevo `notification_event`.
 *
 * Web Push (VAPID + service worker) no funciona dentro del WebView de
 * Capacitor, por eso usamos este canal nativo paralelo.
 */
class AlertsStreamService : Service() {

    private val running = AtomicBoolean(false)
    private val workers = mutableMapOf<String, Thread>()
    @Volatile private var stopped = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, false).apply()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        ensureChannels()
        startForeground(NOTIF_ID, buildSilentForegroundNotification())
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, true).apply()
        if (running.compareAndSet(false, true)) {
            stopped = false
        }
        startStreams()
        return START_STICKY
    }

    override fun onDestroy() {
        stopped = true
        synchronized(workers) {
            workers.values.forEach { it.interrupt() }
            workers.clear()
        }
        running.set(false)
        super.onDestroy()
    }

    private fun startStreams() {
        val tokens = collectTokens()
        synchronized(workers) {
            val gone = workers.keys.filter { it !in tokens }
            for (t in gone) { workers[t]?.interrupt(); workers.remove(t) }
            for (t in tokens) {
                if (workers[t]?.isAlive == true) continue
                val w = thread(start = true, isDaemon = true, name = "alerts-sse-${t.take(6)}") {
                    streamLoop(t)
                }
                workers[t] = w
            }
        }
        if (tokens.isEmpty()) {
            // No hay sitios todavía: nos quedamos vivos esperando que el
            // WebView termine de sincronizar y reinicie el servicio.
        }
    }

    private fun collectTokens(): Set<String> {
        val out = mutableSetOf<String>()
        // Tokens guardados por los widgets (uno por widgetId).
        val wprefs = getSharedPreferences(WidgetCommon.PREFS, MODE_PRIVATE).all
        for ((k, v) in wprefs) {
            if (k.startsWith("${WidgetCommon.KEY_TOKEN}.") && v is String && v.isNotBlank()) {
                out.add(v)
            }
        }
        // Lista global de sitios sincronizada por MainActivity.
        try {
            val sitesJson = getSharedPreferences(WidgetSetupActivity.PREFS, MODE_PRIVATE)
                .getString(WidgetSetupActivity.KEY_SITES_JSON, null)
            if (!sitesJson.isNullOrBlank()) {
                val arr = org.json.JSONArray(sitesJson)
                for (i in 0 until arr.length()) {
                    val tk = arr.getJSONObject(i).optString("token")
                    if (tk.isNotBlank()) out.add(tk)
                }
            }
        } catch (_: Exception) { /* ignore */ }
        return out
    }

    private fun streamLoop(token: String) {
        val base = WidgetCommon.baseUrl(this)
        var backoff = 1_000L
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        val sinceKey = "since.$token"
        while (!stopped && !Thread.currentThread().isInterrupted) {
            var conn: HttpURLConnection? = null
            try {
                val since = prefs.getString(sinceKey, null)
                val urlStr = if (since.isNullOrBlank())
                    "$base/api/public/alerts-stream?token=$token"
                else
                    "$base/api/public/alerts-stream?token=$token&since=${Uri.encode(since)}"
                conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8_000
                    readTimeout = 60_000
                    requestMethod = "GET"
                    setRequestProperty("Accept", "text/event-stream")
                    setRequestProperty("Cache-Control", "no-cache")
                    doInput = true
                }
                val code = conn.responseCode
                if (code !in 200..299) {
                    sleepBackoff(backoff); backoff = (backoff * 2).coerceAtMost(30_000); continue
                }
                backoff = 1_000L
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                var currentEvent = "message"
                var dataBuf = StringBuilder()
                while (!stopped) {
                    val line = reader.readLine() ?: break
                    when {
                        line.startsWith("event:") -> currentEvent = line.substringAfter(":").trim()
                        line.startsWith("data:") -> dataBuf.append(line.substringAfter(":").trim())
                        line.isEmpty() -> {
                            val data = dataBuf.toString()
                            dataBuf = StringBuilder()
                            if (currentEvent == "alert" && data.isNotBlank()) {
                                handleAlert(token, data, sinceKey)
                            }
                            currentEvent = "message"
                        }
                    }
                }
            } catch (_: Exception) {
                // reconectar
            } finally {
                try { conn?.disconnect() } catch (_: Exception) {}
            }
            if (stopped) break
            sleepBackoff(backoff)
            backoff = (backoff * 2).coerceAtMost(30_000)
        }
    }

    private fun handleAlert(token: String, data: String, sinceKey: String) {
        try {
            val obj = JSONObject(data)
            val id = obj.optString("id")
            val title = obj.optString("title").ifBlank { "Alerta" }
            val body = obj.optString("body")
            val severity = obj.optString("severity", "info")
            val createdAt = obj.optString("created_at")
            val siteId = obj.optString("site_id")

            // Anti-duplicados: si ya disparamos este id, ignorar.
            val seenPrefs = getSharedPreferences(PREFS, MODE_PRIVATE)
            val lastId = seenPrefs.getString("lastid.$token", null)
            if (id.isNotBlank() && id == lastId) return

            showAlertNotification(title, body, severity, siteId, id.hashCode())

            seenPrefs.edit().apply {
                if (id.isNotBlank()) putString("lastid.$token", id)
                if (createdAt.isNotBlank()) putString(sinceKey, createdAt)
            }.apply()
        } catch (_: Exception) { /* ignore */ }
    }

    private fun showAlertNotification(
        title: String, body: String, severity: String, siteId: String, notifId: Int,
    ) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = when (severity) {
            "critical" -> CHANNEL_CRITICAL
            "warning" -> CHANNEL_WARNING
            else -> CHANNEL_INFO
        }
        val priority = when (severity) {
            "critical" -> NotificationCompat.PRIORITY_MAX
            "warning" -> NotificationCompat.PRIORITY_HIGH
            else -> NotificationCompat.PRIORITY_DEFAULT
        }

        val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            putExtra("solarops_open_site", siteId)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pi = if (open != null)
            PendingIntent.getActivity(
                this, notifId, open,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        else null

        val n = NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(priority)
            .setCategory(
                if (severity == "critical") NotificationCompat.CATEGORY_ALARM
                else NotificationCompat.CATEGORY_MESSAGE
            )
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pi)
            .build()
        nm.notify(if (notifId == 0) System.currentTimeMillis().toInt() else notifId, n)
    }

    private fun sleepBackoff(ms: Long) {
        try { Thread.sleep(ms) } catch (_: InterruptedException) { return }
    }

    private fun buildSilentForegroundNotification(): Notification {
        val open = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (open != null)
            PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        else null
        return NotificationCompat.Builder(this, CHANNEL_FG)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(BrandSync.cached(this).appName)
            .setContentText("Alertas en tiempo real")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
            .setContentIntent(pi)
            .build()
    }

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_FG) == null) {
            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_FG, "Servicio de alertas", NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Mantiene la conexión para recibir alertas"
                setShowBadge(false); enableVibration(false); setSound(null, null)
            })
        }
        if (nm.getNotificationChannel(CHANNEL_INFO) == null) {
            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_INFO, "Alertas · Info", NotificationManager.IMPORTANCE_DEFAULT
            ).apply { lockscreenVisibility = Notification.VISIBILITY_PUBLIC })
        }
        if (nm.getNotificationChannel(CHANNEL_WARNING) == null) {
            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_WARNING, "Alertas · Advertencia", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                enableVibration(true); lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
        if (nm.getNotificationChannel(CHANNEL_CRITICAL) == null) {
            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_CRITICAL, "Alertas · Crítica", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                enableVibration(true); setBypassDnd(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
    }

    companion object {
        const val PREFS = "solarops_alerts_prefs"
        const val KEY_ENABLED = "alerts_enabled"
        const val ACTION_STOP = "app.solarops.client.ALERTS_STOP"

        private const val CHANNEL_FG = "solarops_alerts_fg"
        private const val CHANNEL_INFO = "solarops_alerts_info"
        private const val CHANNEL_WARNING = "solarops_alerts_warning"
        private const val CHANNEL_CRITICAL = "solarops_alerts_critical"
        private const val NOTIF_ID = 4910

        fun start(context: Context) {
            val intent = Intent(context, AlertsStreamService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, AlertsStreamService::class.java).apply { action = ACTION_STOP }
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
