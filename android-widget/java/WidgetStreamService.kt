package app.solarops.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Foreground service that holds an SSE connection to
 * /api/public/widget-stream and broadcasts WIDGET_TICK to every widget
 * provider on each "sample" event, so the home-screen widgets refresh in
 * near real-time as the Raspberry pushes telemetry to the backend.
 *
 * One connection is opened per distinct device_token found across all
 * configured widgets. Reconnects automatically with exponential backoff.
 */
class WidgetStreamService : Service() {

    private val running = AtomicBoolean(false)
    private val workers = mutableMapOf<String, Thread>()
    @Volatile private var stopped = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification())
        if (running.compareAndSet(false, true)) {
            stopped = false
            startStreams()
        } else {
            // Refresh tokens if widgets were added/removed
            startStreams()
        }
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
            // stop streams whose token disappeared
            val gone = workers.keys.filter { it !in tokens }
            for (t in gone) { workers[t]?.interrupt(); workers.remove(t) }
            // start new
            for (t in tokens) {
                if (workers[t]?.isAlive == true) continue
                val worker = thread(start = true, isDaemon = true, name = "widget-sse-${t.take(6)}") {
                    streamLoop(t)
                }
                workers[t] = worker
            }
        }
        if (tokens.isEmpty()) stopSelf()
    }

    private fun collectTokens(): Set<String> {
        val prefs = getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).all
        val out = mutableSetOf<String>()
        for ((k, v) in prefs) {
            if (k.startsWith("${WidgetCommon.KEY_TOKEN}.") && v is String && v.isNotBlank()) {
                out.add(v)
            }
        }
        return out
    }

    private fun streamLoop(token: String) {
        val base = WidgetCommon.baseUrl(this)
        var backoff = 1_000L
        while (!stopped && !Thread.currentThread().isInterrupted) {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL("$base/api/public/widget-stream?token=$token").openConnection() as HttpURLConnection).apply {
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
                while (!stopped) {
                    val line = reader.readLine() ?: break
                    when {
                        line.startsWith("event:") -> currentEvent = line.substringAfter(":").trim()
                        line.startsWith("data:") -> {
                            // Only "sample" events warrant a re-render; the widget
                            // refetches its own snapshot from /api/public/widget so
                            // we don't need to parse the payload here.
                            if (currentEvent == "sample") triggerWidgetRefresh()
                        }
                        line.isEmpty() -> currentEvent = "message"
                    }
                }
            } catch (_: Exception) {
                // fall through to reconnect
            } finally {
                try { conn?.disconnect() } catch (_: Exception) {}
            }
            if (stopped) break
            sleepBackoff(backoff)
            backoff = (backoff * 2).coerceAtMost(30_000)
        }
    }

    private fun sleepBackoff(ms: Long) {
        try { Thread.sleep(ms) } catch (_: InterruptedException) { return }
    }

    private fun triggerWidgetRefresh() {
        val classes = listOf(
            SolarOpsWidget::class.java,
            SolarOpsWidgetTiles::class.java,
            SolarOpsWidgetGauge::class.java,
            SolarOpsWidgetNeon::class.java,
            SolarOpsWidgetFlow::class.java,
            SolarOpsWidgetMini::class.java,
            SolarOpsWidgetSpeedo::class.java,
            SolarOpsWidgetWave::class.java,
            SolarOpsWidgetStats::class.java,
            SolarOpsWidgetRadial::class.java,
        )
        for (cls in classes) {
            val intent = Intent(this, cls).apply {
                action = WidgetCommon.ACTION_TICK
            }
            sendBroadcast(intent)
        }
        // Asegura que el animador esté corriendo cuando hay widgets Wave en pantalla.
        WaveAnimator.start(applicationContext)
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                BrandSync.cached(this).appName + " widgets",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Mantiene los widgets actualizados en tiempo real"
                setShowBadge(false)
            }
            nm.createNotificationChannel(ch)
        }
        val openApp = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (openApp != null)
            PendingIntent.getActivity(this, 0, openApp, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        else null

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(BrandSync.cached(this).appName)
            .setContentText("Widgets en tiempo real")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
            .setContentIntent(pi)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "solarops_widget_stream"
        private const val NOTIF_ID = 4711

        fun start(context: Context) {
            val intent = Intent(context, WidgetStreamService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopIfNoWidgets(context: Context) {
            val prefs = context.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE).all
            val any = prefs.keys.any { it.startsWith("${WidgetCommon.KEY_TOKEN}.") }
            if (!any) {
                context.stopService(Intent(context, WidgetStreamService::class.java))
            } else {
                // restart so the worker set picks up the new token list
                start(context)
            }
        }
    }
}
