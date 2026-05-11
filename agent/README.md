# Agente Local SolarOps

Funciona en Raspberry Pi, Orange Pi o cualquier placa Linux Debian/Ubuntu
conectada por USB a un inversor Voltronic / Axpert / MPP-Solar / similar.

## Instalación rápida (una sola línea)

```bash
# Opción A — instalar y activar después desde la UI local (LAN):
curl -fsSL https://raw.githubusercontent.com/torobyte/solar-command-center/main/agent/install.sh | sudo bash

# Opción B — instalar con el token del dispositivo ya generado en la web:
curl -fsSL https://raw.githubusercontent.com/torobyte/solar-command-center/main/agent/install.sh | sudo bash -s -- TU_DEVICE_TOKEN
```

Tras la instalación, abre `http://<ip-del-dispositivo>/` desde cualquier
ordenador en la misma red local. La UI local no requiere inicio de sesión.

## Cómo funciona

- Escanea automáticamente `/dev/hidraw*` buscando un inversor que responda a `QPIRI`.
- Consulta `QPIGS` y `QMOD` cada 5 s.
- Cachea las muestras en `/var/lib/solarops/state.db` para que la UI local
  funcione sin conexión.
- Envía las muestras a `https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app/api/public/ingest`
  cada 30 s usando el token del dispositivo (`Authorization: Bearer …`).
- Si no está activado, la UI local muestra un formulario de activación: pega
  el código de licencia que generó el superadmin y elige un nombre para el
  sitio. El agente llama a `/api/public/activate` para vincular la licencia
  a un nuevo sitio y guarda el token devuelto.

## Auto-actualización

El instalador registra un `systemd timer` (`solarops-update.timer`) que
ejecuta `git pull` cada hora. Si hay cambios, reinicia el agente.

## Rutas reales del sistema

| Ruta | Función |
|---|---|
| `/opt/solarops/agent.py` | El demonio del agente |
| `/opt/solarops/repo/`    | Clon del repositorio (`torobyte/solar-command-center`) |
| `/opt/solarops/update.sh` | Script de auto-actualización |
| `/opt/solarops/venv/`    | Entorno virtual Python (Flask + requests) |
| `/etc/solarops/config.json` | URL de la nube + token del dispositivo |
| `/var/lib/solarops/state.db` | Caché local SQLite |
| `/etc/systemd/system/solarops.service` | Unidad systemd del agente |
| `/etc/systemd/system/solarops-update.service` | Unidad systemd del actualizador |
| `/etc/systemd/system/solarops-update.timer` | Temporizador horario del actualizador |
| `/etc/udev/rules.d/99-solarops.rules` | Permisos udev para `hidraw` |

## Sistema operativo soportado

- **Raspberry Pi OS Lite (64-bit)** — Bookworm o más reciente (recomendado)
- **Ubuntu Server 22.04/24.04 LTS (ARM64)**
- Cualquier Debian/Ubuntu con `apt-get` y `systemd`

## Control manual

```bash
sudo systemctl status solarops
sudo journalctl -u solarops -f
sudo systemctl restart solarops
sudo systemctl list-timers solarops-update
```

## Repositorios privados

Si tu repo `torobyte/solar-command-center` es privado, pasa un token de GitHub:

```bash
GITHUB_TOKEN=ghp_xxx curl -fsSL https://raw.githubusercontent.com/torobyte/solar-command-center/main/agent/install.sh | sudo -E bash
```
