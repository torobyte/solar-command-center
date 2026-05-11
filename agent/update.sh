#!/usr/bin/env bash
# SolarOps auto-updater. Run by systemd timer every hour.
# Pulls the latest code from GitHub and restarts the agent if anything changed.
set -euo pipefail

REPO_DIR="/opt/solarops/repo"
AGENT_DST="/opt/solarops/agent.py"

cd "$REPO_DIR"

BEFORE=$(git rev-parse HEAD)
git fetch --quiet origin
git reset --hard --quiet origin/HEAD
AFTER=$(git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  exit 0
fi

echo "[update] $BEFORE -> $AFTER"

# Sync agent file
install -m 755 "$REPO_DIR/agent/agent.py" "$AGENT_DST"

# Refresh Python deps in case requirements changed
/opt/solarops/venv/bin/pip install --quiet --upgrade flask requests || true

systemctl restart solarops.service
echo "[update] restarted solarops.service"
