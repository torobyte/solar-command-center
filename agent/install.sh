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

REPO_URL="$REPO_HTTPS"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  REPO_URL="${REPO_HTTPS/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"
fi

echo "▶ [1/8] Instalando dependencias del sistema…"
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-pip python3-venv git curl ca-certificates jq >/dev/null

echo "▶ [2/8] Descargando código (rama: $BRANCH)…"
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

echo "▶ [3/8] Instalando dependencias Python…"
python3 -m venv /opt/solarops/venv
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests

echo "▶ [4/8] Configurando permisos USB del inversor…"
cat >/etc/udev/rules.d/99-solarops.rules <<'EOF'
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0665", ATTRS{idProduct}=="5161", MODE="0660", GROUP="dialout"
KERNEL=="hidraw*", MODE="0660", GROUP="dialout"
EOF
udevadm control --reload-rules || true
udevadm trigger || true

# ---------------------------------------------------------------------------
# [5/8] AUTO-REGISTRO (licencia trial 30 días automática)
# ---------------------------------------------------------------------------
echo "▶ [5/8] Registrando este equipo en la nube (trial 30 días)…"
HARDWARE_ID=$(cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null || hostname)
HOSTNAME_SAFE=$(hostname)

if [[ -z "$DEVICE_TOKEN" ]] && [[ ! -f /etc/solarops/config.json || -z "$(jq -r '.device_token // empty' /etc/solarops/config.json 2>/dev/null)" ]]; then
  REG_RESPONSE=$(curl -fsSL -X POST \
    -H "Content-Type: application/json" \
    -d "{\"hardware_id\":\"${HARDWARE_ID}\",\"site_name\":\"${HOSTNAME_SAFE}\"}" \
    "${CLOUD_URL}/api/public/register" || echo '{}')
  REG_TOKEN=$(echo "$REG_RESPONSE" | jq -r '.device_token // empty')
  REG_SITE=$(echo "$REG_RESPONSE" | jq -r '.site_id // empty')
  if [[ -n "$REG_TOKEN" ]]; then
    DEVICE_TOKEN="$REG_TOKEN"
    echo "   ✓ Trial activado · site_id=${REG_SITE}"
  else
    echo "   ⚠ No se pudo registrar automáticamente, se podrá activar manualmente."
  fi
fi

# Pre-seed config (cloud_url + token)
if [[ -n "$DEVICE_TOKEN" ]]; then
  cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":"$DEVICE_TOKEN","hardware_id":"$HARDWARE_ID"}
EOF
else
  [[ -f /etc/solarops/config.json ]] || cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":null,"hardware_id":"$HARDWARE_ID"}
EOF
fi

echo "▶ [6/8] Registrando servicio systemd del agente…"
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

# ---------------------------------------------------------------------------
# [7/8] MODO KIOSKO (Chromium pantalla completa con la web de la plataforma)
# ---------------------------------------------------------------------------
echo "▶ [7/8] Instalando modo kiosko (Chromium → plataforma web)…"
apt-get install -y --no-install-recommends \
  xserver-xorg xinit openbox chromium-browser unclutter >/dev/null 2>&1 || \
apt-get install -y --no-install-recommends \
  xserver-xorg xinit openbox chromium unclutter >/dev/null 2>&1 || true

CHROMIUM_BIN=$(command -v chromium-browser || command -v chromium || echo "")

# Usuario de kiosko sin privilegios.
id -u solarkiosk &>/dev/null || useradd -m -s /bin/bash solarkiosk
usermod -aG dialout,video,tty solarkiosk || true

install -d -m 755 /home/solarkiosk/.config/openbox
cat >/home/solarkiosk/.xinitrc <<EOF
#!/usr/bin/env bash
xset -dpms
xset s off
xset s noblank
unclutter -idle 0.1 -root &
openbox-session &
exec ${CHROMIUM_BIN:-chromium-browser} \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-translate \\
  --no-first-run \\
  --start-maximized \\
  --check-for-update-interval=31536000 \\
  --app="${CLOUD_URL}/app"
EOF
chmod +x /home/solarkiosk/.xinitrc
chown -R solarkiosk:solarkiosk /home/solarkiosk

cat >/etc/systemd/system/solarops-kiosk.service <<'EOF'
[Unit]
Description=SolarOps Kiosk (Chromium fullscreen → cloud dashboard)
After=systemd-user-sessions.service network-online.target solarops.service
Wants=network-online.target

[Service]
User=solarkiosk
Group=solarkiosk
PAMName=login
TTYPath=/dev/tty7
Environment=XDG_RUNTIME_DIR=/run/user/1001
ExecStart=/usr/bin/xinit /home/solarkiosk/.xinitrc -- :0 vt7 -nolisten tcp
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now solarops.service >/dev/null 2>&1
systemctl enable --now solarops-update.timer >/dev/null 2>&1
if [[ -n "$CHROMIUM_BIN" ]]; then
  systemctl enable solarops-kiosk.service >/dev/null 2>&1
  # Solo arranca el kiosko ahora si hay pantalla; si no, arrancará en el próximo boot.
  systemctl start solarops-kiosk.service >/dev/null 2>&1 || true
fi

echo "▶ [8/8] Listo."

IP=$(hostname -I | awk '{print $1}')
echo ""
echo "✅ SolarOps instalado correctamente."
echo "   🌐 Dashboard nube:   ${CLOUD_URL}/app"
echo "   🖥️  Kiosko local:     systemctl status solarops-kiosk"
echo "   📜 Logs agente:      journalctl -u solarops -f"
echo "   🔄 Auto-update:      cada hora (systemctl list-timers solarops-update)"
echo "   🆔 hardware_id:      ${HARDWARE_ID}"
if [[ -n "${DEVICE_TOKEN:-}" ]]; then
  echo "   🎁 Plan inicial:     TRIAL 30 días (visible ya en el panel de licencias)"
  echo "   👉 Para pasar a PRO: introduce tu código de licencia en el panel web."
else
  echo "   👉 Abre la UI local http://${IP}/ y pega tu código de licencia."
fi
