import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ApkConfigSchema = z.object({
  app_id: z.string().min(3).max(120).regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i, "Formato de paquete inválido (ej: app.miempresa.cliente)"),
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

async function ensureSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "superadmin").maybeSingle();
  if (!data) throw new Error("Acceso denegado: solo superadmin");
}

export const getApkConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const { data, error } = await supabase.from("apk_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return { config: data };
  });

export const saveApkConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApkConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const { error } = await supabase.from("apk_config").update({ ...data }).eq("id", 1);
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
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}

export const generateApkProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const { data: cfg } = await supabase.from("apk_config").select("*").eq("id", 1).maybeSingle();
    if (!cfg) throw new Error("Configuración no encontrada");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const slug = cfg.app_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // ---------------- capacitor.config.ts ----------------
    const capacitorConfig = `import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: ${JSON.stringify(cfg.app_id)},
  appName: ${JSON.stringify(cfg.app_name)},
  webDir: "dist",
  server: {
    url: ${JSON.stringify(cfg.server_url)},
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
        prepare: "mkdir -p dist && echo '<!doctype html><html><body></body></html>' > dist/index.html",
        "android:add": "npx cap add android",
        "android:assets": "npx @capacitor/assets generate --android --iconBackgroundColor " + cfg.background_color + " --splashBackgroundColor " + cfg.splash_color,
        "android:apply-overrides": "cp -r android-overrides/. android/app/src/main/ && echo 'Overrides aplicados'",
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
      const drawables = ["drawable", "drawable-port-mdpi", "drawable-port-hdpi", "drawable-port-xhdpi", "drawable-port-xxhdpi", "drawable-port-xxxhdpi", "drawable-land-mdpi", "drawable-land-hdpi", "drawable-land-xhdpi", "drawable-land-xxhdpi", "drawable-land-xxxhdpi"];
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

    // ---------------- Script de post-instalación ----------------
    const postScript = `#!/usr/bin/env bash
set -e
echo "==> Preparando proyecto Android para ${cfg.app_name}"
npm install
npm run prepare
npx cap add android || echo "android ya existe"
echo "==> Aplicando overrides (colores, strings, íconos, splash)"
cp -r android-overrides/res/. android/app/src/main/res/
cp android-overrides/variables.gradle android/
echo "==> Sincronizando"
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

${cfg.enable_push
  ? "Habilitadas. Configura Firebase Cloud Messaging: descarga `google-services.json` y colócalo en `android/app/`. Añade el plugin en `android/build.gradle` y `android/app/build.gradle` según la doc de @capacitor/push-notifications."
  : "Deshabilitadas. Para habilitarlas, vuelve al panel SuperAdmin → App APK."}

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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
