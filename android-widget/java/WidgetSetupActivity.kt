package app.solarops.client

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * SolarOps companion app entry point.
 *
 * Logs the user in against Supabase Auth (REST), fetches the sites they
 * own, and stores them locally so WidgetConfigActivity can show a picker
 * instead of asking the user to paste a device_token.
 */
class MainActivity : Activity() {

    companion object {
        const val SUPABASE_URL = "https://mtsxmdwraxnwobxsdrqr.supabase.co"
        const val SUPABASE_ANON =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
            "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10c3htZHdyYXhud29ieHNkcnFyIiwi" +
            "cm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDIzMjMsImV4cCI6MjA5MzU3ODMyM30." +
            "KxdurjmE8days9hAFucQFF2x-Ef3Ltpp7UUS9_rbdMU"

        const val PREFS = "solarops_app_prefs"
        const val KEY_SITES_JSON = "sites_json" // JSONArray of {id,name,token}
        const val KEY_USER_EMAIL = "user_email"

        fun savedSites(ctx: Context): JSONArray {
            val raw = ctx.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(KEY_SITES_JSON, "[]") ?: "[]"
            return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        }
    }

    private lateinit var status: TextView
    private lateinit var sitesView: LinearLayout
    private lateinit var emailInput: EditText
    private lateinit var passInput: EditText
    private lateinit var loginBtn: Button
    private lateinit var logoutBtn: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
            setBackgroundColor(0xFF0A0A0A.toInt())
        }
        val scroll = ScrollView(this).apply { addView(root) }

        TextView(this).apply {
            text = "SolarOps"
            textSize = 24f
            setTextColor(0xFFEAB308.toInt())
            root.addView(this)
        }
        TextView(this).apply {
            text = "Inicia sesión y elige tu sitio en el widget."
            setTextColor(0xFFCBD5E1.toInt())
            setPadding(0, 8, 0, 24)
            root.addView(this)
        }

        emailInput = EditText(this).apply {
            hint = "email"; setHintTextColor(0xFF94A3B8.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        passInput = EditText(this).apply {
            hint = "contraseña"; setHintTextColor(0xFF94A3B8.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        loginBtn = Button(this).apply { text = "Entrar" }
        logoutBtn = Button(this).apply { text = "Cerrar sesión" }
        status = TextView(this).apply {
            setTextColor(0xFFF59E0B.toInt()); setPadding(0, 16, 0, 16)
        }
        sitesView = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val lp = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        root.addView(emailInput, lp)
        root.addView(passInput, lp)
        root.addView(loginBtn, lp)
        root.addView(status, lp)
        root.addView(TextView(this).apply { text = "Tus sitios"; setTextColor(0xFFFFFFFF.toInt()); textSize = 16f; setPadding(0, 16, 0, 8) }, lp)
        root.addView(sitesView, lp)
        root.addView(logoutBtn, lp)

        setContentView(scroll)

        loginBtn.setOnClickListener { doLogin() }
        logoutBtn.setOnClickListener { doLogout() }

        renderSites()
        val savedEmail = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_USER_EMAIL, null)
        if (savedEmail != null) emailInput.setText(savedEmail)
    }

    private fun doLogout() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .remove(KEY_SITES_JSON).remove(KEY_USER_EMAIL).apply()
        renderSites()
        status.text = "Sesión cerrada."
    }

    private fun doLogin() {
        val email = emailInput.text.toString().trim()
        val pass = passInput.text.toString()
        if (email.isEmpty() || pass.isEmpty()) {
            status.text = "Email y contraseña requeridos."; return
        }
        loginBtn.isEnabled = false
        status.text = "Conectando..."
        thread {
            val result = runCatching { loginAndFetchSites(email, pass) }
            Handler(Looper.getMainLooper()).post {
                loginBtn.isEnabled = true
                result.onSuccess { sites ->
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString(KEY_SITES_JSON, sites.toString())
                        .putString(KEY_USER_EMAIL, email)
                        .apply()
                    status.text = "Listo: ${sites.length()} sitio(s)."
                    renderSites()
                    Toast.makeText(this, "Ahora añade el widget a tu pantalla de inicio.", Toast.LENGTH_LONG).show()
                }.onFailure {
                    status.text = "Error: ${it.message}"
                }
            }
        }
    }

    private fun renderSites() {
        sitesView.removeAllViews()
        val sites = savedSites(this)
        if (sites.length() == 0) {
            sitesView.addView(TextView(this).apply {
                text = "Sin sitios. Inicia sesión."
                setTextColor(0xFF94A3B8.toInt())
            })
            return
        }
        for (i in 0 until sites.length()) {
            val s = sites.getJSONObject(i)
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(24, 24, 24, 24)
                setBackgroundColor(0xFF1F2937.toInt())
                gravity = Gravity.CENTER_VERTICAL
            }
            card.addView(TextView(this).apply {
                text = s.optString("name", "?")
                setTextColor(0xFFFFFFFF.toInt())
                layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
            })
            card.addView(TextView(this).apply {
                text = "✓"
                setTextColor(0xFF22C55E.toInt())
                textSize = 18f
            })
            sitesView.addView(card, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
                bottomMargin = 12
            })
        }
    }

    private fun loginAndFetchSites(email: String, password: String): JSONArray {
        // 1) auth
        val authConn = (URL("$SUPABASE_URL/auth/v1/token?grant_type=password").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 8000; readTimeout = 8000
            setRequestProperty("apikey", SUPABASE_ANON)
            setRequestProperty("Content-Type", "application/json")
        }
        OutputStreamWriter(authConn.outputStream).use {
            it.write(JSONObject().put("email", email).put("password", password).toString())
        }
        if (authConn.responseCode !in 200..299) {
            val err = (authConn.errorStream ?: authConn.inputStream).bufferedReader().use { it.readText() }
            throw RuntimeException("Login falló (${authConn.responseCode}): ${err.take(120)}")
        }
        val authJson = JSONObject(authConn.inputStream.bufferedReader().use { it.readText() })
        val token = authJson.optString("access_token")
        if (token.isEmpty()) throw RuntimeException("Sin access_token")

        // 2) sites
        val sitesConn = (URL("$SUPABASE_URL/rest/v1/sites?select=id,name,device_token&order=name.asc").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000; readTimeout = 8000
            setRequestProperty("apikey", SUPABASE_ANON)
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
        }
        if (sitesConn.responseCode !in 200..299) {
            val err = (sitesConn.errorStream ?: sitesConn.inputStream).bufferedReader().use { it.readText() }
            throw RuntimeException("Sitios (${sitesConn.responseCode}): ${err.take(120)}")
        }
        val arr = JSONArray(sitesConn.inputStream.bufferedReader().use { it.readText() })
        // Normalize to {id,name,token}
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.put(JSONObject()
                .put("id", o.optString("id"))
                .put("name", o.optString("name"))
                .put("token", o.optString("device_token")))
        }
        return out
    }
}
