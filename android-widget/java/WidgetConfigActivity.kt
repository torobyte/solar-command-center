package app.solarops.client

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Lets the user paste their device_token when adding the widget.
 * Drop into: android/app/src/main/java/app/solarops/client/WidgetConfigActivity.kt
 *
 * Reference this activity from AndroidManifest.xml:
 *   <activity
 *       android:name=".WidgetConfigActivity"
 *       android:exported="true"
 *       android:theme="@android:style/Theme.DeviceDefault.Dialog">
 *       <intent-filter>
 *           <action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" />
 *       </intent-filter>
 *   </activity>
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

        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish(); return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 40, 40, 40)
        }
        val title = TextView(this).apply { text = getString(R.string.widget_config_title); textSize = 16f }
        val hint = TextView(this).apply {
            text = getString(R.string.widget_config_hint); textSize = 12f
            setPadding(0, 12, 0, 12)
        }
        val input = EditText(this).apply { this.hint = "device_token" }
        val save = Button(this).apply { text = getString(R.string.widget_config_save) }

        save.setOnClickListener {
            val token = input.text.toString().trim()
            if (token.isEmpty()) return@setOnClickListener
            getSharedPreferences(SolarOpsWidget.PREFS, MODE_PRIVATE).edit()
                .putString("${SolarOpsWidget.KEY_TOKEN}.$widgetId", token)
                .apply()

            // Force an immediate refresh
            val mgr = AppWidgetManager.getInstance(this)
            val updateIntent = Intent(this, SolarOpsWidget::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(widgetId))
            }
            sendBroadcast(updateIntent)
            // Ensure the real-time alarm tick is scheduled
            SolarOpsWidget.scheduleAlarm(this)
            mgr.updateAppWidget(widgetId, null) // triggers onUpdate via provider

            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
            finish()
        }

        val lp = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(title, lp); root.addView(hint, lp); root.addView(input, lp); root.addView(save, lp)
        setContentView(root)
    }
}
