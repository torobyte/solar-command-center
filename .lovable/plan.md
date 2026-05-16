## 1. Pantalla de login nativa (`/app-login`)

- Nueva ruta `src/routes/app-login.tsx` con diseño tipo app móvil: fondo con color primario de la marca, logo grande, campos amplios, botón "Entrar", enlace a "Recuperar contraseña" y a "Crear cuenta".
- Usa `supabase.auth.signInWithPassword`. Tras login exitoso → redirige a `/app/widgets` (vista principal de la app) o a la ruta solicitada.
- Se configura en el APK como `start_url` (el `server_url` del APK apuntará a `https://<dominio>/app-login`).
- En el panel SuperAdmin → App APK, el campo "URL inicial" se separa de "URL base" para que el ZIP generado abra siempre `/app-login`.

## 2. Vinculación automática para los widgets

Los widgets de Android viven fuera de la sesión web, así que necesitan su propio token:

- Nueva tabla `widget_tokens` (id, user_id, token, site_id, label, created_at, last_used_at, revoked_at). RLS: cada usuario gestiona los suyos.
- Al hacer login en `/app-login` dentro de la APK, se genera (o reutiliza) automáticamente un `widget_token` y se guarda en `localStorage` de la WebView + se expone vía `window.WidgetBridge.saveToken(token, userId, siteId)` para que el código nativo Android lo capture y lo persista en `SharedPreferences`.
- Endpoint público `src/routes/api/public/widget-data.ts`: recibe `Authorization: Bearer <widget_token>`, valida contra la tabla, devuelve métricas resumidas del sitio asociado (PV, batería, carga, red, estado).

## 3. Sección "Mis widgets" dentro de la app

- Ruta `src/routes/_authenticated/app.widgets.tsx`:
  - Lista de widgets configurados con preview visual (mini-tarjeta tal como se vería en el home Android).
  - Botón "Agregar widget" → selección de sitio + métricas a mostrar (PV, batería, carga, modo, alertas) + tema (claro/oscuro) + intervalo de refresco (15/30/60 min).
  - Editar/eliminar widget existente.
  - Tokens visibles con opción de revocar e instrucciones para añadir el widget desde el home Android.
- Tabla `widget_configs` (id, user_id, token_id, site_id, metrics jsonb, theme, refresh_minutes, label).

## 4. Generación del proyecto Android con widget nativo

Ampliar `src/lib/apk.functions.ts` para añadir al ZIP:

- `android-overrides/src/main/java/<pkg>/SolarWidgetProvider.kt` — `AppWidgetProvider` que:
  - Lee `widget_token` y `widget_config_id` de `SharedPreferences`.
  - Llama vía HTTPS a `/api/public/widget-data?config=<id>` con `Authorization: Bearer <token>`.
  - Renderiza un `RemoteViews` con PV, batería, carga, estado.
  - Programa refresco con `AlarmManager` según `refresh_minutes`.
- `android-overrides/src/main/res/layout/widget_solar.xml` — layout del widget (icono, métricas, timestamp).
- `android-overrides/src/main/res/xml/widget_solar_info.xml` — metadatos (`minWidth=250dp`, `minHeight=110dp`, `updatePeriodMillis`, preview).
- `android-overrides/src/main/AndroidManifest.xml` — fragmento `<receiver>` para `SolarWidgetProvider` con `android.appwidget.action.APPWIDGET_UPDATE`.
- Clase puente `WidgetBridge.kt` registrada como `@JavascriptInterface` en la `WebView` de Capacitor para capturar el token desde el login web.
- Actualizar `setup.sh` para fusionar el manifest fragment con el generado por Capacitor.

## 5. Detalles técnicos

- Capacitor expone `WebView` a través de `BridgeActivity`; se añade un plugin Kotlin mínimo (`WidgetTokenPlugin`) que escribe en `SharedPreferences("solar_widget", MODE_PRIVATE)` los valores recibidos desde JS.
- El widget hace HTTP simple con `HttpURLConnection` (sin dependencias extra) para evitar inflar el APK.
- Token rotable: al revocar desde el panel, el endpoint responde 401 y el widget muestra "Sesión expirada — abre la app".
- El endpoint `/api/public/widget-data` valida firma del token (UUID v4 random) contra tabla; no expone PII más allá del nombre del sitio.

## Archivos a crear / editar

- Nuevo: `src/routes/app-login.tsx`
- Nuevo: `src/routes/_authenticated/app.widgets.tsx`
- Nuevo: `src/lib/widgets.functions.ts` (CRUD de configs + tokens)
- Nuevo: `src/routes/api/public/widget-data.ts`
- Migración SQL: tablas `widget_tokens`, `widget_configs` + RLS
- Editar: `src/lib/apk.functions.ts` (añadir Kotlin + layouts + manifest fragment)
- Editar: `src/components/admin/ApkAdmin.tsx` (campo "Ruta inicial" separado, por defecto `/app-login`)
- Editar: `supabase/migrations/...`
