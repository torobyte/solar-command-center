#!/usr/bin/env bash
# SolarOps — Instalador automático para Raspberry Pi y Orange Pi
# (Raspberry Pi OS, Debian, Ubuntu, Armbian).
#
# ┌─ INSTALACIÓN EN UNA LÍNEA ────────────────────────────────────────────────┐
# │  curl -fsSL https://raw.githubusercontent.com/torobyte/solar-command-center/main/agent/install.sh | sudo bash
# └───────────────────────────────────────────────────────────────────────────┘
#
# 100% desatendido: no pregunta usuario/contraseña, no requiere interacción.
# Al terminar, la plataforma queda accesible localmente en http://<ip>/ y se
# inicia automáticamente en pantalla completa (modo kiosko) si hay monitor.
#
# Argumentos opcionales:
#   sudo bash -s -- [DEVICE_TOKEN] [BRANCH]
#
# Para repos privados:
#   GITHUB_TOKEN=ghp_xxx curl -fsSL .../install.sh | sudo -E bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export APT_LISTCHANGES_FRONTEND=none

# ---------------------------------------------------------------------------
# CONFIGURACIÓN
# ---------------------------------------------------------------------------
REPO_HTTPS="https://github.com/torobyte/solar-command-center.git"
BRANCH_DEFAULT="main"
CLOUD_URL="https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"

DEVICE_TOKEN="${1:-}"
BRANCH="${2:-$BRANCH_DEFAULT}"

if [[ $EUID -ne 0 ]]; then echo "❌ Ejecuta con sudo."; exit 1; fi

# Detección de placa (Raspberry Pi / Orange Pi / genérico)
BOARD="generic"
if [[ -f /proc/device-tree/model ]]; then
  MODEL=$(tr -d '\0' </proc/device-tree/model)
  case "$MODEL" in
    *Raspberry*)  BOARD="raspberry-pi" ;;
    *Orange*Pi*)  BOARD="orange-pi" ;;
    *)            BOARD="$(echo "$MODEL" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')" ;;
  esac
fi
echo "▶ Placa detectada: $BOARD"

REPO_URL="$REPO_HTTPS"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  REPO_URL="${REPO_HTTPS/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"
fi

APT_OPTS=(-y -qq --no-install-recommends \
  -o Dpkg::Options::=--force-confdef \
  -o Dpkg::Options::=--force-confold)

echo "▶ [1/9] Instalando dependencias del sistema…"
apt-get update -qq
apt-get install "${APT_OPTS[@]}" \
  python3 python3-pip python3-venv git curl ca-certificates jq sudo \
  network-manager wireless-tools iw rfkill mosquitto >/dev/null

# Habilitar broker MQTT local (puerto 1883) para integración con Home Assistant u otras apps
mkdir -p /etc/mosquitto/conf.d
cat >/etc/mosquitto/conf.d/solarops.conf <<'MQTT'
listener 1883
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
MQTT
systemctl enable --now mosquitto >/dev/null 2>&1 || true

# Asegurar que NetworkManager gestione el WiFi (necesario para el modo AP de
# bootstrap y para la página /wifi del agente). En Raspberry Pi OS Bookworm+
# ya viene por defecto; en Bullseye y derivados conviene forzarlo.
systemctl enable --now NetworkManager >/dev/null 2>&1 || true
# Desactivar dhcpcd si está pisando a NM (típico en Pi OS Bullseye)
systemctl disable --now dhcpcd >/dev/null 2>&1 || true
rfkill unblock wifi 2>/dev/null || true

echo "▶ [2/9] Descargando código (rama: $BRANCH)…"
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

echo "▶ [3/9] Instalando dependencias Python…"
python3 -m venv /opt/solarops/venv
/opt/solarops/venv/bin/pip install --quiet --upgrade pip wheel
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests pyserial

echo "▶ [4/9] Configurando permisos USB/RS485 del inversor…"
cat >/etc/udev/rules.d/99-solarops.rules <<'EOF'
# Voltronic / Axpert HID
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0665", ATTRS{idProduct}=="5161", MODE="0660", GROUP="dialout"
KERNEL=="hidraw*", MODE="0660", GROUP="dialout"
# Adaptadores USB-Serie / RS485 (CH340, FTDI, CP210x, PL2303)
KERNEL=="ttyUSB*", MODE="0660", GROUP="dialout"
KERNEL=="ttyACM*", MODE="0660", GROUP="dialout"
EOF
udevadm control --reload-rules || true
udevadm trigger || true

