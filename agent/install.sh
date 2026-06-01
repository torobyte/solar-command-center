#!/usr/bin/env bash
# SolarOps — Instalador automático para Raspberry Pi y Orange Pi
# (Raspberry Pi OS, Debian, Ubuntu, Armbian).
#
# ┌─ INSTALACIÓN EN UNA LÍNEA ─────────────────────────────────────────────────┐
# │  curl -fsSL https://appsolar.torobyte.com/api/public/agent/install | sudo bash
# └────────────────────────────────────────────────────────────────────────────┘
#
# 100% desatendido: no usa GitHub, no pide usuario/contraseña, no requiere
# interacción. Descarga el agente directamente desde la nube de SolarOps
# (este mismo servidor) y lo deja corriendo como servicio systemd con
# auto-actualización horaria.
#
# Argumentos opcionales:
#   sudo bash -s -- [DEVICE_TOKEN]
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export APT_LISTCHANGES_FRONTEND=none

# ---------------------------------------------------------------------------
# CONFIGURACIÓN
# ---------------------------------------------------------------------------
CLOUD_URL="${SOLAROPS_CLOUD_URL:-https://appsolar.torobyte.com}"
AGENT_URL="${CLOUD_URL}/api/public/agent/agent"
UPDATE_URL="${CLOUD_URL}/api/public/agent/update"

DEVICE_TOKEN="${1:-}"

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
echo "▶ Servidor de actualización: $CLOUD_URL"

APT_OPTS=(-y -qq --no-install-recommends \
  -o Dpkg::Options::=--force-confdef \
  -o Dpkg::Options::=--force-confold)

echo "▶ [1/9] Instalando dependencias del sistema…"
apt-get update -qq
apt-get install "${APT_OPTS[@]}" \
  python3 python3-pip python3-venv curl ca-certificates jq sudo \
  network-manager wireless-tools iw rfkill mosquitto >/dev/null

# Habilitar broker MQTT local (puerto 1883) para integración con Home Assistant
mkdir -p /etc/mosquitto/conf.d
cat >/etc/mosquitto/conf.d/solarops.conf <<'MQTT'
listener 1883
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
MQTT
systemctl enable --now mosquitto >/dev/null 2>&1 || true

# Asegurar que NetworkManager gestione el WiFi (necesario para el modo AP de
# bootstrap y para la página /wifi del agente).
systemctl enable --now NetworkManager >/dev/null 2>&1 || true
systemctl disable --now dhcpcd >/dev/null 2>&1 || true
rfkill unblock wifi 2>/dev/null || true
# Asegurar que la radio WiFi esté ENCENDIDA tras la primera instalación
nmcli radio wifi on 2>/dev/null || true

echo "▶ [2/9] Descargando agente desde la nube…"
install -d -m 755 /opt/solarops /etc/solarops /var/lib/solarops

# Descarga atómica de agent.py
TMP_AGENT=$(mktemp)
if ! curl -fsSL --max-time 60 "$AGENT_URL" -o "$TMP_AGENT"; then
  echo "❌ No se pudo descargar el agente desde $AGENT_URL"
  rm -f "$TMP_AGENT"
  exit 1
fi
# Validación mínima: el archivo debe parecer Python
if ! head -n 5 "$TMP_AGENT" | grep -q -E "^(#!.*python|from |import )"; then
  echo "❌ El archivo descargado no parece ser el agente Python."
  rm -f "$TMP_AGENT"
  exit 1
fi
install -m 755 "$TMP_AGENT" /opt/solarops/agent.py
rm -f "$TMP_AGENT"

# Descarga del auto-updater
TMP_UPD=$(mktemp)
if curl -fsSL --max-time 30 "$UPDATE_URL" -o "$TMP_UPD"; then
  install -m 755 "$TMP_UPD" /opt/solarops/update.sh
fi
rm -f "$TMP_UPD"

# Guardar URL de actualización para que update.sh la use
echo "$CLOUD_URL" > /etc/solarops/cloud_url

echo "▶ [3/9] Instalando dependencias Python…"
python3 -m venv /opt/solarops/venv
/opt/solarops/venv/bin/pip install --quiet --upgrade pip wheel
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests pyserial paho-mqtt

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

setcap 'cap_net_bind_service=+ep' "$(readlink -f /opt/solarops/venv/bin/python3)" 2>/dev/null || true

