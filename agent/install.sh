#!/usr/bin/env bash
# SolarOps agent installer for Raspberry Pi / Orange Pi (Debian/Ubuntu).
#
# Usage:
#   curl -fsSL https://YOUR_DOMAIN/install.sh | sudo bash -s -- \
#       --repo git@github.com:USER/REPO.git [--token <DEVICE_TOKEN>]
#
#   # or with HTTPS + Personal Access Token for a private repo:
#   curl -fsSL https://YOUR_DOMAIN/install.sh | sudo bash -s -- \
#       --repo https://USER:GHP_TOKEN@github.com/USER/REPO.git
set -euo pipefail

REPO=""
TOKEN=""
BRANCH="main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)   REPO="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;;
    --token)  TOKEN="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)."; exit 1; fi
if [[ -z "$REPO" ]]; then echo "Missing --repo <git-url>"; exit 1; fi

echo "[1/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-pip python3-venv git curl ca-certificates openssh-client >/dev/null

echo "[2/6] Cloning/updating repository..."
install -d -m 755 /opt/solarops /etc/solarops /var/lib/solarops
REPO_DIR="/opt/solarops/repo"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch --quiet origin
  git -C "$REPO_DIR" reset --hard --quiet "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$REPO_DIR"
fi
install -m 755 "$REPO_DIR/agent/agent.py" /opt/solarops/agent.py
install -m 755 "$REPO_DIR/agent/update.sh" /opt/solarops/update.sh

echo "[3/6] Installing Python dependencies..."
python3 -m venv /opt/solarops/venv
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests

echo "[4/6] Adding udev rule for HID inverters..."
cat >/etc/udev/rules.d/99-solarops.rules <<'EOF'
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

echo "[5/6] Installing systemd service..."
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

echo "[6/6] Installing auto-update timer (every hour)..."
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
systemctl enable --now solarops.service
systemctl enable --now solarops-update.timer

IP=$(hostname -I | awk '{print $1}')
echo ""
echo "✅ SolarOps agent installed."
echo "   Local UI:    http://${IP}/"
echo "   Logs:        journalctl -u solarops -f"
echo "   Auto-update: systemctl list-timers solarops-update.timer"
