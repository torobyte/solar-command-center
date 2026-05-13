
## Objetivo

Que la interfaz que se ve al abrir `http://<ip-del-pi>/` sea **literalmente el mismo dashboard React** del cloud, leyendo en modo offline desde el propio agente, y eliminar el error `Unexpected token '<', "<!doctype "...`.

---

## Fase 1 — Diagnóstico y fix del error JSON

1. Reproducir abriendo el agente y leyendo Network: identificar qué `fetch()` recibe HTML en vez de JSON.
   Sospechosos: `/api/pvconfig` o `/api/state` cuando el navegador está cacheando el `index.html` viejo de un deploy anterior, o cuando se accede al agente vía un proxy/túnel que reescribe rutas.
2. En `agent/agent.py`:
   - Endurecer `refresh()` y `loadPvCfg()` en el frontend: comprobar `r.ok` y `Content-Type: application/json` antes de `r.json()`. Si no es JSON, mostrar mensaje claro ("agente sin reiniciar / ruta no disponible") en vez del crudo `Unexpected token <`.
   - Añadir `Cache-Control: no-store` a las respuestas `/api/*` para evitar que el navegador sirva un `index.html` cacheado bajo esas URLs.
   - Versionar el HTML servido (`<meta name="agent-build" content="...">` + busting `?v=` en assets) para forzar recarga tras `solarops-update`.

## Fase 2 — Modo "local" del dashboard React

Reutilizar el código real del cloud (`DashboardGrid`, `AdvancedVisuals`, `EnergyFlowDiagram`, `PowerGauges`, `PvSystemConfig`, `SolarForecastWidget`) sin duplicarlo.

1. **Capa de datos abstracta** `src/lib/dataSource.ts`:
   - `getLatestSample(siteId)`, `subscribeSamples(siteId, cb)`, `getPvConfig`, `setPvConfig`, `getHistory`, `getTotalsToday`.
   - Implementación `cloud` (actual: Supabase + realtime).
   - Implementación `local` (fetch a `/api/state` cada 2 s + fetch a `/api/pvconfig`).
   - Selector en runtime con `import.meta.env.VITE_RUNTIME_MODE` (`cloud` por defecto, `local` cuando se compila el bundle del agente).
2. **Refactor mínimo** de `sites.$siteId.tsx` y de los componentes para que consuman `dataSource` en lugar de llamar a `supabase` directamente.
3. **Nueva ruta** `src/routes/local.tsx`:
   - No requiere login (no entra en `_authenticated`).
   - No depende de `siteId` de URL: lo obtiene desde `/api/state` (`license.site_id`).
   - Renderiza el mismo árbol de componentes que `sites.$siteId.tsx`.

## Fase 3 — Pipeline de build embebido

1. Nuevo script `agent/build-ui.mjs`:
   - Ejecuta `vite build --mode local --outDir agent/static_ui` con `VITE_RUNTIME_MODE=local` y `base=/ui/`.
   - Copia el resultado dentro del paquete del agente.
2. `agent/agent.py`:
   - Servir `agent/static_ui/` bajo `/ui/<path>` con `send_from_directory`.
   - `/` redirige a `/ui/local` (o sirve `index.html` con fallback SPA).
   - Mantener `/api/*` igual; los endpoints son la fuente de datos del bundle.
   - Mantener `STATUS_PAGE` en `/status` como diagnóstico (no React).
3. `agent/install.sh` y `agent/update.sh`:
   - Detectar si `static_ui/` existe en el repo descargado; si no, hacer `node build-ui.mjs` (instalar Node si falta — ya está vía nodejs en bullseye/bookworm).
   - Mejor: que el repo de GitHub ya incluya `static_ui/` precompilado en cada release para que Pi/Orange Pi no necesiten Node.

## Fase 4 — Verificación

1. Abrir el preview cloud → confirma que `/sites/{id}` sigue funcionando idéntico (no se rompió nada por el refactor a `dataSource`).
2. Levantar el agente localmente con `python agent/agent.py` → abrir `http://localhost/` → debe verse **píxel-idéntico** al cloud, con datos de `/api/state`, drag & drop y resize funcionando con `localStorage`.
3. Sin internet: el dashboard sigue vivo (todo viene del agente).
4. Reiniciar el servicio tras un update: el navegador carga el bundle nuevo, sin `Unexpected token <`.

---

## Archivos que se tocan

**Nuevos**
- `src/lib/dataSource.ts` (capa cloud/local)
- `src/routes/local.tsx` (entrada del bundle local)
- `agent/build-ui.mjs` (script de empaquetado)
- `agent/static_ui/` (artefacto compilado, commiteado)

**Modificados**
- `src/routes/sites.$siteId.tsx`, `src/components/DashboardGrid.tsx`, `src/components/PvSystemConfig.tsx`, `src/components/AdvancedVisuals.tsx` → usar `dataSource` en vez de `supabase` directo.
- `vite.config.ts` → soporte `mode=local` + `base` configurable.
- `agent/agent.py` → servir `/ui/`, redirigir `/`, headers `no-store` en `/api/*`, bandera de versión.
- `agent/install.sh`, `agent/update.sh` → instalar/copiar `static_ui/`.

## Riesgos / notas

- El refactor a `dataSource` toca el árbol de componentes del cloud; lo haré en commits pequeños y manteniendo el comportamiento existente para no romper realtime ni el admin.
- El bundle compilado pesa ~1–2 MB; aceptable para Pi.
- Si el usuario prefiere no commitear `static_ui/` al repo, el instalador necesitará Node, lo cual añade ~120 MB al Pi. Por defecto lo dejaré commiteado.