# ---------------------------------------------------------------------------
# [5/9] CONFIG INICIAL — sin auto-registro: el agente pedirá un código de
# vinculación de 6 caracteres y lo mostrará en pantalla. El usuario lo
# escribe en "Agregar sitio" del portal cloud para asociar este equipo a
# su cuenta. NO se asigna automáticamente a ningún superadmin.
# ---------------------------------------------------------------------------
echo "▶ [5/9] Generando configuración inicial (modo pairing)…"
HARDWARE_ID=$(cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null || hostname)
HOSTNAME_SAFE=$(hostname)

# Si pasaron un DEVICE_TOKEN explícito por argumento, lo respetamos
# (ej. para reinstalación de un equipo previamente vinculado).
if [[ -n "$DEVICE_TOKEN" ]]; then
  cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":"$DEVICE_TOKEN","hardware_id":"$HARDWARE_ID","board":"$BOARD"}
EOF
  echo "   ✓ Token explícito guardado — vinculación previa preservada."
elif [[ -f /etc/solarops/config.json ]] && [[ -n "$(jq -r '.device_token // empty' /etc/solarops/config.json 2>/dev/null)" ]]; then
  echo "   ✓ Configuración existente preservada."
else
  cat >/etc/solarops/config.json <<EOF
{"cloud_url":"$CLOUD_URL","device_token":null,"hardware_id":"$HARDWARE_ID","board":"$BOARD"}
EOF
  echo "   ✓ Sin vinculación: el agente mostrará un código de 6 caracteres en pantalla."
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
Description=SolarOps auto-update (cloud-hosted)
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
# [6.5/9] AP DE BOOTSTRAP — WiFi propio "Solar Torobyte" cuando no hay internet
# ---------------------------------------------------------------------------
echo "▶ [6.5/9] Configurando modo AP de bootstrap (WiFi de configuración)…"

AP_SSID="${SOLAROPS_AP_SSID:-Solar Torobyte}"
AP_PASSWORD="${SOLAROPS_AP_PASSWORD:-solartorobyte123}"
AP_CONN_NAME="solarops-ap"

if command -v nmcli >/dev/null 2>&1; then
  WIFI_IFACE=$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')
  if [[ -n "$WIFI_IFACE" ]]; then
    nmcli connection down "solar-torobyte-hotspot" >/dev/null 2>&1 || true
    nmcli connection delete "solar-torobyte-hotspot" >/dev/null 2>&1 || true
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

install -d -m 755 /etc/NetworkManager/dnsmasq-shared.d
cat >/etc/NetworkManager/dnsmasq-shared.d/solarops-captive.conf <<'EOF'
address=/#/10.42.0.1
local-ttl=2
EOF

cat >/opt/solarops/ap-watchdog.sh <<EOF
#!/usr/bin/env bash
set -u
AP_CONN_NAME="${AP_CONN_NAME}"
GRACE_BOOT=60
COOLDOWN=20
sleep "\$GRACE_BOOT"
last_change=0
while true; do
  now=\$(date +%s)
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
# [7/9] MODO KIOSKO (Chromium pantalla completa)
# ---------------------------------------------------------------------------
echo "▶ [7/9] Instalando modo kiosko (Chromium → http://localhost)…"
apt-get install "${APT_OPTS[@]}" \
  xserver-xorg xinit openbox unclutter chromium-browser >/dev/null 2>&1 || \
apt-get install "${APT_OPTS[@]}" \
  xserver-xorg xinit openbox unclutter chromium >/dev/null 2>&1 || \
echo "   ⚠ No se pudo instalar Chromium (placa sin GUI). El kiosko se omite."

CHROMIUM_BIN="$(command -v chromium-browser || command -v chromium || true)"

if ! id -u solarkiosk &>/dev/null; then
  useradd -m -s /bin/bash solarkiosk
fi
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
echo "   🔄 Auto-update:      cada hora desde ${CLOUD_URL}/api/public/agent/agent"
echo "   📶 AP de bootstrap:  SSID=${AP_SSID:-Solar Torobyte}  contraseña=${AP_PASSWORD:-solartorobyte123}"
echo "   🆔 hardware_id:      ${HARDWARE_ID}"
echo "   🧩 Placa:            ${BOARD}"
if [[ -n "${DEVICE_TOKEN:-}" ]]; then
  echo "   🎁 Token explícito vinculado en este install."
else
  echo "   🔗 Vinculación: abre la pantalla del equipo y escribe el código de 6 caracteres en 'Agregar sitio' del portal."
fi