# Permitir que el agente escuche en el puerto 80 sin ser root estrictamente
# (el servicio corre como root igualmente, pero esto evita sorpresas).
setcap 'cap_net_bind_service=+ep' "$(readlink -f /opt/solarops/venv/bin/python3)" 2>/dev/null || true

# ---------------------------------------------------------------------------
# [5/9] AUTO-REGISTRO (licencia trial 30 días automática, sin user/password)
# ---------------------------------------------------------------------------
echo "▶ [5/9] Registrando este equipo en la nube (trial 30 días)…"
HARDWARE_ID=$(cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null || hostname)
HOSTNAME_SAFE=$(hostname)

if [[ -z "$DEVICE_TOKEN" ]] && [[ ! -f /etc/solarops/config.json || -z "$(jq -r '.device_token // empty' /etc/solarops/config.json 2>/dev/null)" ]]; then
  REG_RESPONSE=$(curl -fsSL --max-time 15 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"hardware_id\":\"${HARDWARE_ID}\",\"site_name\":\"${HOSTNAME_SAFE}\",\"board\":\"${BOARD}\"}" \
    "${CLOUD_URL}/api/public/register" 2>/dev/null || echo '{}')
  REG_TOKEN=$(echo "$REG_RESPONSE" | jq -r '.device_token // empty')
  REG_SITE=$(echo "$REG_RESPONSE" | jq -r '.site_id // empty')
  if [[ -n "$REG_TOKEN" ]]; then
    DEVICE_TOKEN="$REG_TOKEN"
    echo "   ✓ Trial activado · site_id=${REG_SITE}"
  else
    echo "   ⚠ Sin conexión a la nube. El agente arrancará igual en modo local."
  fi
fi

if [[ -n "$DEVICE_TOKEN" ]]; then
  cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":"$DEVICE_TOKEN","hardware_id":"$HARDWARE_ID","board":"$BOARD"}
EOF
else
  [[ -f /etc/solarops/config.json ]] || cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":null,"hardware_id":"$HARDWARE_ID","board":"$BOARD"}
EOF
fi
chmod 644 /etc/solarops/config.json

echo "▶ [6/9] Registrando servicio systemd del agente…"
cat >/etc/systemd/system/solarops.service <<'EOF'
[Unit]
Description=SolarOps local agent (web UI + cloud sync)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=SOLAROPS_PORT=80
ExecStart=/opt/solarops/venv/bin/python /opt/solarops/agent.py
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

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
# [6.5/9] AP DE BOOTSTRAP — si el dispositivo no tiene internet, levanta una
# red WiFi propia ("SolarOps-Setup") para que el usuario se conecte desde su
# móvil y configure el WiFi real desde http://10.42.0.1/wifi (estilo Solar
# Assistant). Cuando hay internet, el AP se apaga solo.
# ---------------------------------------------------------------------------
echo "▶ [6.5/9] Configurando modo AP de bootstrap (WiFi de configuración)…"

AP_SSID="${SOLAROPS_AP_SSID:-SolarOps-Setup}"
AP_PASSWORD="${SOLAROPS_AP_PASSWORD:-solarops1234}"   # mínimo 8 caracteres (WPA2)
AP_CONN_NAME="solarops-ap"

# Pre-crear el perfil de hotspot en NetworkManager (no lo activamos aún —
# eso lo decide el watchdog según haya o no internet).
if command -v nmcli >/dev/null 2>&1; then
  WIFI_IFACE=$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')
  if [[ -n "$WIFI_IFACE" ]]; then
    nmcli connection delete "$AP_CONN_NAME" >/dev/null 2>&1 || true
    nmcli connection add type wifi ifname "$WIFI_IFACE" con-name "$AP_CONN_NAME" \
      autoconnect no ssid "$AP_SSID" >/dev/null 2>&1 || true
    nmcli connection modify "$AP_CONN_NAME" \
      802-11-wireless.mode ap 802-11-wireless.band bg \
      ipv4.method shared ipv6.method ignore \
      wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$AP_PASSWORD" >/dev/null 2>&1 || true
    echo "   ✓ Perfil AP listo (SSID=${AP_SSID}, contraseña=${AP_PASSWORD})"
  else
    echo "   ⚠ Sin interfaz WiFi detectada — modo AP no disponible."
  fi
