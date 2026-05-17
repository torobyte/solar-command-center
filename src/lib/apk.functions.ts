import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ApkConfigSchema = z.object({
  app_id: z
    .string()
    .min(3)
    .max(120)
    .regex(
      /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i,
      "Formato de paquete inválido (ej: app.miempresa.cliente)",
    ),
  app_name: z.string().min(1).max(60),
  version_name: z.string().min(1).max(20),
  version_code: z.number().int().min(1).max(2147483647),
  server_url: z.string().url(),
  start_path: z.string().min(1).max(120).regex(/^\//, "Debe iniciar con /"),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  splash_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  status_bar_style: z.enum(["light", "dark"]),
  icon_url: z.string().url().nullable().optional(),
  splash_url: z.string().url().nullable().optional(),
  enable_push: z.boolean(),
  cleartext: z.boolean(),
});

function normalizeApkServerUrl(raw?: string | null) {
  const fallback = "https://appsolar.torobyte.com";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app" ||
      hostname === "project--7cb3041b-eb20-43aa-ba17-b0848cb53051-dev.lovable.app" ||
      hostname === "id-preview--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"
    ) {
      return fallback;
    }

    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function normalizeApkConfig<T extends { server_url?: string | null; start_path?: string | null }>(
  config: T,
): T {
  return {
    ...config,
    server_url: normalizeApkServerUrl(config.server_url),
    start_path:
      !config.start_path || config.start_path === "/app-login" ? "/apk-auth" : config.start_path,
  };
}

async function ensureSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (!data) throw new Error("Acceso denegado: solo superadmin");
}

export const getApkConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const { data, error } = await supabase.from("apk_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return {
      config: data ? normalizeApkConfig(data) : data,
    };
  });

export const saveApkConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApkConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const normalized = normalizeApkConfig(data);
    const { error } = await supabase
      .from("apk_config")
      .update({ ...normalized })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

