package app.solarops.client

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews

/**
 * Anima la onda del widget Wave ciclando 8 frames vectoriales pre-renderizados
 * a ~7 FPS mediante partiallyUpdateAppWidget. Es la única forma confiable de
 * obtener animación continua dentro de un AppWidget (los RemoteViews no
 * permiten AnimationDrawable/Animator de manera reproducible entre launchers).
 */
object WaveAnimator {

    private const val FRAME_MS = 130L
    private val FRAMES = intArrayOf(
        R.drawable.wave_frame_0, R.drawable.wave_frame_1,
        R.drawable.wave_frame_2, R.drawable.wave_frame_3,
        R.drawable.wave_frame_4, R.drawable.wave_frame_5,
        R.drawable.wave_frame_6, R.drawable.wave_frame_7,
    )

    private val handler = Handler(Looper.getMainLooper())
    private var running = false
    private var frame = 0

    fun start(context: Context) {
        val app = context.applicationContext
        if (running) return
        running = true
        handler.post(object : Runnable {
            override fun run() {
                if (!running) return
                val mgr = AppWidgetManager.getInstance(app)
                val ids = WidgetCommon.widgetIdsFor(app, SolarOpsWidgetWave::class.java)
                if (ids.isEmpty()) {
                    running = false
                    return
                }
                val rv = RemoteViews(app.packageName, R.layout.widget_solarops_wave)
                rv.setImageViewResource(R.id.wave_graph, FRAMES[frame])
                for (id in ids) {
                    try { mgr.partiallyUpdateAppWidget(id, rv) } catch (_: Exception) {}
                }
                frame = (frame + 1) % FRAMES.size
                handler.postDelayed(this, FRAME_MS)
            }
        })
    }

    fun stop() {
        running = false
        handler.removeCallbacksAndMessages(null)
    }
}
