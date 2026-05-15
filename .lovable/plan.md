# Plan

Seis cambios en un solo lote. Los agrupo por área para que sea fácil revisarlos.

## 1. Detección del inversor (bug)

Hoy el header de `/sites/$siteId` muestra "Inverter not yet detected" aunque ya hay `inverter_specs.serial_number = 929321` y telemetría llegando. El estado actual depende de `devices`, que el agente nunca crea.

Cambio en `src/routes/sites.$siteId.tsx`:
- Considerar **conectado** si:
  - hay un sample en `telemetry_samples` con `recorded_at` en los últimos 5 min, **O**
  - existe fila en `inverter_specs` con `serial_number` o `model_name`.
- Mostrar el modelo desde `inverter_specs.model_name` cuando exista; caer al de `devices` si no.

## 2. Configuración: traer todos los datos del inversor

Hoy `inverter_specs` trae 11 columnas y la UI solo pinta modelo/serial. Voy a agregar un panel **"Información del inversor"** en la pestaña Configuración que muestre:

- model_name, serial_number, firmware
- machine_type, topology, driver
- nominal_battery_voltage
- max_ac_input_current, expected_ac_input_voltage
- max_ac_output_power, max_ac_output_apparent_power, max_ac_output_current
- updated_at

Más un colapsable "Datos crudos (raw)" con el JSON completo para debugging.

## 3. Reestructurar la sección Configuración

La pestaña Configuración hoy es un mosaico mezclado. La reorganizo en sub-tabs:

```
Configuración
 ├─ Inversor       → InverterInfoPanel (specs) + InverterConfigWizard (5 pasos)
 ├─ Sistema PV     → PvSystemConfig
 ├─ Notificaciones → NotificationsConfig
 ├─ Dashboard      → DashboardCustomizer
 └─ Compartir      → SiteSharing (nuevo, ver §5)
```

Visualmente: `Tabs` shadcn dentro de la pestaña, headers consistentes con icono + título + descripción, separadores claros. Sin tocar lógica del wizard ni de PvSystemConfig (solo contenedor).

## 4. Vista multi-sitio `/sites/overview`

Nueva ruta `src/routes/sites.overview.tsx`:
- Lee todos los sitios del usuario.
- Para cada uno, suscripción realtime al último sample → tarjeta compacta con los 4 medidores en vivo (PV, Carga, Batería %, Red).
- Botón nuevo "Vista global" en la lista de sitios actual que navega a `/sites/overview`.
- Click en una tarjeta → `/sites/$siteId`.
- Layout grid responsive (1/2/3 columnas).

## 5. Compartir sitio (roles múltiples)

Nueva tabla + UI:

```sql
create type site_member_role as enum ('viewer','operator','admin');

create table site_members (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  user_id uuid not null,
  role site_member_role not null default 'viewer',
  invited_email text,
  created_at timestamptz not null default now(),
  unique(site_id, user_id)
);

create table site_invitations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  email text not null,
  role site_member_role not null default 'viewer',
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by uuid not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
```

- Helper SECURITY DEFINER `is_site_member(_site uuid, _user uuid, _min_role site_member_role)` para usar en RLS sin recursión.
- Trigger en signup que vincula invitaciones pendientes por email al `user_id` (igual al patrón de `link_licenses_to_new_user`).
- **Actualizar TODAS las RLS** de `sites`, `telemetry_samples`, `inverter_specs`, `device_snapshots`, `daily_totals`, `devices`, `device_commands`, `pv_system_config` para aceptar también miembros del sitio. Roles:
  - `viewer` → solo SELECT
  - `operator` → SELECT + INSERT en `device_commands` (puede mandar comandos rápidos)
  - `admin` → todo lo del owner excepto borrar el sitio

Componente `SiteSharing.tsx` en la pestaña Compartir:
- Lista de miembros actuales con su rol (editable / removible si soy owner/admin).
- Lista de invitaciones pendientes.
- Form "Invitar por email" con selector de rol.
- Server fn `inviteSiteMember` (envía email con SMTP existente si está habilitado, si no muestra link manual `/invite/$token`).
- Ruta `/invite/$token` que acepta la invitación tras login.

## 6. Quick actions en el dashboard

Nuevo componente `QuickActions.tsx` integrado en la pestaña Dashboard de `/sites/$siteId`, arriba del grid:

- **Corriente carga AC**: chips 2A / 10A / 20A / 30A → `set_max_ac_charge_current { amps }`
- **Prioridad de salida**: chips SBU / Solar / Utility → `set_output_priority { value: "02"/"01"/"00" }`
- **Prioridad de carga**: chips Solar / Utility / Both → `set_charger_priority { value: "03"/"00"/"02" }`
- **Buzzer**: toggle on/off → `set_buzzer_enabled { enabled }`

Mismo patrón que el wizard: si hay agente local detectado (`agentBase`), POST a `/api/command`; si no, INSERT en `device_commands`. Confirmación previa para corriente <10 A. Toast con resultado.

## Detalles técnicos

- Migración SQL: tipo enum + 2 tablas + función `is_site_member` + actualización de policies + trigger.
- Server functions nuevas en `src/lib/sharing.functions.ts`: `listMembers`, `inviteMember`, `updateMemberRole`, `removeMember`, `acceptInvitation`.
- Email de invitación: reutiliza la plantilla del sistema (agrego entry `site_invitation` a `email_templates`).
- Nada toca `client.ts`, `types.ts`, `auth-middleware.ts`, ni `auth-attacher.ts`.
- Realtime: la tabla `telemetry_samples` ya está publicada; agrego `site_members` para refrescar la UI cuando cambie un rol.

## Archivos

Nuevos:
- `src/routes/sites.overview.tsx`
- `src/routes/invite.$token.tsx`
- `src/components/SiteSharing.tsx`
- `src/components/QuickActions.tsx`
- `src/components/InverterInfoPanel.tsx`
- `src/lib/sharing.functions.ts`

Editados:
- `src/routes/sites.$siteId.tsx` (detección, sub-tabs config, integrar QuickActions)
- `src/routes/index.tsx` o lista de sitios (botón "Vista global")
- Migración SQL.

## Riesgo / scope

Es un cambio grande pero cohesivo. Si querés podemos partirlo en dos releases:
- **Release A**: items 1, 2, 3, 6 (todo del sitio individual)
- **Release B**: items 4, 5 (multi-sitio + compartir)

Confirma si lo hacemos todo en un lote o en dos.