export const generateApkProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const { data: rawCfg } = await supabase
      .from("apk_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const cfg = rawCfg ? normalizeApkConfig(rawCfg) : rawCfg;
    if (!cfg) throw new Error("Configuración no encontrada");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const slug = cfg.app_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // ---------------- capacitor.config.ts ----------------
    const startUrl = cfg.server_url.replace(/\/$/, "") + (cfg.start_path || "/apk-auth");
    const capacitorConfig = `import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: ${JSON.stringify(cfg.app_id)},
  appName: ${JSON.stringify(cfg.app_name)},
  webDir: "dist",
  server: {
    url: ${JSON.stringify(startUrl)},
    cleartext: ${cfg.cleartext},
    androidScheme: "https",
  },
  android: {
    backgroundColor: ${JSON.stringify(cfg.background_color)},
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: ${JSON.stringify(cfg.splash_color)},
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: ${JSON.stringify(cfg.status_bar_style.toUpperCase())},
      backgroundColor: ${JSON.stringify(cfg.background_color)},
    },
  },
};

export default config;
`;

    // ---------------- package.json ----------------
    const packageJson = {
      name: slug,
      version: cfg.version_name,
      private: true,
      scripts: {
        prepare:
          "mkdir -p dist && echo '<!doctype html><html><body></body></html>' > dist/index.html",
        "android:add": "npx cap add android",
        "android:assets":
          "npx @capacitor/assets generate --android --iconBackgroundColor " +
          cfg.background_color +
          " --splashBackgroundColor " +
          cfg.splash_color,
        "android:apply-overrides":
          "cp -r android-overrides/. android/app/src/main/ && echo 'Overrides aplicados'",
        "android:sync": "npx cap sync android",
        "android:open": "npx cap open android",
      },
      dependencies: {
        "@capacitor/android": "^6.1.2",
        "@capacitor/core": "^6.1.2",
        "@capacitor/splash-screen": "^6.0.2",
        "@capacitor/status-bar": "^6.0.2",
        ...(cfg.enable_push ? { "@capacitor/push-notifications": "^6.0.2" } : {}),
      },
      devDependencies: {
        "@capacitor/cli": "^6.1.2",
        "@capacitor/assets": "^3.0.5",
      },
    };

    // ---------------- Recursos Android (strings/colors/styles) ----------------
    const stringsXml = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${escapeXml(cfg.app_name)}</string>
    <string name="title_activity_main">${escapeXml(cfg.app_name)}</string>
    <string name="package_name">${escapeXml(cfg.app_id)}</string>
    <string name="custom_url_scheme">${escapeXml(cfg.app_id)}</string>
</resources>
`;

    const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">${cfg.primary_color}</color>
    <color name="colorPrimaryDark">${cfg.primary_color}</color>
    <color name="colorAccent">${cfg.primary_color}</color>
    <color name="splashBackground">${cfg.splash_color}</color>
    <color name="appBackground">${cfg.background_color}</color>
</resources>
`;

    const stylesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`;

    // android-overrides/ — se copia sobre android/app/src/main/ tras `cap add android`
    const OVERRIDE_BASE = "android-overrides/res";
    zip.file(`${OVERRIDE_BASE}/values/strings.xml`, stringsXml);
    zip.file(`${OVERRIDE_BASE}/values/colors.xml`, colorsXml);
    zip.file(`${OVERRIDE_BASE}/values/styles.xml`, stylesXml);

    // ---------------- Iconos y splash ----------------
    const iconBytes = cfg.icon_url ? await fetchBytes(cfg.icon_url) : null;
    const splashBytes = cfg.splash_url ? await fetchBytes(cfg.splash_url) : null;

    if (iconBytes) {
      zip.file("resources/icon.png", iconBytes);
      // copia el mismo PNG en todas las densidades (Android lo escala);
      // si el usuario corre `npm run android:assets` se regenera con tamaños óptimos.
      const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
      for (const d of densities) {
        zip.file(`${OVERRIDE_BASE}/mipmap-${d}/ic_launcher.png`, iconBytes);
        zip.file(`${OVERRIDE_BASE}/mipmap-${d}/ic_launcher_round.png`, iconBytes);
        zip.file(`${OVERRIDE_BASE}/mipmap-${d}/ic_launcher_foreground.png`, iconBytes);
      }
    }
    if (splashBytes) {
      zip.file("resources/splash.png", splashBytes);
      const drawables = [
        "drawable",
        "drawable-port-mdpi",
        "drawable-port-hdpi",
        "drawable-port-xhdpi",
        "drawable-port-xxhdpi",
        "drawable-port-xxxhdpi",
        "drawable-land-mdpi",
        "drawable-land-hdpi",
        "drawable-land-xhdpi",
        "drawable-land-xxhdpi",
        "drawable-land-xxxhdpi",
      ];
      for (const d of drawables) {
        zip.file(`${OVERRIDE_BASE}/${d}/splash.png`, splashBytes);
      }
    }

    // ---------------- variables.gradle (versión) ----------------
    const variablesGradle = `ext {
    minSdkVersion = 23
    compileSdkVersion = 34
    targetSdkVersion = 34
    androidxActivityVersion = '1.9.0'
    androidxAppCompatVersion = '1.7.0'
    androidxCoordinatorLayoutVersion = '1.2.0'
    androidxCoreVersion = '1.13.1'
    androidxFragmentVersion = '1.8.0'
    coreSplashScreenVersion = '1.0.1'
    androidxWebkitVersion = '1.11.0'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.2.1'
    androidxEspressoCoreVersion = '3.6.1'
    cordovaAndroidVersion = '10.1.1'
    appVersionCode = ${cfg.version_code}
    appVersionName = "${cfg.version_name}"
}
`;
    zip.file("android-overrides/variables.gradle", variablesGradle);

    // ---------------- Widget nativo Android ----------------
    const pkgPath = cfg.app_id.replace(/\./g, "/");
    const widgetEndpoint = cfg.server_url.replace(/\/$/, "") + "/api/public/widget-data";

    zip.file(
      `${OVERRIDE_BASE}/xml/widget_solar_info.xml`,
      `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp" android:minHeight="110dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_solar"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`,
    );

    zip.file(
      `${OVERRIDE_BASE}/layout/widget_solar.xml`,
      `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent" android:layout_height="match_parent"
    android:orientation="vertical" android:padding="12dp" android:background="#0f0f0f">
    <TextView android:id="@+id/widget_title" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:textColor="#ffffff" android:textStyle="bold" android:textSize="14sp" android:text="${escapeXml(cfg.app_name)}" />
    <TextView android:id="@+id/widget_site" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:textColor="#a3a3a3" android:textSize="11sp" android:text="—" />
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content"
        android:orientation="horizontal" android:layout_marginTop="8dp" android:weightSum="2">
        <TextView android:id="@+id/widget_pv" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content"
            android:textColor="#ffffff" android:textSize="16sp" android:text="PV —" />
        <TextView android:id="@+id/widget_bat" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content"
            android:textColor="#ffffff" android:textSize="16sp" android:text="Bat —" />
    </LinearLayout>
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content"
        android:orientation="horizontal" android:layout_marginTop="4dp" android:weightSum="2">
        <TextView android:id="@+id/widget_load" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content"
            android:textColor="#fafafa" android:textSize="13sp" android:text="Carga —" />
        <TextView android:id="@+id/widget_grid" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content"
            android:textColor="#fafafa" android:textSize="13sp" android:text="Red —" />
    </LinearLayout>
    <TextView android:id="@+id/widget_ts" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:textColor="#737373" android:textSize="10sp" android:layout_marginTop="6dp" android:gravity="end" android:text="—" />
</LinearLayout>
`,
    );

    zip.file(
      `android-overrides/java/${pkgPath}/SolarWidgetProvider.kt`,
      `package ${cfg.app_id}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

class SolarWidgetProvider : AppWidgetProvider() {
    companion object { const val ACTION_REFRESH = "${cfg.app_id}.WIDGET_REFRESH" }
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) { for (id in ids) refresh(context, mgr, id) }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(android.content.ComponentName(context, SolarWidgetProvider::class.java))
            for (id in ids) refresh(context, mgr, id)
        }
    }
    private fun refresh(context: Context, mgr: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_solar)
        val prefs = context.getSharedPreferences("solar_widget", Context.MODE_PRIVATE)
        val token = prefs.getString("token", null)
        val configId = prefs.getString("config_id", null)
        val openIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (openIntent != null) {
            val pi = PendingIntent.getActivity(context, 0, openIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            views.setOnClickPendingIntent(R.id.widget_title, pi)
        }
        if (token.isNullOrEmpty() || configId.isNullOrEmpty()) {
            views.setTextViewText(R.id.widget_site, "Inicia sesión en la app")
            mgr.updateAppWidget(id, views); return
        }
        thread {
            try {
                val url = URL("${widgetEndpoint}?config=" + configId)
                val con = url.openConnection() as HttpURLConnection
                con.requestMethod = "GET"
                con.setRequestProperty("Authorization", "Bearer " + token)
                con.connectTimeout = 8000; con.readTimeout = 8000
                val code = con.responseCode
                if (code == 200) {
                    val body = con.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(body)
                    val site = json.optJSONObject("site")
                    val sample = json.optJSONObject("sample") ?: JSONObject()
                    views.setTextViewText(R.id.widget_title, json.optString("label", "Solar"))
                    views.setTextViewText(R.id.widget_site, site?.optString("name") ?: "—")
                    views.setTextViewText(R.id.widget_pv, "PV " + fmt(sample.opt("pv_input_power")) + " W")
                    views.setTextViewText(R.id.widget_bat, "Bat " + fmt(sample.opt("battery_capacity")) + " %")
                    views.setTextViewText(R.id.widget_load, "Carga " + fmt(sample.opt("load_percent")) + " %")
                    views.setTextViewText(R.id.widget_grid, "Red " + fmt(sample.opt("grid_voltage")) + " V")
                    views.setTextViewText(R.id.widget_ts, SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date()))
                } else if (code == 401) views.setTextViewText(R.id.widget_site, "Sesión expirada — abre la app")
                else views.setTextViewText(R.id.widget_site, "Error " + code)
            } catch (e: Exception) { views.setTextViewText(R.id.widget_site, "Sin conexión") }
            finally { mgr.updateAppWidget(id, views) }
        }
    }
    private fun fmt(v: Any?): String {
        if (v == null || v == JSONObject.NULL) return "—"
        return try { String.format(Locale.US, "%.0f", (v as Number).toDouble()) } catch (e: Exception) { v.toString() }
    }
}
`,
    );

    zip.file(
      `android-overrides/java/${pkgPath}/SolarWidgetBridge.kt`,
      `package ${cfg.app_id}

import android.appwidget.AppWidgetManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "SolarWidgetBridge")
class SolarWidgetBridge : Plugin() {
    @PluginMethod
    fun saveToken(call: PluginCall) {
        val payload = call.getString("payload") ?: return call.reject("payload required")
        val obj = JSONObject(payload)
        val prefs = context.getSharedPreferences("solar_widget", android.content.Context.MODE_PRIVATE)
        val ed = prefs.edit()
        ed.putString("token", obj.optString("token"))
        ed.putString("token_id", obj.optString("tokenId"))
        if (obj.has("configId")) ed.putString("config_id", obj.optString("configId"))
        ed.apply()
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(android.content.ComponentName(context, SolarWidgetProvider::class.java))
        val intent = android.content.Intent(context, SolarWidgetProvider::class.java)
        intent.action = SolarWidgetProvider.ACTION_REFRESH
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        context.sendBroadcast(intent)
        val res = JSObject(); res.put("ok", true); call.resolve(res)
    }
}
`,
    );

    zip.file(
      "android-overrides/AndroidManifest.fragment.xml",
      `<!-- Insertar dentro de <application> en android/app/src/main/AndroidManifest.xml -->
<receiver android:name="${cfg.app_id}.SolarWidgetProvider" android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
        <action android:name="${cfg.app_id}.WIDGET_REFRESH" />
    </intent-filter>
    <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_solar_info" />
</receiver>
`,
    );

    zip.file(
      "android-overrides/MainActivity.snippet.txt",
      `// En MainActivity.java, dentro de onCreate(), ANTES de super.onCreate():
// registerPlugin(${cfg.app_id}.SolarWidgetBridge.class);
`,
    );

    // ---------------- Script de post-instalación ----------------
    const postScript = `#!/usr/bin/env bash
set -e
echo "==> Preparando proyecto Android para ${cfg.app_name}"
npm install
npm run prepare
npx cap add android || echo "android ya existe"
echo "==> Aplicando overrides"
cp -r android-overrides/res/. android/app/src/main/res/
mkdir -p android/app/src/main/java
cp -r android-overrides/java/. android/app/src/main/java/
cp android-overrides/variables.gradle android/
echo "==> Manifest: añade manualmente el contenido de android-overrides/AndroidManifest.fragment.xml dentro de <application>"
echo "==> MainActivity: añade el registerPlugin de android-overrides/MainActivity.snippet.txt"
npx cap sync android
echo "Listo. Ejecuta: npx cap open android"
`;
    zip.file("setup.sh", postScript);

    // ---------------- README ----------------
    const readme = `# ${cfg.app_name} — Proyecto Android

| Campo        | Valor |
|--------------|-------|
| Versión      | ${cfg.version_name} (code ${cfg.version_code}) |
| Package ID   | \`${cfg.app_id}\` |
| Servidor     | ${cfg.server_url} |
| Push         | ${cfg.enable_push ? "Habilitado" : "Deshabilitado"} |

## Inicio rápido (Mac/Linux)

\`\`\`bash
chmod +x setup.sh && ./setup.sh
npx cap open android
\`\`\`

## Paso a paso (Windows o manual)

1. \`npm install\`
2. \`npm run prepare\` — crea \`dist/\` mínimo
3. \`npx cap add android\` — genera la carpeta \`android/\`
4. Copia \`android-overrides/res/*\` a \`android/app/src/main/res/\` (sobrescribe)
5. Copia \`android-overrides/variables.gradle\` a \`android/variables.gradle\`
6. (Opcional) \`npm run android:assets\` — regenera íconos/splash con tamaños óptimos a partir de \`resources/icon.png\` y \`resources/splash.png\`
7. \`npx cap sync android\`
8. \`npx cap open android\` — abre Android Studio
9. **Build → Generate Signed Bundle / APK** → APK → crea o usa tu keystore → release

## Push Notifications

${
  cfg.enable_push
    ? "Habilitadas. Configura Firebase Cloud Messaging: descarga `google-services.json` y colócalo en `android/app/`. Añade el plugin en `android/build.gradle` y `android/app/build.gradle` según la doc de @capacitor/push-notifications."
    : "Deshabilitadas. Para habilitarlas, vuelve al panel SuperAdmin → App APK."
}

## Cambios de configuración

Para actualizar colores, versión, ícono o splash: vuelve al panel **SuperAdmin → App APK**, modifica, guarda y descarga el zip de nuevo. Cada descarga refleja la configuración actual.
`;

    zip.file("capacitor.config.ts", capacitorConfig);
    zip.file("package.json", JSON.stringify(packageJson, null, 2));
    zip.file("README.md", readme);
    zip.file(".gitignore", "node_modules\nandroid/\ndist/\n*.keystore\n");

    const base64 = await zip.generateAsync({ type: "base64" });
    return { filename: `${slug}-android-v${cfg.version_name}.zip`, base64 };
  });

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const TriggerBuildSchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  ref: z.string().min(1).max(100).default("main"),
  workflow: z.string().min(1).max(100).default("build-apk.yml"),
  release_tag: z.string().max(60).optional(),
});

