#!/usr/bin/env bash
# SolarOps agent installer for Raspberry Pi / Orange Pi (Debian/Ubuntu).
#
# ┌─ INSTALACIÓN EN UNA LÍNEA ────────────────────────────────────────────────┐
# │  curl -fsSL https://raw.githubusercontent.com/torobyte/solar-command-center/main/agent/install.sh | sudo bash
# └───────────────────────────────────────────────────────────────────────────┘
#
# Argumentos opcionales (posicionales, en este orden):
#   sudo bash -s -- [DEVICE_TOKEN] [BRANCH]
#
# Para repos privados, pasa un Personal Access Token de GitHub:
#   GITHUB_TOKEN=ghp_xxx curl -fsSL .../install.sh | sudo -E bash
set -euo pipefail

# ---------------------------------------------------------------------------
# CONFIGURACIÓN
# ---------------------------------------------------------------------------
REPO_HTTPS="https://github.com/torobyte/solar-command-center.git"
BRANCH_DEFAULT="main"
CLOUD_URL="https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"

DEVICE_TOKEN="${1:-}"
BRANCH="${2:-$BRANCH_DEFAULT}"

if [[ $EUID -ne 0 ]]; then echo "❌ Ejecuta con sudo."; exit 1; fi

# Si el repo es privado, usa GITHUB_TOKEN del entorno.
REPO_URL="$REPO_HTTPS"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  REPO_URL="${REPO_HTTPS/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"
fi

echo "▶ [1/6] Instalando dependencias del sistema…"
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-pip python3-venv git curl ca-certificates >/dev/null

echo "▶ [2/6] Descargando código (rama: $BRANCH)…"
install -d -m 755 /opt/solarops /etc/solarops /var/lib/solarops
REPO_DIR="/opt/solarops/repo"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
  git -C "$REPO_DIR" fetch --quiet origin
  git -C "$REPO_DIR" reset --hard --quiet "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi
install -m 755 "$REPO_DIR/agent/agent.py"  /opt/solarops/agent.py
install -m 755 "$REPO_DIR/agent/update.sh" /opt/solarops/update.sh

echo "▶ [3/6] Instalando dependencias Python…"
python3 -m venv /opt/solarops/venv
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests

echo "▶ [4/6] Configurando permisos USB del inversor…"
cat >/etc/udev/rules.d/99-solarops.rules <<'EOF'
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0665", ATTRS{idProduct}=="5161", MODE="0660", GROUP="dialout"
KERNEL=="hidraw*", MODE="0660", GROUP="dialout"
EOF
udevadm control --reload-rules || true
udevadm trigger || true

# Pre-seed config (cloud_url + token opcional)
if [[ -n "$DEVICE_TOKEN" ]]; then
  cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":"$DEVICE_TOKEN"}
EOF
else
  [[ -f /etc/solarops/config.json ]] || cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":null}
EOF
fi

echo "▶ [5/6] Registrando servicio systemd…"
cat >/etc/systemd/system/solarops.service <<'EOF'
[Unit]
Description=SolarOps local agent
After=network.target

[Service]
Type=simple
ExecStart=/opt/solarops/venv/bin/python /opt/solarops/agent.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

echo "▶ [6/6] Activando auto-update horario…"
cat >/etc/systemd/system/solarops-update.service <<'EOF'
[Unit]
Description=SolarOps auto-update (git pull)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/solarops/update.sh
EOF

cat >/etc/systemd/system/solarops-update.timer <<'EOF'
[Unit]
Description=Run SolarOps updater hourly

[Timer]
OnBootSec=2min
OnUnitActiveSec=1h
RandomizedDelaySec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now solarops.service >/dev/null 2>&1
systemctl enable --now solarops-update.timer >/dev/null 2>&1

IP=$(hostname -I | awk '{print $1}')
echo ""
echo "✅ SolarOps instalado correctamente."
echo "   🌐 UI local:    http://${IP}/"
echo "   📜 Logs:        journalctl -u solarops -f"
echo "   🔄 Auto-update: cada hora (systemctl list-timers solarops-update)"
[[ -z "$DEVICE_TOKEN" ]] && echo "   👉 Abre la UI local y pega tu código de licencia para activarlo."
