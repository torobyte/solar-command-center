#!/usr/bin/env bash
# SolarOps auto-updater — descarga el agente (y a sí mismo) directamente
# desde la nube. Ejecutado por el systemd timer cada hora.
set -euo pipefail

CLOUD_URL="$(cat /etc/solarops/cloud_url 2>/dev/null || echo 'https://appsolar.torobyte.com')"
AGENT_URL="${CLOUD_URL}/api/public/agent/agent"
UPDATER_URL="${CLOUD_URL}/api/public/agent/update"
AGENT_DST="/opt/solarops/agent.py"
UPDATER_DST="/opt/solarops/update.sh"

TMP_AGENT=$(mktemp)
TMP_UPDATER=$(mktemp)
trap 'rm -f "$TMP_AGENT" "$TMP_UPDATER"' EXIT

log() { echo "[update $(date -u +%H:%M:%S)] $*"; }

# ---------- 1) Auto-actualización del propio updater ----------
if curl -fsSL --max-time 30 "$UPDATER_URL" -o "$TMP_UPDATER"; then
  if head -n 3 "$TMP_UPDATER" | grep -q "^#!.*bash"; then
    NEW=$(sha256sum "$TMP_UPDATER" | awk '{print $1}')
    OLD=$(sha256sum "$UPDATER_DST" 2>/dev/null | awk '{print $1}' || echo "none")
    if [[ "$NEW" != "$OLD" ]]; then
      log "self-update $OLD -> $NEW"
      install -m 755 "$TMP_UPDATER" "$UPDATER_DST"
      log "re-ejecutando updater actualizado"
      exec "$UPDATER_DST"
    fi
  fi
fi

# ---------- 2) Descargar agente ----------
if ! curl -fsSL --max-time 60 "$AGENT_URL" -o "$TMP_AGENT"; then
  log "no se pudo descargar $AGENT_URL"
  exit 0
fi

if ! head -n 5 "$TMP_AGENT" | grep -q -E "^(#!.*python|from |import )"; then
  log "respuesta inválida desde $AGENT_URL"
  exit 0
fi

NEW_HASH=$(sha256sum "$TMP_AGENT" | awk '{print $1}')
OLD_HASH=$(sha256sum "$AGENT_DST" 2>/dev/null | awk '{print $1}' || echo "none")

if [[ "$NEW_HASH" == "$OLD_HASH" ]]; then
  exit 0
fi

log "$OLD_HASH -> $NEW_HASH"
install -m 755 "$TMP_AGENT" "$AGENT_DST"

# ---------- 3) Refrescar dependencias Python ----------
# Solo intentamos instalar deps si falta alguna — evita golpear PyPI cada hora
# y silencia errores SSL transitorios (UNEXPECTED_EOF_WHILE_READING en /simple/flask/).
PYBIN=/opt/solarops/venv/bin/python
PIPBIN=/opt/solarops/venv/bin/pip
NEED_DEPS=0
for mod in flask requests serial paho.mqtt.client; do
  if ! "$PYBIN" -c "import $mod" >/dev/null 2>&1; then NEED_DEPS=1; break; fi
done
if [[ "$NEED_DEPS" == "1" ]]; then
  log "instalando dependencias Python faltantes"
  "$PIPBIN" install --quiet --retries 5 --timeout 30 \
    --extra-index-url https://www.piwheels.org/simple \
    flask requests pyserial paho-mqtt >/dev/null 2>&1 || \
    log "pip falló (red inestable); se reintentará en la próxima ejecución"
fi


systemctl restart solarops.service
log "solarops.service reiniciado"
