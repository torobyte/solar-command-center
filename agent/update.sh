#!/usr/bin/env bash
# SolarOps auto-updater — descarga el agente (y a sí mismo) directamente
# desde la nube. Ejecutado por el systemd timer cada hora.
set -euo pipefail

CLOUD_URL="$(cat /etc/solarops/cloud_url 2>/dev/null || echo 'https://appsolar.torobyte.com')"
AGENT_URL="${CLOUD_URL}/api/public/agent/agent"
UPDATER_URL="${CLOUD_URL}/api/public/agent/update"
AGENT_DST="/opt/solarops/agent.py"
UPDATER_DST="/opt/solarops/update.sh"
AP_SSID="${SOLAROPS_AP_SSID:-Solar Torobyte}"
AP_PASSWORD="${SOLAROPS_AP_PASSWORD:-solartorobyte123}"
AP_CONN_NAME="solarops-ap"

TMP_AGENT=$(mktemp)
TMP_UPDATER=$(mktemp)
trap 'rm -f "$TMP_AGENT" "$TMP_UPDATER"' EXIT

log() { echo "[update $(date -u +%H:%M:%S)] $*"; }

repair_bootstrap_ap() {
  command -v nmcli >/dev/null 2>&1 || return 0
  local wifi_iface
  wifi_iface=$(nmcli -t -f DEVICE,TYPE device 2>/dev/null | awk -F: '$2=="wifi"{print $1; exit}')
  [[ -n "$wifi_iface" ]] || return 0

  nmcli connection down "solar-torobyte-hotspot" >/dev/null 2>&1 || true
  nmcli connection delete "solar-torobyte-hotspot" >/dev/null 2>&1 || true
  nmcli connection delete "$AP_CONN_NAME" >/dev/null 2>&1 || true
  nmcli connection add type wifi ifname "$wifi_iface" con-name "$AP_CONN_NAME" autoconnect no ssid "$AP_SSID" >/dev/null 2>&1 || true
  nmcli connection modify "$AP_CONN_NAME" \
    802-11-wireless.mode ap 802-11-wireless.band bg \
    ipv4.method shared ipv6.method ignore \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$AP_PASSWORD" >/dev/null 2>&1 || true
}

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

if [[ "$NEW_HASH" != "$OLD_HASH" ]]; then
  log "$OLD_HASH -> $NEW_HASH"
  install -m 755 "$TMP_AGENT" "$AGENT_DST"
fi

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


repair_bootstrap_ap
systemctl restart solarops.service
systemctl restart solarops-ap.service >/dev/null 2>&1 || true
log "solarops.service reiniciado"