export const triggerApkBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TriggerBuildSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);

    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) throw new Error("Falta el secreto GITHUB_DISPATCH_TOKEN");

    const url = `https://api.github.com/repos/${data.owner}/${data.repo}/actions/workflows/${data.workflow}/dispatches`;
    const body: Record<string, unknown> = { ref: data.ref };
    if (data.release_tag) body.inputs = { release_tag: data.release_tag };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "solarops-admin",
      },
      body: JSON.stringify(body),
    });

    if (res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
    }

    return { ok: true, ref: data.ref, workflow: data.workflow };
  });

const BuildStatusSchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  workflow: z.string().min(1).max(100).default("build-apk.yml"),
});

export const getApkBuildStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BuildStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);

    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "solarops-admin",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = `https://api.github.com/repos/${data.owner}/${data.repo}/actions/workflows/${data.workflow}/runs?per_page=5`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
    }
    const json: any = await res.json();
    const runs = (json.workflow_runs ?? []).slice(0, 5).map((r: any) => ({
      id: r.id,
      run_number: r.run_number,
      status: r.status as "queued" | "in_progress" | "completed",
      conclusion: r.conclusion as null | "success" | "failure" | "cancelled" | "skipped",
      html_url: r.html_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
      event: r.event,
      head_branch: r.head_branch,
    }));
    return { runs };
  });
