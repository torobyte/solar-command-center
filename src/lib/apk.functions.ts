import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ApkConfigSchema = z.object({
  app_id: z.string().min(3).max(120).regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i, "Formato de paquete inválido (ej: app.miempresa.cliente)"),
  app_name: z.string().min(1).max(60),
  version_name: z.string().min(1).max(20),
  version_code: z.number().int().min(1).max(2147483647),
  server_url: z.string().url(),
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

export const generateApkProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureSuperadmin(supabase, userId);
    const { data: cfg } = await supabase.from("apk_config").select("*").eq("id", 1).maybeSingle();
    if (!cfg) throw new Error("Configuración no encontrada");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

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

    const packageJson = {
      name: cfg.app_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      version: cfg.version_name,
      private: true,
      scripts: {
        "android:add": "npx cap add android",
        "android:sync": "npx cap sync android",
        "android:open": "npx cap open android",
        "android:build": "cd android && ./gradlew assembleRelease",
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
      },
    };

    const readme = `# ${cfg.app_name} — Proyecto Android

Versión: ${cfg.version_name} (code ${cfg.version_code})
Paquete: ${cfg.app_id}
Servidor: ${cfg.server_url}

## Generar el APK

1. \`npm install\`
2. \`mkdir dist && echo "<html></html>" > dist/index.html\`
3. \`npx cap add android\`
4. \`npx cap sync android\`
5. Reemplazar íconos en \`android/app/src/main/res/mipmap-*/\` con los exportados desde el panel.
6. \`npx cap open android\` — abre Android Studio
7. Build → Generate Signed Bundle / APK

## Push notifications
${cfg.enable_push ? "Habilitadas. Configurar Firebase: añadir `google-services.json` en `android/app/`." : "Deshabilitadas."}
`;

    zip.file("capacitor.config.ts", capacitorConfig);
    zip.file("package.json", JSON.stringify(packageJson, null, 2));
    zip.file("README.md", readme);
    zip.file(".gitignore", "node_modules\nandroid/\ndist/\n");

    if (cfg.icon_url) {
      try {
        const r = await fetch(cfg.icon_url);
        if (r.ok) {
          const buf = await r.arrayBuffer();
          zip.file("resources/icon.png", buf);
        }
      } catch {}
    }
    if (cfg.splash_url) {
      try {
        const r = await fetch(cfg.splash_url);
        if (r.ok) {
          const buf = await r.arrayBuffer();
          zip.file("resources/splash.png", buf);
        }
      } catch {}
    }

    const base64 = await zip.generateAsync({ type: "base64" });
    return { filename: `${cfg.app_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-android.zip`, base64 };
  });
