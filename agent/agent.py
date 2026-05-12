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
from flask import Flask, jsonify, redirect, render_template_string, request

CLOUD_URL_DEFAULT = "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"
CONFIG_PATH = Path(os.environ.get("SOLAROPS_CONFIG", "/etc/solarops/config.json"))
DB_PATH = Path(os.environ.get("SOLAROPS_DB", "/var/lib/solarops/state.db"))
POLL_INTERVAL = 5.0
PUSH_INTERVAL = 5.0  # push every 5s so the cloud dashboard feels live


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
    kind = "hidraw"

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


class SerialTransport:
    """RS232 / RS485-USB / UART transport (pyserial). Used for inverters
    that expose a serial port instead of HID (e.g. RS485 adapters, Pi UART)."""
    kind = "serial"

    def __init__(self, path: str, baud: int = 2400):
        import serial  # lazy import — only required if a serial port exists
        self.path = path
        self.baud = baud
        self.ser = serial.Serial(path, baud, timeout=2.0, write_timeout=2.0)

    def send(self, cmd: str) -> str:
        payload = encode(cmd)
        try: self.ser.reset_input_buffer()
        except Exception: pass
        self.ser.write(payload)
        deadline = time.time() + 2.0
        buf = b""
        while time.time() < deadline:
            chunk = self.ser.read(64)
            if chunk:
                buf += chunk
                if b"\r" in buf: break
            else:
                time.sleep(0.02)
        text = buf.split(b"\r", 1)[0].decode("ascii", errors="replace")
        if text.startswith("("): text = text[1:]
        if len(text) > 3: text = text[:-2]
        return text

    def close(self):
        try: self.ser.close()
        except Exception: pass


def _looks_like_qpiri(reply: str) -> bool:
    """Voltronic QPIRI replies with ~20+ space-separated numeric fields."""
    if not reply or " " not in reply: return False
    parts = reply.split()
    if len(parts) < 10: return False
    numeric = sum(1 for p in parts[:10] if p.replace(".", "", 1).replace("-", "", 1).isdigit())
    return numeric >= 6


def _try_open(path: str):
    """Open the right transport for `path` and return it, or None on failure."""
    try:
        if "hidraw" in path:
            return HidrawTransport(path)
        # Serial: try common Voltronic baud rates (2400 default, 9600 some MPP-Solar)
        for baud in (2400, 9600):
            try: return SerialTransport(path, baud=baud)
            except Exception: continue
        return None
    except (PermissionError, FileNotFoundError, OSError):
        return None


def _candidate_ports(preferred: str | None = None) -> list[str]:
    """All plausible inverter ports, in priority order.

    Order: last-known-good port first, then HID (most common for Axpert
    USB), then USB-serial adapters (RS485/RS232), then on-board UARTs.
    """
    seen, out = set(), []
    def add(p):
        if p and p not in seen and os.path.exists(p):
            seen.add(p); out.append(p)
    add(preferred)
    for pat in ("/dev/hidraw*", "/dev/ttyUSB*", "/dev/ttyACM*",
                "/dev/ttyAMA*", "/dev/ttyS*", "/dev/serial/by-id/*"):
        for p in sorted(glob.glob(pat)): add(p)
    return out


def autodetect(preferred: str | None = None):
    """Probe every candidate port (USB-HID + RS485/RS232 + UART) and return
    the first transport that returns a valid QPIRI reply. Tries the
    last-known-good port first to avoid re-scanning every restart."""
    candidates = _candidate_ports(preferred)
    if not candidates:
        print("[agent] no candidate ports found (no /dev/hidraw* or /dev/tty*)")
        return None
    print(f"[agent] probing {len(candidates)} port(s): {', '.join(candidates)}")
    for path in candidates:
        t = _try_open(path)
        if not t: continue
        try:
            reply = t.send("QPIRI")
            if _looks_like_qpiri(reply):
                print(f"[agent] ✓ inverter detected on {path} ({t.kind})")
                return t
            print(f"[agent]   {path}: no valid QPIRI reply")
        except Exception as e:
            print(f"[agent]   {path}: {e}")
        t.close()
    print("[agent] no inverter responded — will retry")
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
        self.transport = None
        self.latest: dict = {}
        self.license: dict = {}
        self.lock = threading.Lock()
        self.pending: queue.Queue = queue.Queue(maxsize=10000)

    def ensure_transport(self):
        if self.transport: return
        preferred = self.config.get("inverter_port")
        self.transport = autodetect(preferred=preferred)
        if self.transport:
            if self.config.get("inverter_port") != self.transport.path:
                self.config["inverter_port"] = self.transport.path
                self.config["inverter_transport"] = self.transport.kind
                save_config(self.config)
        else:
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
                    now_iso = datetime.now(timezone.utc).isoformat()
                    if r.status_code == 200:
                        with self.lock:
                            self.license = r.json()
                            self.license["last_check_at"] = now_iso
                            self.license["last_check_ok"] = True
                    else:
                        with self.lock:
                            self.license["last_check_at"] = now_iso
                            self.license["last_check_ok"] = False
                            self.license["last_check_error"] = f"HTTP {r.status_code}"
            except Exception as e:
                with self.lock:
                    self.license["last_check_at"] = datetime.now(timezone.utc).isoformat()
                    self.license["last_check_ok"] = False
                    self.license["last_check_error"] = str(e)
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
PAGE = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SolarOps</title>
<style>
:root{--bg:#fbf8f1;--fg:#0b1220;--muted:#6b7280;--card:#fffdf7;--border:#ece6d6;
  --pv:#f59e0b;--bat:#10b981;--grid:#f59e0b;--inv:#0b1220;--danger:#ef4444}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;
  background:var(--bg);color:var(--fg);padding:32px;min-height:100vh}
