package app.solarops.client

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Picker shown when the user drops the SolarOps widget on the home screen.
 *
 * It lists the sites previously fetched by MainActivity (login → /rest/v1/sites)
 * and stores the chosen device_token under the widget's id, so the user never
 * has to copy/paste anything by hand.
 */
class WidgetConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 40, 40, 40)
        }

        TextView(this).apply {
            text = "Elige el sitio"
            textSize = 18f
            setPadding(0, 0, 0, 16)
            root.addView(this)
        }

        val sites = MainActivity.savedSites(this)
        if (sites.length() == 0) {
            root.addView(TextView(this).apply {
                text = "No hay sitios guardados.\nAbre la app SolarOps e inicia sesión primero."
                setPadding(0, 0, 0, 16)
            })
            root.addView(Button(this).apply {
                text = "Abrir SolarOps"
                setOnClickListener {
                    startActivity(Intent(this@WidgetConfigActivity, MainActivity::class.java))
                    finish()
                }
            })
            setContentView(ScrollView(this).apply { addView(root) })
            return
        }

        for (i in 0 until sites.length()) {
            val site = sites.getJSONObject(i)
            val name = site.optString("name", "?")
            val token = site.optString("token", "")
            val btn = Button(this).apply {
                text = name
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                setOnClickListener { selectSite(token) }
            }
            root.addView(btn, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = 12 })
        }

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun selectSite(token: String) {
        if (token.isEmpty()) { finish(); return }
        getSharedPreferences(SolarOpsWidget.PREFS, MODE_PRIVATE).edit()
            .putString("${SolarOpsWidget.KEY_TOKEN}.$widgetId", token)
            .apply()

        // Trigger immediate refresh + ensure the alarm is scheduled.
        sendBroadcast(Intent(this, SolarOpsWidget::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(widgetId))
        })
        SolarOpsWidget.scheduleAlarm(this)

        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
