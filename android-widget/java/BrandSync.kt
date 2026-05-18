package app.solarops.client

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sincroniza la marca del APK (colores, splash, icono) desde
 * /api/public/apk-brand y la cachea en SharedPreferences para que el
 * splash de MainActivity pueda usar el branding configurado por el
 * superadmin sin tener que esperar la red en el primer arranque.
 */
object BrandSync {
    private const val TAG = "SolarBrandSync"
    private const val PREFS = "solarops_brand_cache"
    private const val K_SPLASH_COLOR = "splash_color"
    private const val K_BG_COLOR = "background_color"
    private const val K_PRIMARY_COLOR = "primary_color"
    private const val K_APP_NAME = "app_name"
    private const val K_ICON_URL = "icon_url"
    private const val K_SPLASH_URL = "splash_url"
    private const val K_STATUS_LIGHT = "status_bar_light"
    private const val ICON_FILE = "brand_icon.png"
    private const val SPLASH_FILE = "brand_splash.png"

    data class Brand(
        val splashColor: Int,
        val bgColor: Int,
        val primaryColor: Int,
        val appName: String,
        val statusBarLight: Boolean,
        val iconBitmap: Bitmap?,
        val splashBitmap: Bitmap?,
    )

    private fun parseColor(hex: String?, fallback: Int): Int =
        try {
            if (hex.isNullOrBlank()) fallback
            else android.graphics.Color.parseColor(if (hex.startsWith("#")) hex else "#$hex")
        } catch (_: Throwable) {
            fallback
        }

    fun cached(context: Context): Brand {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val icon = File(context.filesDir, ICON_FILE).takeIf { it.exists() }
            ?.let { runCatching { BitmapFactory.decodeFile(it.absolutePath) }.getOrNull() }
        val splash = File(context.filesDir, SPLASH_FILE).takeIf { it.exists() }
            ?.let { runCatching { BitmapFactory.decodeFile(it.absolutePath) }.getOrNull() }
        return Brand(
            splashColor = parseColor(p.getString(K_SPLASH_COLOR, null), 0xFF0A0A0A.toInt()),
            bgColor = parseColor(p.getString(K_BG_COLOR, null), 0xFF0A0A0A.toInt()),
            primaryColor = parseColor(p.getString(K_PRIMARY_COLOR, null), 0xFFF59E0B.toInt()),
            appName = p.getString(K_APP_NAME, "SolarOps") ?: "SolarOps",
            statusBarLight = p.getBoolean(K_STATUS_LIGHT, true),
            iconBitmap = icon,
            splashBitmap = splash,
        )
    }

    /** Llama desde un thread de background; baja JSON y opcionalmente icon/splash. */
    fun refresh(context: Context) {
        runCatching {
            val base = WidgetCommon.baseUrl(context).trimEnd('/')
            val conn = (URL("$base/api/public/apk-brand").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 6000
                readTimeout = 6000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Cache-Control", "no-cache")
            }
            if (conn.responseCode !in 200..299) return@runCatching
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            json.optString("splash_color").takeIf { it.isNotBlank() }?.let { p.putString(K_SPLASH_COLOR, it) }
            json.optString("background_color").takeIf { it.isNotBlank() }?.let { p.putString(K_BG_COLOR, it) }
            json.optString("primary_color").takeIf { it.isNotBlank() }?.let { p.putString(K_PRIMARY_COLOR, it) }
            json.optString("app_name").takeIf { it.isNotBlank() }?.let { p.putString(K_APP_NAME, it) }
            p.putBoolean(K_STATUS_LIGHT, json.optString("status_bar_style") == "light")
            p.apply()
            val iconUrl = json.optString("icon_url").takeIf { it.isNotBlank() && it != "null" }
            val splashUrl = json.optString("splash_url").takeIf { it.isNotBlank() && it != "null" }
            iconUrl?.let { downloadInto(context, it, ICON_FILE) }
            splashUrl?.let { downloadInto(context, it, SPLASH_FILE) }
        }.onFailure { Log.w(TAG, "refresh failed: ${it.message}") }
    }

    private fun downloadInto(context: Context, url: String, name: String) {
        runCatching {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 6000
                readTimeout = 8000
            }
            if (conn.responseCode !in 200..299) return@runCatching
            val out = File(context.filesDir, name)
            FileOutputStream(out).use { fos -> conn.inputStream.use { it.copyTo(fos) } }
        }
    }
}