.wrap{max-width:1280px;margin:0 auto}
.back{color:var(--muted);text-decoration:none;font-size:14px;display:inline-flex;gap:6px;align-items:center;margin-bottom:16px}
h1{font-size:32px;font-weight:800;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin-bottom:24px}
.tabs{display:inline-flex;gap:4px;background:#f1ece0;border-radius:10px;padding:4px;margin-bottom:24px}
.tab{padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;border:none;background:transparent}
.tab.active{background:#fff;color:var(--fg);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.panel{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tile{background:#faf6ec;border:1px solid var(--border);border-radius:14px;padding:18px;display:flex;align-items:center;gap:16px}
.icon{width:56px;height:56px;border-radius:12px;background:#f3ecda;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;position:relative}
.icon.pv{color:var(--pv)} .icon.bat{color:var(--bat)} .icon.grid{color:var(--grid)} .icon.inv{color:var(--inv)}
.tile .label{font-size:16px;font-weight:700}
.tile .val{font-size:14px;color:var(--muted);margin-top:2px}
.warn{position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;background:var(--pv);border-radius:50%;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid var(--card)}
.big{text-align:center;padding:48px 20px}
.big .v{font-size:56px;font-weight:800;letter-spacing:-1px}
.big .l{color:var(--muted);font-size:14px;margin-top:6px}
.status{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.dot.online{background:var(--bat)} .dot.offline{background:var(--danger)}
.banner{background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:16px}
form{display:flex;gap:8px;flex-wrap:wrap}
input{padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--fg);font-size:14px;flex:1;min-width:200px}
button{padding:10px 18px;border-radius:10px;border:none;background:var(--fg);color:#fff;cursor:pointer;font-weight:600;font-size:14px}
.muted{color:var(--muted);font-size:12px;margin-top:8px}
@media(max-width:640px){.grid{grid-template-columns:1fr}body{padding:16px}h1{font-size:24px}}
</style></head><body><div class="wrap">

<div id="banner" class="banner" style="display:none"></div>

<div id="app" style="display:none">
  <a class="back" href="#" onclick="return false">← <span data-t="back">Sitio local</span></a>
  <h1 id="sname">—</h1>
  <div class="sub"><span id="invStatus">—</span> · <span class="status"><span id="dot" class="dot"></span><span id="connStatus">—</span></span></div>

  <div class="tabs">
    <button class="tab active">Dashboard</button>
  </div>

  <div class="panel">
    <div class="grid">
      <div class="tile"><div class="icon inv">🖥️<span id="invWarn" class="warn" style="display:none">!</span></div>
        <div><div class="label">Inversor</div><div class="val" id="invMode">—</div></div></div>
      <div class="tile"><div class="icon pv">☀️</div>
        <div><div class="label">Solar PV</div><div class="val" id="pvKw">0.0 kW</div></div></div>
      <div class="tile"><div class="icon grid">🔌<span id="gridWarn" class="warn" style="display:none">!</span></div>
        <div><div class="label">Red</div><div class="val" id="gridV">0 V</div></div></div>
      <div class="tile"><div class="icon bat">🔋</div>
        <div><div class="label">Batería</div><div class="val" id="batPct">0 %</div></div></div>
    </div>
  </div>

  <div class="panel">
    <div class="grid">
      <div class="big"><div class="v" id="loadW">0 W</div><div class="l">Carga</div></div>
      <div class="big"><div class="v" id="pvW">0 W</div><div class="l">Solar PV</div></div>
      <div class="big"><div class="v" id="gridW">0 W</div><div class="l">Red</div></div>
      <div class="big"><div class="v" id="batW">0 W</div><div class="l">Batería</div></div>
    </div>
  </div>
</div>

<div id="actcard" class="panel" style="display:none">
  <h1>Activar dispositivo</h1>
  <p class="sub">Pega el código de licencia que te entregó el administrador y elige un nombre para este sitio.</p>
  <form onsubmit="act(event)">
    <input id="name" placeholder="Nombre del sitio" required>
    <input id="code" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required>
    <button>Activar</button>
  </form>
  <p id="msg" style="color:var(--danger)"></p>
</div>

<script>
function fmtDate(s){try{return new Date(s).toLocaleDateString()}catch(_){return s}}
function fmtDT(s){try{return new Date(s).toLocaleString()}catch(_){return s}}
let onlineCloud = false;
async function pingCloud(url){
  try{const r=await fetch(url+'/api/public/license-status',{method:'OPTIONS',mode:'no-cors'});return true}catch(_){return false}
}
async function tick(){
  let j;
  try{ j = await (await fetch('/api/state')).json(); }catch(_){return}
  const cfg = j.config||{};
  if(!cfg.device_token){
    document.getElementById('actcard').style.display='block';
    document.getElementById('app').style.display='none';
    return;
  }
  document.getElementById('actcard').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('sname').textContent = cfg.site_name || cfg.site_id || 'Sitio local';

  const L = j.license||{};
  const cloudOk = L.last_check_ok !== false && !!L.last_check_at;
  document.getElementById('dot').className = 'dot ' + (cloudOk?'online':'offline');
  document.getElementById('connStatus').textContent = cloudOk ? 'sincronizado con la nube' : 'modo offline (sin conexión a la nube)';

  const banner = document.getElementById('banner');
  if(L.plan && !L.license_active){
    banner.style.display='block';
    banner.textContent = 'Licencia expirada. Contacta al administrador.';
  } else if(L.plan==='trial' && (L.days_remaining||0) <= 7){
    banner.style.display='block';
    banner.textContent = 'Trial: '+(L.days_remaining||0)+' días restantes.';
  } else { banner.style.display='none'; }

  const s = j.latest||{};
  const hasData = Object.keys(s).length>0;
  document.getElementById('invStatus').textContent = hasData ? 'Inversor conectado' : 'Inversor no detectado aún';
  document.getElementById('invWarn').style.display = hasData?'none':'flex';
  document.getElementById('invMode').textContent = s.inverter_mode || '—';
  document.getElementById('pvKw').textContent = ((s.pv_input_power||0)/1000).toFixed(1)+' kW';
  document.getElementById('gridV').textContent = (s.grid_voltage||0).toFixed(0)+' V';
  document.getElementById('gridWarn').style.display = (s.grid_voltage||0)>0?'none':'flex';
  document.getElementById('batPct').textContent = (s.battery_capacity||0).toFixed(0)+' %';
  document.getElementById('loadW').textContent = (s.ac_output_active_power||0).toFixed(0)+' W';
  document.getElementById('pvW').textContent = (s.pv_input_power||0).toFixed(0)+' W';
  const gw = (s.grid_voltage||0) > 0 ? (s.ac_output_active_power||0) : 0;
  document.getElementById('gridW').textContent = gw.toFixed(0)+' W';
  const bw = (s.battery_voltage||0) * (s.battery_discharge_current||0) - (s.battery_voltage||0)*(s.battery_charging_current||0);
  document.getElementById('batW').textContent = Math.abs(bw).toFixed(0)+' W';
}
async function act(e){e.preventDefault();
  const r = await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code:document.getElementById('code').value,name:document.getElementById('name').value})});
  const j = await r.json();
  if(!r.ok) document.getElementById('msg').textContent = j.error || 'Activación fallida';
  else location.reload();
}
setInterval(tick,2000); tick();
</script></div></body></html>"""

def make_app(agent: Agent) -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index():
        # Servimos siempre la UI local — visualmente idéntica al panel de la
        # plataforma web. Funciona sin internet (lee la caché local del
        # agente) y se sincroniza con la nube en segundo plano cuando hay
        # conexión.
        return render_template_string(PAGE)

    @app.get("/api/state")
    def state():
        with agent.lock:
            latest = dict(agent.latest)
            license = dict(agent.license)
        cfg = {k: v for k, v in agent.config.items() if k != "device_token"}
        cfg["device_token"] = bool(agent.config.get("device_token"))
        return jsonify({"latest": latest, "config": cfg, "license": license})

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
