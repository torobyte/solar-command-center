#!/usr/bin/env bash
# SolarOps agent installer for Raspberry Pi / Orange Pi (Debian/Ubuntu).
# Usage:
#   curl -fsSL https://your-domain/install.sh | sudo bash
#   curl -fsSL https://your-domain/install.sh | sudo bash -s -- --token <DEVICE_TOKEN>
set -euo pipefail

TOKEN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)."; exit 1
fi

echo "[1/5] Installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends python3 python3-pip python3-venv git curl >/dev/null

echo "[2/5] Creating /opt/solarops..."
install -d -m 755 /opt/solarops /etc/solarops /var/lib/solarops

if [[ ! -f /opt/solarops/agent.py ]]; then
  # Copy from current dir if running locally; otherwise expect packaged tarball.
  if [[ -f "$(dirname "$0")/agent.py" ]]; then
    cp "$(dirname "$0")/agent.py" /opt/solarops/agent.py
  else
    echo "agent.py not found alongside install.sh"; exit 1
  fi
fi

echo "[3/5] Installing Python dependencies..."
python3 -m venv /opt/solarops/venv
/opt/solarops/venv/bin/pip install --quiet flask requests

echo "[4/5] Adding udev rule for HID inverters..."
cat >/etc/udev/rules.d/99-solarops.rules <<'EOF'
# Voltronic / Axpert inverters
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0665", ATTRS{idProduct}=="5161", MODE="0660", GROUP="dialout"
KERNEL=="hidraw*", MODE="0660", GROUP="dialout"
EOF
udevadm control --reload-rules || true
udevadm trigger || true

if [[ -n "$TOKEN" ]]; then
  cat >/etc/solarops/config.json <<EOF
{"cloud_url":"https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app","device_token":"$TOKEN"}
EOF
fi

echo "[5/5] Installing systemd service..."
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

systemctl daemon-reload
systemctl enable --now solarops.service

IP=$(hostname -I | awk '{print $1}')
echo ""
echo "✅ SolarOps agent installed."
echo "   Local UI:  http://${IP}/"
echo "   Logs:      journalctl -u solarops -f"
