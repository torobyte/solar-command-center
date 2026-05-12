
## Objetivo

Reorganizar el sistema de licencias para que cada código quede vinculado a un email desde el momento en que el superadmin lo crea, y agregar las funciones tipo Solar Assistant que pediste: configuración del inversor (lectura + escritura remota), especificación detallada, estado de red y estado del sistema/hardware.

---

## Parte 1 — Licencias vinculadas por email

### Cambios de base de datos
- Añadir `assigned_email text` a `license_codes` (lowercase, indexado).
- Añadir `assigned_user_id uuid` (se rellena cuando el usuario se registra/canjea).
- Trigger `before insert/update`: normaliza email a lowercase; si existe un `auth.users` con ese email, llena `assigned_user_id` automáticamente.
- Trigger `on auth.users insert`: cuando un usuario nuevo se registra, busca `license_codes` con su email y los vincula (`assigned_user_id`, `owner_id`).
- En `activate.ts`: validar que el email del JWT del usuario coincida con `assigned_email` antes de canjear (o que el código sea pre-asignado a su `user_id`).

### Panel superadmin (`/admin`)
- Formulario de creación pide: email destino + plan + duración + nombre del sitio (opcional).
- Tabla muestra: código, email asignado, estado (pendiente/canjeado/expirado), usuario vinculado, sitio canjeado, fecha.
- Acciones: copiar código, reenviar por email (futuro), revocar.
- Filtros por estado y búsqueda por email.

### Panel de usuario (`/app`)
- Sección "Mis licencias": lista las licencias asignadas a su email aunque no estén canjeadas todavía, con botón "Activar en un nuevo sitio" (genera comando de instalación con el código pre-rellenado).

### Cómo el sistema sabe a quién corresponde una licencia
1. El superadmin la crea con `assigned_email`.
2. Si ese email ya tiene cuenta → se vincula al `user_id` al instante.
3. Si no, queda esperando: cuando el usuario se registra con ese email, el trigger la vincula automáticamente.
4. Al canjear (`/api/public/activate` con device token), el endpoint exige que el email del usuario autenticado coincida con `assigned_email`.

---

## Parte 2 — Funciones tipo Solar Assistant

Nueva pestaña **Configuration** (rediseñada) en `sites/$siteId.tsx` con bloques colapsables:

### A. General
Site owner, Site ID, plan, expira, botones "Configurar acceso local", "Ver token de instalación".

### B. Inverter — Specification (read-only)
Tarjeta con: driver, modelo, serial, firmware, topología, voltaje nominal batería, max AC input/output, max AC power. Datos vienen de un nuevo endpoint del agente `/api/spec` (ejecuta `QPIRI` + `QID` + `QVFW`) que se sube periódicamente a una nueva tabla `inverter_specs (site_id pk, raw jsonb, updated_at)`.

### C. Inverter — Settings (lectura + escritura)
Campos editables (basados en captura 2):
- Output source priority (Solar first / Utility first / SBU)
- Charger source priority (Solar only / Solar+Utility / Utility first)
- AC input voltage range (Appliance / UPS)
- AC output voltage / frequency
- Max charge current / Max AC charge current
- Battery bulk/float/cutoff voltages
- Buzzer, LCD backlight, power saving, overload bypass/restart

### D. Network status
SSID, IP eth0, IP wlan0, IP pública/Internet up-down. Recogido por el agente y subido junto a `/heartbeat`.

### E. System status
CPU temp, almacenamiento, USB devices count, board model, versión del agente, "voltage dips" si el modelo lo expone.

---

## Parte 3 — Control remoto (cola de comandos)

### Tabla `device_commands`
Campos clave: `site_id`, `command` (`set_output_priority`, `set_charge_current`, etc.), `payload jsonb`, `status` (`pending`/`sent`/`done`/`failed`), `result jsonb`, `created_by`, timestamps.

RLS: el dueño del sitio (o superadmin) puede insertar y leer; el agente lee/actualiza vía device token.

### Endpoints públicos para el agente
- `GET /api/public/commands?token=...` → devuelve comandos `pending` y los marca `sent`.
- `POST /api/public/commands/ack` → el agente reporta resultado (`done`/`failed` + `result`).
- `POST /api/public/spec` → sube specification + network + system snapshots.

### Agente Python
- Loop adicional cada 10 s: pide comandos, los traduce a comandos Voltronic (`POP02`, `PCP00`, `MCHGC040`, `MNCHGC020`, `PSDV*`, `PCVV*`, `PBFT*`, etc.), ejecuta y hace ack.
- Cada 60 s: empuja `spec`, `network`, `system` al endpoint nuevo.

### UI
Cada control en "Settings" envía un command insertando en `device_commands`. La fila aparece como "Pendiente → Enviado → Aplicado" usando realtime. Si falla, muestra el error y permite reintentar.

---

## Notas técnicas

- Migrations: añadir columnas, triggers, tablas `inverter_specs`, `device_commands`, índices y RLS.
- Frontend: refactor `/admin` y `/sites/$siteId` (pestaña Configuration). Crear hooks `useInverterSpec`, `useInverterSettings`, `useDeviceCommand`.
- Backend: 3 nuevos endpoints en `src/routes/api/public/`.
- Agente: nuevos módulos `commands.py` y `snapshots.py`, integrados en el loop principal de `agent.py`.
- Seguridad: todos los endpoints públicos validan `device_token`; el frontend valida que el usuario sea owner antes de encolar comandos (RLS lo refuerza).
- i18n: añadir traducciones es/en para los nuevos textos.

¿Apruebas el plan o quieres ajustar algo (por ejemplo, recortar el set inicial de parámetros editables)?
