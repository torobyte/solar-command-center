#!/usr/bin/env bash
# SolarOps auto-updater — descarga el agente directamente desde la nube
# (sin GitHub). Lanzado por systemd timer cada hora.
set -euo pipefail

CLOUD_URL="$(cat /etc/solarops/cloud_url 2>/dev/null || echo 'https://appsolar.torobyte.com')"
AGENT_URL="${CLOUD_URL}/api/public/agent/agent"
AGENT_DST="/opt/solarops/agent.py"

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

if ! curl -fsSL --max-time 60 "$AGENT_URL" -o "$TMP"; then
  echo "[update] no se pudo descargar $AGENT_URL"
  exit 0
fi

# Validación mínima
if ! head -n 5 "$TMP" | grep -q -E "^(#!.*python|from |import )"; then
  echo "[update] respuesta inválida desde $AGENT_URL"
  exit 0
fi

NEW_HASH=$(sha256sum "$TMP" | awk '{print $1}')
OLD_HASH=$(sha256sum "$AGENT_DST" 2>/dev/null | awk '{print $1}' || echo "none")

if [[ "$NEW_HASH" == "$OLD_HASH" ]]; then
  exit 0
fi

echo "[update] $OLD_HASH -> $NEW_HASH"
install -m 755 "$TMP" "$AGENT_DST"

# Refrescar deps Python por si cambiaron
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests pyserial paho-mqtt || true

systemctl restart solarops.service
echo "[update] solarops.service reiniciado"
