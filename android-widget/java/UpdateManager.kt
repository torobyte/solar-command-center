package app.solarops.client

import android.app.DownloadManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class UpdateManager(private val context: Context) {
    private var downloadId: Long = -1L
    private var receiverRegistered = false

    companion object {
        private const val CHANNEL_ID = "apk_updates"
        private const val NOTIFICATION_ID = 12041
    }

    private val completeReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) ?: -1L
            if (id == downloadId) installDownloadedApk(id)
        }
    }

    fun checkForUpdates() {
        thread {
            runCatching {
                val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    packageInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION") packageInfo.versionCode
                }
                val endpoint = WidgetCommon.baseUrl(context).trimEnd('/') + "/api/public/apk-latest?current_version_code=$currentVersionCode"
                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Cache-Control", "no-cache")
                }
                if (conn.responseCode !in 200..299) return@runCatching
                val payload = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                if (payload.optBoolean("update_available") && payload.optString("apk_url").isNotBlank()) {
                    startDownload(payload)
                } else {
                    notifyAlreadyUpToDate(payload)
                }
            }
        }
    }

    private fun notifyAlreadyUpToDate(payload: JSONObject) {
        val latestName = payload.optString("version_name").ifBlank { currentVersionName() }
        showStatusNotification(
            title = "Tu app ya está actualizada",
            message = "Ya tienes instalada la build $latestName.",
        )
    }

    private fun currentVersionName(): String = runCatching {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        packageInfo.versionName ?: "actual"
    }.getOrDefault("actual")

    private fun startDownload(payload: JSONObject) {
        val apkUrl = payload.optString("apk_url")
        val versionName = payload.optString("version_name", "nueva versión")
        val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
            setTitle("Actualizando ${payload.optString("app_name", BrandSync.cached(context).appName)}")
            setDescription("Descargando $versionName")
            setMimeType("application/vnd.android.package-archive")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "solarops-latest.apk")
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
        }
        ensureReceiver()
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadId = dm.enqueue(request)
        Toast.makeText(context, "Descargando actualización…", Toast.LENGTH_LONG).show()
        showStatusNotification(
            title = "Nueva versión disponible",
            message = "Descargando la build $versionName para instalarla.",
        )
    }

    private fun showStatusNotification(title: String, message: String) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                manager.createNotificationChannel(
                    android.app.NotificationChannel(
                        CHANNEL_ID,
                        "Actualizaciones APK",
                        NotificationManager.IMPORTANCE_DEFAULT,
                    ).apply {
                        description = "Avisos sobre builds nuevas y estado de actualización"
                    },
                )
            }
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    private fun ensureReceiver() {
        if (receiverRegistered) return
        context.registerReceiver(completeReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        receiverRegistered = true
    }

    private fun installDownloadedApk(id: Long) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            Toast.makeText(context, "Permite instalar apps desde esta fuente para completar la actualización.", Toast.LENGTH_LONG).show()
            return
        }

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val uri = dm.getUriForDownloadedFile(id) ?: return
        val install = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            context.startActivity(install)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, "No se pudo abrir el instalador del APK", Toast.LENGTH_LONG).show()
        }
    }
}