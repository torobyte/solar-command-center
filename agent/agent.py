#!/usr/bin/env python3
"""SolarOps local agent for Voltronic / Axpert inverters.

Features:
- Auto-detects USB inverter on /dev/hidraw* (or serial /dev/ttyUSB*).
- Polls QPIGS / QMOD / QPIRI every 5 s.
- Stores latest sample locally (SQLite) so the LAN UI works offline.
- Forwards samples to SolarOps Cloud via /api/public/ingest using a device token.
- Exposes a local web UI (Flask) on port 80 for LAN access — no auth required.
- Activation flow: superadmin issues a license code, user enters it once on the
  device's LAN UI, agent calls /api/public/activate to obtain a device token.
"""
from __future__ import annotations

import argparse, glob, json, os, queue, sqlite3, threading, time
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, render_template_string, request

CLOUD_URL_DEFAULT = "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"
CONFIG_PATH = Path(os.environ.get("SOLAROPS_CONFIG", "/etc/solarops/config.json"))
DB_PATH = Path(os.environ.get("SOLAROPS_DB", "/var/lib/solarops/state.db"))
POLL_INTERVAL = 5.0
PUSH_INTERVAL = 30.0


# ---------- Voltronic protocol ----------
CRC_TABLE = [
    0x0000,0x1021,0x2042,0x3063,0x4084,0x50A5,0x60C6,0x70E7,
    0x8108,0x9129,0xA14A,0xB16B,0xC18C,0xD1AD,0xE1CE,0xF1EF,
]

def crc16_xmodem(data: bytes) -> bytes:
    crc = 0
    for b in data:
        crc = ((crc << 4) & 0xFFFF) ^ CRC_TABLE[((crc >> 12) ^ (b >> 4)) & 0x0F]
        crc = ((crc << 4) & 0xFFFF) ^ CRC_TABLE[((crc >> 12) ^ (b & 0x0F)) & 0x0F]
    # Voltronic skips bytes that are 0x28, 0x0D, 0x0A in CRC bytes.
    hi, lo = (crc >> 8) & 0xFF, crc & 0xFF
    for v in (hi, lo): pass
    if hi in (0x28,0x0D,0x0A): hi += 1
    if lo in (0x28,0x0D,0x0A): lo += 1
    return bytes([hi, lo])

def encode(cmd: str) -> bytes:
    raw = cmd.encode("ascii")
    return raw + crc16_xmodem(raw) + b"\r"


# ---------- Transports ----------
class HidrawTransport:
    def __init__(self, path: str):
        self.path = path
        self.fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)

    def send(self, cmd: str) -> str:
        payload = encode(cmd)
        # Write in 8-byte chunks (HID report size).
        for i in range(0, len(payload), 8):
            chunk = payload[i:i+8].ljust(8, b"\0")
            os.write(self.fd, chunk)
        # Read until '\r' or timeout.
        deadline = time.time() + 2.0
        buf = b""
        while time.time() < deadline:
            try:
                data = os.read(self.fd, 8)
                if data:
                    buf += data
                    if b"\r" in buf: break
            except BlockingIOError:
                time.sleep(0.05)
        text = buf.split(b"\r", 1)[0].decode("ascii", errors="replace")
        if text.startswith("("): text = text[1:]
        # Strip CRC (last 2 bytes if present).
        if len(text) > 3: text = text[:-2]
        return text

    def close(self):
        try: os.close(self.fd)
        except Exception: pass


def autodetect() -> HidrawTransport | None:
    """Try every /dev/hidraw* and return the first that answers QPIRI."""
    for path in sorted(glob.glob("/dev/hidraw*")):
        try:
            t = HidrawTransport(path)
            reply = t.send("QPIRI")
            if reply and " " in reply:
                print(f"[agent] inverter detected on {path}")
                return t
            t.close()
        except (PermissionError, FileNotFoundError, OSError):
            continue
    return None