else
  echo "   ⚠ nmcli no está disponible — modo AP no disponible."
fi

# DNS hijack: en modo AP (NetworkManager "shared"), redirigir TODAS las
# consultas DNS a 10.42.0.1 → así cualquier URL en el navegador del cliente
# (Android/iOS/Win) cae en nuestro captive portal y abre /wifi.
install -d -m 755 /etc/NetworkManager/dnsmasq-shared.d
cat >/etc/NetworkManager/dnsmasq-shared.d/solarops-captive.conf <<'EOF'
# SolarOps captive portal — resuelve cualquier dominio al gateway del AP
address=/#/10.42.0.1
# TTL corto para que el cliente se "despegue" rápido cuando vuelva el WiFi real
local-ttl=2
EOF

# Watchdog: cada 30 s, si no hay internet y no hay AP activo → activa AP.
# Si hay internet → desactiva AP. Esto da el comportamiento "auto-bootstrap"
# de Solar Assistant: el dispositivo siempre es accesible, sea por WiFi del
# cliente o por su propio AP.
cat >/opt/solarops/ap-watchdog.sh <<EOF
#!/usr/bin/env bash
# SolarOps AP-bootstrap watchdog
set -u
AP_CONN_NAME="${AP_CONN_NAME}"
GRACE_BOOT=60   # esperar a que NM termine de intentar conectar al WiFi guardado
COOLDOWN=20     # segundos entre transiciones
sleep "\$GRACE_BOOT"
last_change=0
while true; do
  now=\$(date +%s)
  # ¿Hay internet?
  if timeout 3 bash -c 'echo > /dev/tcp/1.1.1.1/53' 2>/dev/null; then
    online=1
  else
    online=0
  fi
  ap_active=\$(nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fx "\$AP_CONN_NAME" >/dev/null && echo 1 || echo 0)
  if [[ "\$online" == "1" && "\$ap_active" == "1" ]]; then
    if (( now - last_change > COOLDOWN )); then
      logger -t solarops-ap "Internet OK — apagando AP \$AP_CONN_NAME"
      nmcli connection down "\$AP_CONN_NAME" >/dev/null 2>&1 || true
      last_change=\$now
    fi
  elif [[ "\$online" == "0" && "\$ap_active" == "0" ]]; then
    if (( now - last_change > COOLDOWN )); then
      logger -t solarops-ap "Sin internet — levantando AP \$AP_CONN_NAME"
      nmcli connection up "\$AP_CONN_NAME" >/dev/null 2>&1 || true
      last_change=\$now
    fi
  fi
  sleep 30
done
EOF
chmod +x /opt/solarops/ap-watchdog.sh

cat >/etc/systemd/system/solarops-ap.service <<'EOF'
[Unit]
Description=SolarOps AP-bootstrap watchdog (auto WiFi setup)
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=simple
ExecStart=/opt/solarops/ap-watchdog.sh
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF

# ---------------------------------------------------------------------------
# [7/9] MODO KIOSKO (Chromium pantalla completa con la plataforma local)
# ---------------------------------------------------------------------------
echo "▶ [7/9] Instalando modo kiosko (Chromium → http://localhost)…"
apt-get install "${APT_OPTS[@]}" \
  xserver-xorg xinit openbox unclutter chromium-browser >/dev/null 2>&1 || \
apt-get install "${APT_OPTS[@]}" \
  xserver-xorg xinit openbox unclutter chromium >/dev/null 2>&1 || \
echo "   ⚠ No se pudo instalar Chromium (placa sin GUI). El kiosko se omite."

CHROMIUM_BIN="$(command -v chromium-browser || command -v chromium || true)"

# Usuario de kiosko sin privilegios y SIN contraseña
if ! id -u solarkiosk &>/dev/null; then
  useradd -m -s /bin/bash solarkiosk
