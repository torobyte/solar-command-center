# Agente Local SolarOps

Funciona en Raspberry Pi, Orange Pi o cualquier placa Linux Debian/Ubuntu
conectada por USB a un inversor Voltronic / Axpert / MPP-Solar / similar.

## Instalación en una sola línea (sin GitHub)

El instalador y el agente se descargan **directamente desde tu servidor
SolarOps** — no necesitas clonar ningún repositorio:

```bash
curl -fsSL https://appsolar.torobyte.com/api/public/agent/install | sudo bash
```

¿Quieres pre-vincular un token de dispositivo ya generado en la web?

```bash
curl -fsSL https://appsolar.torobyte.com/api/public/agent/install | sudo bash -s -- TU_DEVICE_TOKEN
```

¿Apuntar a otra instancia de SolarOps?

```bash
SOLAROPS_CLOUD_URL=https://mi-servidor.com \
  curl -fsSL https://mi-servidor.com/api/public/agent/install | sudo -E bash
```

Tras la instalación, abre `http://<ip-del-dispositivo>/` desde cualquier
ordenador en la misma red local. La UI local no requiere inicio de sesión.

## Cómo funciona

- Escanea automáticamente `/dev/hidraw*` buscando un inversor que responda a `QPIRI`.
- Consulta `QPIGS` y `QMOD` cada 5 s.
- Cachea las muestras en `/var/lib/solarops/state.db`.
- Envía las muestras a `https://appsolar.torobyte.com/api/public/ingest`
  cada 30 s usando el token del dispositivo.

## Auto-actualización (sin git)

El instalador registra un `systemd timer` (`solarops-update.timer`) que cada
hora descarga `https://appsolar.torobyte.com/api/public/agent/agent`,
compara el hash SHA-256 con el agente instalado y, si cambió, lo reemplaza
y reinicia el servicio. La UI local detecta la nueva versión vía
`/api/version` y se recarga sola.

## Endpoints públicos del instalador

| URL | Sirve |
|---|---|
| `/api/public/agent/install` | Script `install.sh` |
| `/api/public/agent/agent`   | Código Python del agente (`agent.py`) |
| `/api/public/agent/update`  | Script `update.sh` |

## Rutas del sistema

| Ruta | Función |
|---|---|
| `/opt/solarops/agent.py` | Demonio del agente |
| `/opt/solarops/update.sh` | Script de auto-actualización |
| `/opt/solarops/venv/`    | Entorno virtual Python |
| `/etc/solarops/config.json` | URL de la nube + token del dispositivo |
| `/etc/solarops/cloud_url` | URL base usada por el auto-updater |
| `/var/lib/solarops/state.db` | Caché local SQLite |
| `/etc/systemd/system/solarops.service` | Servicio del agente |
| `/etc/systemd/system/solarops-update.timer` | Auto-update horario |
| `/etc/udev/rules.d/99-solarops.rules` | Permisos udev para `hidraw` |

## Sistema operativo soportado

- Raspberry Pi OS Lite (64-bit), Bookworm o más reciente
- Ubuntu Server 22.04/24.04 LTS (ARM64)
- Cualquier Debian/Ubuntu con `apt-get` y `systemd`

## Control manual

```bash
sudo systemctl status solarops
sudo journalctl -u solarops -f
sudo systemctl restart solarops
sudo systemctl list-timers solarops-update
```

## Forzar actualización inmediata

```bash
sudo bash /opt/solarops/update.sh
```