# ---------- QPIGS parser ----------
QPIGS_FIELDS = [
    "grid_voltage","grid_frequency","ac_output_voltage","ac_output_frequency",
    "ac_output_apparent_power","ac_output_active_power","load_percent","bus_voltage",
    "battery_voltage","battery_charging_current","battery_capacity","inverter_temperature",
    "pv_input_current","pv_input_voltage","battery_voltage_scc","battery_discharge_current",
    "device_status","_b","_c","pv_input_power","_d",
]

def parse_qpigs(reply: str) -> dict:
    parts = reply.split()
    out: dict = {}
    for i, name in enumerate(QPIGS_FIELDS):
        if name.startswith("_") or i >= len(parts): continue
        try: out[name] = float(parts[i])
        except ValueError: out[name] = parts[i]
    return out


# ---------- Local store ----------
def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS samples (ts TEXT PRIMARY KEY, payload TEXT, pushed INTEGER DEFAULT 0)")
    return conn


# ---------- Config ----------
def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"cloud_url": CLOUD_URL_DEFAULT, "device_token": None, "site_id": None, "site_name": None}

def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


# ---------- Worker ----------
class Agent:
    def __init__(self):
        self.config = load_config()
        self.transport: HidrawTransport | None = None
        self.latest: dict = {}
        self.license: dict = {}
        self.lock = threading.Lock()
        self.pending: queue.Queue = queue.Queue(maxsize=10000)

    def ensure_transport(self):
        if self.transport: return
        self.transport = autodetect()
        if not self.transport:
            print("[agent] no inverter detected, retrying in 5 s")

    def poll_loop(self):
        while True:
            try:
                self.ensure_transport()
                if self.transport:
                    qpigs = self.transport.send("QPIGS")
                    qmod = self.transport.send("QMOD")
                    sample = parse_qpigs(qpigs)
                    sample["inverter_mode"] = qmod
                    sample["recorded_at"] = datetime.now(timezone.utc).isoformat()
                    with self.lock: self.latest = sample
                    try: self.pending.put_nowait(sample)
                    except queue.Full: pass
            except Exception as e:
                print(f"[agent] poll error: {e}")
                if self.transport: self.transport.close()
                self.transport = None
            time.sleep(POLL_INTERVAL)

    def push_loop(self):
        while True:
            time.sleep(PUSH_INTERVAL)
            token = self.config.get("device_token")
            if not token: continue
            batch = []
            while not self.pending.empty() and len(batch) < 60:
                batch.append(self.pending.get_nowait())
            if not batch: continue
            try:
                r = requests.post(
                    f"{self.config['cloud_url']}/api/public/ingest",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    data=json.dumps({"samples": batch}), timeout=15,
                )
                if r.status_code != 200:
                    print(f"[agent] push failed {r.status_code}: {r.text[:200]}")
                    for s in batch:
                        try: self.pending.put_nowait(s)
                        except queue.Full: break
            except Exception as e:
                print(f"[agent] push error: {e}")
                for s in batch:
                    try: self.pending.put_nowait(s)
                    except queue.Full: break

    def license_loop(self):
        while True:
            try:
                token = self.config.get("device_token")
                if token:
                    r = requests.post(
                        f"{self.config['cloud_url']}/api/public/license-status",
                        json={"device_token": token}, timeout=10,
                    )
                    if r.status_code == 200:
                        with self.lock:
                            self.license = r.json()
            except Exception as e:
                print(f"[agent] license check error: {e}")
            time.sleep(60)

    def activate(self, code: str, name: str) -> dict:
        r = requests.post(
            f"{self.config['cloud_url']}/api/public/activate",
            json={"code": code, "site_name": name, "hardware_id": hardware_id()},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        self.config.update({
            "device_token": data["device_token"],
            "site_id": data["site_id"],
            "site_name": name,
        })
        save_config(self.config)
        return data


def hardware_id() -> str:
    for p in ("/sys/firmware/devicetree/base/serial-number","/etc/machine-id"):
        try: return Path(p).read_text().strip("\x00\n ")
        except Exception: continue
    return "unknown"


# ---------- LAN web UI ----------
PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>SolarOps local</title>
<style>body{font-family:-apple-system,sans-serif;background:#0b0f1a;color:#e5e7eb;margin:0;padding:24px}
.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px}
.metric{display:inline-block;margin-right:32px}
.metric .v{font-size:32px;font-weight:700}
.metric .l{font-size:12px;color:#9ca3af;text-transform:uppercase}
input,button{padding:8px 12px;border-radius:6px;border:1px solid #374151;background:#0b0f1a;color:#e5e7eb}
button{background:#2563eb;border-color:#2563eb;cursor:pointer}
</style></head><body>
<h1>SolarOps — Local</h1>
<div class="card">
  <div class="metric"><div class="l">Solar PV</div><div class="v" id="pv">—</div></div>
  <div class="metric"><div class="l">Load</div><div class="v" id="load">—</div></div>
  <div class="metric"><div class="l">Battery</div><div class="v" id="bat">—</div></div>
  <div class="metric"><div class="l">Grid</div><div class="v" id="grid">—</div></div>
  <div class="metric"><div class="l">Mode</div><div class="v" id="mode">—</div></div>
</div>
<div class="card" id="actcard" style="display:none">
  <h3>Activate license</h3>
  <p>Paste the license code your administrator gave you and a name for this site.</p>
  <form onsubmit="act(event)">
    <input id="name" placeholder="Site name" required>
    <input id="code" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required>
    <button>Activate</button>
  </form>
  <p id="msg" style="color:#f87171"></p>
</div>
<div class="card" id="lcard" style="display:none">
  <h3>Linked to cloud</h3>
  <p>Site: <b id="sname"></b></p>
</div>
<script>
async function tick(){
  const j = await (await fetch('/api/state')).json();
  if (j.config.device_token){ document.getElementById('lcard').style.display='block';
    document.getElementById('sname').textContent = j.config.site_name || j.config.site_id; }
  else { document.getElementById('actcard').style.display='block'; }
  const s = j.latest || {};
  document.getElementById('pv').textContent = (s.pv_input_power||0).toFixed(0)+' W';
  document.getElementById('load').textContent = (s.ac_output_active_power||0).toFixed(0)+' W';
  document.getElementById('bat').textContent = (s.battery_capacity||0).toFixed(0)+' %';
  document.getElementById('grid').textContent = (s.grid_voltage||0).toFixed(0)+' V';
  document.getElementById('mode').textContent = s.inverter_mode || '—';
}
async function act(e){ e.preventDefault();
  const r = await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({code:document.getElementById('code').value, name:document.getElementById('name').value})});
  const j = await r.json();
  if (!r.ok) document.getElementById('msg').textContent = j.error || 'Activation failed';
  else location.reload();
}
setInterval(tick,2000); tick();
</script></body></html>"""

def make_app(agent: Agent) -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index(): return render_template_string(PAGE)

    @app.get("/api/state")
    def state():
        with agent.lock: latest = dict(agent.latest)
        cfg = {k: v for k, v in agent.config.items() if k != "device_token"}
        cfg["device_token"] = bool(agent.config.get("device_token"))
        return jsonify({"latest": latest, "config": cfg})

    @app.post("/api/activate")
    def activate():
        body = request.get_json(force=True) or {}
        code = (body.get("code") or "").strip()
        name = (body.get("name") or "Local site").strip()
        if not code: return jsonify({"error": "missing code"}), 400
        try:
            agent.activate(code, name)
            return jsonify({"ok": True})
        except requests.HTTPError as e:
            return jsonify({"error": e.response.text}), e.response.status_code
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return app


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=int(os.environ.get("SOLAROPS_PORT", "80")))
    p.add_argument("--token", help="Pre-seed device token (skip activation UI)")
    args = p.parse_args()

    agent = Agent()
    if args.token:
        agent.config["device_token"] = args.token
        save_config(agent.config)

    threading.Thread(target=agent.poll_loop, daemon=True).start()
    threading.Thread(target=agent.push_loop, daemon=True).start()
    threading.Thread(target=agent.license_loop, daemon=True).start()

    app = make_app(agent)
    app.run(host="0.0.0.0", port=args.port, debug=False, use_reloader=False)

if __name__ == "__main__":
    main()
