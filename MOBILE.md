# SolarOps — App móvil Android + Widget

Esta app móvil es una **carcasa Capacitor** que carga la web publicada,
más un **widget nativo de Android** (Kotlin) que muestra solar / carga /
batería en la pantalla de inicio.

> No necesitas mantener dos códigos: cualquier cambio en la web aparece
> en el móvil sin recompilar el APK. Solo recompilas si cambias el widget.

## Requisitos

- Android Studio (Hedgehog o superior)
- Java 17
- Android SDK API 34+
- Node 20 + bun (ya instalado en el proyecto)

## 1) Generar el proyecto Android

```bash
# Desde la raíz del proyecto
bun add -d @capacitor/cli @capacitor/core @capacitor/android
bunx cap add android
bunx cap sync android
```

Esto crea la carpeta `android/` con un proyecto Gradle estándar que
abre la web publicada (URL configurada en `capacitor.config.ts`).

## 2) Copiar los archivos del widget

Los archivos nativos están en `android-widget/`. Cópialos a su sitio:

```bash
cp android-widget/java/SolarOpsWidget.kt        android/app/src/main/java/app/solarops/client/
cp android-widget/java/WidgetConfigActivity.kt  android/app/src/main/java/app/solarops/client/
cp android-widget/res/layout/widget_solarops.xml      android/app/src/main/res/layout/
cp android-widget/res/drawable/widget_background.xml  android/app/src/main/res/drawable/
cp android-widget/res/xml/widget_solarops_info.xml    android/app/src/main/res/xml/
cp android-widget/res/values/strings_widget.xml       android/app/src/main/res/values/
```

Crea `android/app/src/main/res/xml/` si no existe.

### Editar `AndroidManifest.xml`

Pega el contenido de `android-widget/AndroidManifest.snippet.xml` dentro
del bloque `<application>` del manifest principal.

Asegúrate de que el `package` declarado coincide con `app.solarops.client`
(es el `appId` de `capacitor.config.ts`).

## 3) Compilar e instalar

```bash
bunx cap open android
```

En Android Studio: **Build → Build APK** o **Run** sobre tu teléfono
con depuración USB activada.

## 4) Añadir el widget al home

1. Mantén pulsada la pantalla de inicio → **Widgets**
2. Busca **SolarOps**, arrástralo
3. Aparecerá un diálogo pidiendo el **device_token**
4. Cópialo desde la web: ve a tu sitio → **Configuration → API/Token**
5. Pega y guarda

El widget se actualiza automáticamente cada ~30 min (límite de Android
para `AppWidgetProvider`). Toca el widget para abrir la app completa.

### Polling más frecuente (opcional)

Si necesitas refresco cada minuto, hay que añadir un `PeriodicWorkRequest`
de WorkManager en `SolarOpsWidget.kt`. Avísame y lo añado — no se incluye
por defecto porque consume más batería.

## Endpoint que usa el widget

```
GET https://<tu-dominio>/api/public/widget?token=<device_token>

Response:
{
  "site": { "name": "...", "fresh": true, "age_seconds": 4, "status": "online" },
  "sample": {
    "recorded_at": "2026-05-13T21:30:00Z",
    "pv_w": 1234, "load_w": 890,
    "battery_pct": 87, "battery_v": 52.3, "grid_v": 230.1,
    "inverter_mode": "L"
  }
}
```

CORS abierto, sin autenticación de usuario — solo el `device_token`
del sitio actúa como bearer.