fi
# Cuenta sin contraseña — login automático en TTY
passwd -d solarkiosk >/dev/null 2>&1 || true
usermod -aG dialout,video,tty,input solarkiosk 2>/dev/null || true

install -d -m 755 /home/solarkiosk/.config/openbox
KIOSK_URL="http://localhost/"

cat >/home/solarkiosk/.xinitrc <<EOF
#!/usr/bin/env bash
xset -dpms
xset s off
xset s noblank
unclutter -idle 0.1 -root &
openbox-session &
# Espera a que el agente local responda antes de abrir Chromium
for i in \$(seq 1 30); do
  curl -sf http://localhost/ >/dev/null && break || sleep 2
done
exec ${CHROMIUM_BIN:-chromium-browser} \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-translate \\
  --no-first-run \\
  --start-maximized \\
  --check-for-update-interval=31536000 \\
  --password-store=basic \\
  --app="${KIOSK_URL}"
EOF
chmod +x /home/solarkiosk/.xinitrc
chown -R solarkiosk:solarkiosk /home/solarkiosk

if [[ -n "$CHROMIUM_BIN" ]]; then
  cat >/etc/systemd/system/solarops-kiosk.service <<EOF
[Unit]
Description=SolarOps Kiosk (Chromium fullscreen → local platform)
After=systemd-user-sessions.service network-online.target solarops.service
Wants=network-online.target solarops.service

[Service]
User=solarkiosk
Group=solarkiosk
PAMName=login
TTYPath=/dev/tty7
StandardInput=tty
Environment=XDG_RUNTIME_DIR=/run/user/1001
ExecStart=/usr/bin/xinit /home/solarkiosk/.xinitrc -- :0 vt7 -nolisten tcp
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # Autologin del usuario solarkiosk en tty1 (sin pedir password)
  install -d -m 755 /etc/systemd/system/getty@tty1.service.d
  cat >/etc/systemd/system/getty@tty1.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin solarkiosk --noclear %I $TERM
EOF
fi

echo "▶ [8/9] Habilitando servicios en el arranque…"
systemctl daemon-reload
systemctl enable --now solarops.service >/dev/null 2>&1
systemctl enable --now solarops-update.timer >/dev/null 2>&1
systemctl enable --now solarops-ap.service >/dev/null 2>&1 || true
if [[ -n "$CHROMIUM_BIN" ]]; then
  systemctl enable solarops-kiosk.service >/dev/null 2>&1
  systemctl start  solarops-kiosk.service >/dev/null 2>&1 || true
fi

# Espera corta para confirmar que el agente responde
echo "▶ [9/9] Verificando que la plataforma local responde…"
OK="no"
for i in $(seq 1 20); do
  if curl -sf http://localhost/ >/dev/null 2>&1; then OK="yes"; break; fi
  sleep 1
done

IP=$(hostname -I | awk '{print $1}')
echo ""
if [[ "$OK" == "yes" ]]; then
  echo "✅ SolarOps instalado y FUNCIONANDO."
else
  echo "⚠ SolarOps instalado, pero el agente aún no responde. Revisa: journalctl -u solarops -f"
fi
echo "   🌐 Plataforma local: http://${IP}/   (también http://localhost/)"
echo "   ☁  Dashboard nube:   ${CLOUD_URL}/app"
echo "   🖥  Kiosko:           systemctl status solarops-kiosk"
echo "   📜 Logs agente:      journalctl -u solarops -f"
echo "   🔄 Auto-update:      cada hora (systemctl list-timers solarops-update)"
echo "   📶 AP de bootstrap:  SSID=${AP_SSID:-SolarOps-Setup}  contraseña=${AP_PASSWORD:-solarops1234}"
echo "                        (se activa solo cuando el dispositivo no tiene internet)"
echo "                        Conéctate y abre http://10.42.0.1/wifi para configurar el WiFi real"
echo "   🆔 hardware_id:      ${HARDWARE_ID}"
echo "   🧩 Placa:            ${BOARD}"
if [[ -n "${DEVICE_TOKEN:-}" ]]; then
  echo "   🎁 Plan inicial:     TRIAL 30 días activado automáticamente"
fi
