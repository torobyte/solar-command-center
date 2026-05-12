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

import argparse, glob, json, os, queue, shutil, socket, sqlite3, subprocess, threading, time
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, redirect, render_template_string, request

CLOUD_URL_DEFAULT = "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app"
CONFIG_PATH = Path(os.environ.get("SOLAROPS_CONFIG", "/etc/solarops/config.json"))
DB_PATH = Path(os.environ.get("SOLAROPS_DB", "/var/lib/solarops/state.db"))
POLL_INTERVAL = 5.0
PUSH_INTERVAL = 5.0  # push every 5s so the cloud dashboard feels live
SNAPSHOT_INTERVAL = 60.0  # send specs/network/system snapshot every 60s
AGENT_VERSION = "0.6.0"
PVCFG_PATH = Path(os.environ.get("SOLAROPS_PVCFG", "/etc/solarops/pv.json"))

def load_pvcfg() -> dict:
    if PVCFG_PATH.exists():
        try: return json.loads(PVCFG_PATH.read_text())
        except Exception: return {}
    return {}

def save_pvcfg(cfg: dict) -> None:
    PVCFG_PATH.parent.mkdir(parents=True, exist_ok=True)
    PVCFG_PATH.write_text(json.dumps(cfg, indent=2))


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
        raw = buf.split(b"\r", 1)[0]
        # Strip leading '(' and trailing 2-byte CRC, then decode.
        if raw.startswith(b"("): raw = raw[1:]
        if len(raw) >= 2: raw = raw[:-2]
        return raw.decode("ascii", errors="replace").strip()

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
        raw = buf.split(b"\r", 1)[0]
        if raw.startswith(b"("): raw = raw[1:]
        if len(raw) >= 2: raw = raw[:-2]
        return raw.decode("ascii", errors="replace").strip()

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


def load_pvcfg() -> dict:
    if PVCFG_PATH.exists():
        try: return json.loads(PVCFG_PATH.read_text())
        except Exception: return {}
    return {}

def save_pvcfg(cfg: dict) -> None:
    PVCFG_PATH.parent.mkdir(parents=True, exist_ok=True)
    PVCFG_PATH.write_text(json.dumps(cfg, indent=2))


# ---------- Worker ----------
class Agent:
    def __init__(self):
        self.config = load_config()
        self.transport = None
        self.latest: dict = {}
        self.license: dict = {}
        self.spec: dict = {}
        self.snapshot: dict = {}
        self.history: list[dict] = []  # last ~12h of samples for local charts
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
                    with self.lock:
                        self.latest = sample
                        self.history.append(sample)
                        # Keep ~12h at 5s = 8640 samples; cap at 2000 to limit memory.
                        if len(self.history) > 2000: self.history = self.history[-2000:]
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

    def snapshot_loop(self):
        """Periodically push device snapshot (network/system/USB) and inverter
        spec (QPIRI/QID/QVFW) to the cloud so the Configuration tab fills in."""
        while True:
            try:
                # Always collect locally so the LAN UI can show snapshot/spec
                # even before activation or while offline.
                snap = collect_device_snapshot()
                with self.lock: self.snapshot = snap
                spec: dict = {}
                if self.transport:
                    try:
                        qpiri = self.transport.send("QPIRI")
                        parts = qpiri.split()
                        if len(parts) >= 10:
                            def fnum(i):
                                try: return float(parts[i])
                                except (ValueError, IndexError): return None
                            spec.update({
                                "expected_ac_input_voltage": fnum(0),
                                "max_ac_input_current": fnum(2),
                                "nominal_battery_voltage": fnum(4),
                                "max_ac_output_current": fnum(7),
                                "max_ac_output_apparent_power": fnum(8),
                                "max_ac_output_power": fnum(9),
                            })
                    except Exception: pass
                    try:
                        serial = self.transport.send("QID").strip()
                        if serial: spec["serial_number"] = serial
                    except Exception: pass
                    try:
                        fw = self.transport.send("QVFW").replace("VERFW:", "").strip()
                        if fw: spec["firmware"] = fw
                    except Exception: pass
                    spec["driver"] = f"voltronic-{self.transport.kind}"
                    with self.lock: self.spec = spec
                token = self.config.get("device_token")
                if token:
                    payload: dict = {"device": snap}
                    if spec: payload["spec"] = spec
                    r = requests.post(
                        f"{self.config['cloud_url']}/api/public/snapshot",
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        data=json.dumps(payload), timeout=15,
                    )
                    if r.status_code != 200:
                        print(f"[agent] snapshot push {r.status_code}: {r.text[:200]}")
            except Exception as e:
                print(f"[agent] snapshot error: {e}")
            time.sleep(SNAPSHOT_INTERVAL)

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


# ---------- System / network / USB introspection ----------
def _run(cmd: list[str], timeout: float = 3.0) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""

def list_usb_devices() -> list[str]:
    """Return human-readable list of USB devices using lsusb (or /sys fallback)."""
    out = _run(["lsusb"])
    if out.strip():
        return [ln.strip() for ln in out.splitlines() if ln.strip()]
    # Fallback: read /sys/bus/usb/devices
    devs = []
    for p in sorted(glob.glob("/sys/bus/usb/devices/*/product")):
        try:
            name = Path(p).read_text().strip()
            vendor = Path(p).with_name("manufacturer")
            v = vendor.read_text().strip() if vendor.exists() else ""
            devs.append(f"{v} {name}".strip())
        except Exception: continue
    return devs

def get_ip(iface: str) -> str | None:
    out = _run(["ip", "-4", "-o", "addr", "show", iface])
    for ln in out.splitlines():
        parts = ln.split()
        if "inet" in parts:
            i = parts.index("inet")
            if i + 1 < len(parts): return parts[i + 1].split("/")[0]
    return None

def get_ssid() -> str | None:
    out = _run(["iwgetid", "-r"]).strip()
    return out or None

def get_public_ip() -> str | None:
    try:
        return requests.get("https://api.ipify.org", timeout=3).text.strip() or None
    except Exception: return None

def internet_up() -> bool:
    try:
        s = socket.create_connection(("1.1.1.1", 53), timeout=2); s.close(); return True
    except Exception: return False

def cpu_temp_c() -> float | None:
    try:
        v = Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()
        return round(int(v) / 1000.0, 1)
    except Exception: return None

def storage_info() -> tuple[float | None, float | None]:
    try:
        s = shutil.disk_usage("/")
        return round(s.used * 100 / s.total, 1), round(s.total / 1e9, 1)
    except Exception: return None, None

def board_model() -> str | None:
    for p in ("/sys/firmware/devicetree/base/model", "/proc/device-tree/model"):
        try: return Path(p).read_text().strip("\x00\n ")
        except Exception: continue
    return None

def collect_device_snapshot() -> dict:
    used_pct, total_gb = storage_info()
    usbs = list_usb_devices()
    return {
        "ssid": get_ssid(),
        "ip_eth": get_ip("eth0"),
        "ip_wlan": get_ip("wlan0"),
        "ip_public": get_public_ip(),
        "internet_up": internet_up(),
        "cpu_temp_c": cpu_temp_c(),
        "storage_used_pct": used_pct,
        "storage_total_gb": total_gb,
        "usb_devices": len(usbs),
        "usb_devices_list": usbs,
        "board_model": board_model(),
        "agent_version": AGENT_VERSION,
    }


# ---------- LAN web UI ----------
PAGE = r"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>SolarOps</title>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#f59e0b">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
:root{--bg:#fbf8f1;--fg:#0b1220;--muted:#6b7280;--card:#fffdf7;--border:#ece6d6;
  --pv:#f59e0b;--bat:#10b981;--grid:#f59e0b;--inv:#0b1220;--danger:#ef4444;--load:#3b82f6}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;
  background:var(--bg);color:var(--fg);padding:16px;min-height:100vh}
.wrap{max-width:1280px;margin:0 auto}
h1{font-size:22px;font-weight:800;margin:0 0 4px}
.sub{color:var(--muted);font-size:13px;margin-bottom:16px}
.tabs{display:flex;gap:4px;background:#f1ece0;border-radius:10px;padding:4px;margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.tab{padding:8px 14px;border-radius:8px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;border:none;background:transparent;white-space:nowrap;flex-shrink:0}
.tab.active{background:#fff;color:var(--fg);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.panel{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px}
.panel h3{margin:0 0 12px;font-size:14px;font-weight:700}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.grid4{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.tile{background:#faf6ec;border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px}
.icon{width:44px;height:44px;border-radius:10px;background:#f3ecda;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;position:relative}
.tile .label{font-size:14px;font-weight:700}
.tile .val{font-size:13px;color:var(--muted);margin-top:2px}
.warn{position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;background:var(--pv);border-radius:50%;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;border:2px solid var(--card)}
.big{text-align:center;padding:18px 8px;background:#faf6ec;border:1px solid var(--border);border-radius:12px}
.big .v{font-size:28px;font-weight:800;letter-spacing:-0.5px}
.big .l{color:var(--muted);font-size:12px;margin-top:4px}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;gap:8px}
.row:last-child{border-bottom:0}
.row .k{color:var(--muted)}
.row .v{font-weight:600;text-align:right;word-break:break-all}
.modecard{display:flex;justify-content:space-between;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px}
.modecard .l{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.modecard .v{font-size:18px;font-weight:700;margin-top:2px}
.code{background:#eee;padding:3px 8px;border-radius:6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted)}
.usblist{background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px;font-family:ui-monospace,Menlo,monospace;font-size:11px;max-height:200px;overflow:auto}
.usblist div{padding:3px 0}
.status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.dot.online{background:var(--bat)} .dot.offline{background:var(--danger)}
.banner{background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:14px}
form{display:flex;flex-direction:column;gap:8px}
input,select{padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--fg);font-size:14px;width:100%}
button{padding:10px 18px;border-radius:10px;border:none;background:var(--fg);color:#fff;cursor:pointer;font-weight:600;font-size:14px}
.totalcard{text-align:center;padding:16px;background:#faf6ec;border:1px solid var(--border);border-radius:12px}
.totalcard .v{font-size:24px;font-weight:800}
.totalcard .l{font-size:12px;color:var(--muted);margin-top:4px}
svg.chart{width:100%;height:200px;background:#fff;border:1px solid var(--border);border-radius:10px}
.hidden{display:none!important}
/* Battery 3D */
.bat3d{position:relative;width:90px;height:160px;margin:0 auto}
.bat3d .term{position:absolute;left:50%;top:0;transform:translateX(-50%);width:32px;height:8px;border-radius:4px 4px 0 0;background:#9ca3af}
.bat3d .body{position:absolute;left:0;right:0;top:8px;bottom:0;border:2px solid #9ca3af;border-radius:14px;overflow:hidden;background:#f3f4f6}
.bat3d .liq{position:absolute;left:0;right:0;bottom:0;transition:height .8s ease;box-shadow:0 0 20px currentColor}
.bat3d .pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#0b1220}
@keyframes wave{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.bat3d .wv{position:absolute;left:0;top:-6px;width:200%;height:12px;animation:wave 4s linear infinite;opacity:.7}
/* Sun rays */
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:.2;transform:scale(1)}50%{opacity:.45;transform:scale(1.1)}}
.sunwrap{display:flex;justify-content:center;padding:8px}
.sunwrap svg{width:160px;height:160px}
.sunwrap .rays{transform-origin:center;animation:spin 30s linear infinite}
.sunwrap .halo{transform-origin:center;animation:pulse 3s ease-in-out infinite}
/* Sine wave */
@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-200px)}}
.sine{height:90px;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;position:relative}
.sine svg{position:absolute;inset:0;width:100%;height:100%}
.sine .anim{animation:scroll 1.2s linear infinite}
/* Concentric rings */
.rings{display:flex;align-items:center;gap:18px;justify-content:center}
.rings svg{width:180px;height:180px}
.ringlabel{display:flex;align-items:center;gap:6px;font-size:12px;margin:4px 0}
.ringlabel .swatch{width:10px;height:10px;border-radius:50%}
/* Forecast widget */
.fct{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;height:80px;align-items:end;margin-top:10px}
.fct .bar{background:linear-gradient(180deg,#fde68a,var(--pv));border-radius:4px 4px 0 0;position:relative;min-height:4px}
.fct .bar small{position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--pv);font-weight:700;white-space:nowrap}
.daily{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px;border-top:1px solid var(--border);padding-top:10px}
.daily .d{text-align:center;padding:6px;border-radius:8px;font-size:11px}
.daily .d strong{display:block;color:var(--pv)}
.prodest{background:linear-gradient(135deg,#fff7ed,transparent);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px}
.prodest .v{font-size:28px;font-weight:800;color:var(--pv)}
/* Customizer */
.cust-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px}
.cust-btn{padding:6px 12px;font-size:12px;background:#fff;color:var(--fg);border:1px solid var(--border)}
.cust-modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
.cust-card{background:var(--card);border-radius:14px;padding:16px;width:100%;max-width:420px;max-height:80vh;overflow:auto}
.cust-item{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:#fff;font-size:13px}
.cust-item .arr{display:flex;flex-direction:column;gap:2px}
.cust-item .arr button{padding:0 6px;font-size:11px;background:#f3ecda;color:var(--fg);border:none;border-radius:4px}
@media(min-width:720px){
  body{padding:32px}
  h1{font-size:28px}
  .grid4{grid-template-columns:repeat(4,1fr)}
  .big{padding:32px 20px} .big .v{font-size:42px}
  .modecard .v{font-size:22px}
}
</style></head><body><div class="wrap">

<div id="banner" class="banner hidden"></div>

<div id="app" class="hidden">
  <h1 id="sname">—</h1>
  <div class="sub"><span id="invStatus">—</span> · <span class="status"><span id="dot" class="dot"></span><span id="connStatus">—</span></span></div>

  <div class="tabs">
    <button class="tab active" data-tab="dashboard">Dashboard</button>
    <button class="tab" data-tab="charts">Gráficos</button>
    <button class="tab" data-tab="totals">Totales</button>
    <button class="tab" data-tab="config">Configuración</button>
  </div>

  <!-- Dashboard -->
  <section id="tab-dashboard">
    <div class="cust-bar">
      <span class="status"><span class="dot online"></span>Vista personalizable</span>
      <button class="cust-btn" onclick="openCust()">⚙ Personalizar widgets</button>
    </div>
    <div id="widgets"></div>
    <!-- Templates (rendered by JS into #widgets in chosen order) -->
    <template id="w-mode"><div class="modecard"><div><div class="l">Modo de uso del inversor</div><div class="v" id="modeLabel">—</div></div><span class="code" id="modeCode">QMOD: —</span></div></template>
    <template id="w-icons"><div class="panel"><div class="grid4">
      <div class="tile"><div class="icon">🖥️<span id="invWarn" class="warn hidden">!</span></div><div><div class="label">Inversor</div><div class="val" id="invMode">—</div></div></div>
      <div class="tile"><div class="icon" style="color:var(--pv)">☀️</div><div><div class="label">Solar PV</div><div class="val" id="pvKw">0.0 kW</div></div></div>
      <div class="tile"><div class="icon" style="color:var(--grid)">🔌<span id="gridWarn" class="warn hidden">!</span></div><div><div class="label">Red</div><div class="val" id="gridV">0 V</div></div></div>
      <div class="tile"><div class="icon" style="color:var(--bat)">🔋</div><div><div class="label">Batería</div><div class="val" id="batPct">0 %</div></div></div>
    </div></div></template>
    <template id="w-power"><div class="panel"><div class="grid4">
      <div class="big"><div class="v" id="loadW">0 W</div><div class="l">Carga</div></div>
      <div class="big"><div class="v" id="pvW">0 W</div><div class="l">Solar PV</div></div>
      <div class="big"><div class="v" id="gridW">0 W</div><div class="l">Red</div></div>
      <div class="big"><div class="v" id="batW">0 W</div><div class="l">Batería</div></div>
    </div></div></template>
    <template id="w-rings"><div class="panel"><h3>Anillos de actividad</h3><div class="rings">
      <svg viewBox="0 0 200 200" id="ringsSvg"></svg>
      <div><div class="ringlabel"><span class="swatch" style="background:var(--pv)"></span>Solar <strong id="rPv" style="margin-left:auto">0 W</strong></div>
      <div class="ringlabel"><span class="swatch" style="background:var(--load)"></span>Consumo <strong id="rLoad" style="margin-left:auto">0 W</strong></div>
      <div class="ringlabel"><span class="swatch" style="background:var(--bat)"></span>Batería <strong id="rSoc" style="margin-left:auto">0 %</strong></div></div>
    </div></div></template>
    <template id="w-bat3d"><div class="panel"><h3>🔋 Batería</h3><div style="display:flex;align-items:center;gap:20px;justify-content:center">
      <div class="bat3d"><div class="term"></div><div class="body"><div class="liq" id="batLiq" style="height:0%;background:var(--bat);color:var(--bat)"><svg class="wv" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M0 6 Q25 0 50 6 T100 6 T150 6 T200 6 V12 H0 Z" fill="currentColor"/></svg></div><div class="pct" id="batPctV">0%</div></div></div>
      <div style="font-size:13px"><div id="batMode" style="font-weight:700;color:var(--bat)">—</div><div style="color:var(--muted);margin-top:4px">Voltaje: <strong id="batVv">0.0 V</strong></div></div>
    </div></div></template>
    <template id="w-sun"><div class="panel"><h3>☀️ Producción Solar</h3><div class="sunwrap"><svg viewBox="-100 -100 200 200">
      <circle class="halo" r="44" fill="var(--pv)" opacity=".25"/>
      <g class="rays" id="sunRays"></g>
      <circle r="34" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>
      <text id="sunKw" text-anchor="middle" y="3" font-size="18" font-weight="800" fill="#7c2d12">0.0</text>
      <text text-anchor="middle" y="20" font-size="9" fill="#7c2d12">kW</text>
    </svg></div></div></template>
    <template id="w-sine"><div class="panel"><h3>🔌 Red Eléctrica</h3><div class="sine"><svg id="sineSvg" viewBox="0 0 400 90" preserveAspectRatio="none"></svg></div>
      <div class="grid2" style="margin-top:10px"><div class="big" style="padding:10px"><div class="v" id="sineV" style="font-size:20px">0 V</div><div class="l">Voltaje</div></div><div class="big" style="padding:10px"><div class="v" id="sineHz" style="font-size:20px">— Hz</div><div class="l">Frecuencia</div></div></div></div></template>
    <template id="w-forecast"><div class="panel"><h3>🌤 Previsión solar y producción</h3>
      <div id="prodEst" class="prodest hidden"><div class="l" style="font-size:11px;text-transform:uppercase;color:var(--muted)">Producción estimada (próximas 12h)</div><div class="v"><span id="prodKwh">0</span> <span style="font-size:14px;color:var(--muted)">kWh</span></div></div>
      <div id="fctCity" class="sub" style="margin:0">—</div>
      <div class="fct" id="fctBars"></div>
      <div class="daily" id="fctDaily"></div>
    </div></template>
  </section>

  <!-- Charts -->
  <section id="tab-charts" class="hidden">
    <div class="panel"><h3>Potencia Solar PV (W)</h3><svg class="chart" id="chPv"></svg></div>
    <div class="panel"><h3>Carga AC (W)</h3><svg class="chart" id="chLoad"></svg></div>
    <div class="panel"><h3>Estado de carga batería (%)</h3><svg class="chart" id="chSoc"></svg></div>
  </section>

  <!-- Totals -->
  <section id="tab-totals" class="hidden">
    <div class="panel"><h3>Hoy (en vivo, calculado localmente)</h3>
      <div class="grid4">
        <div class="totalcard"><div class="v" id="tPv">0</div><div class="l">PV (kWh)</div></div>
        <div class="totalcard"><div class="v" id="tLoad">0</div><div class="l">Carga (kWh)</div></div>
        <div class="totalcard"><div class="v" id="tGrid">0</div><div class="l">Red usada (kWh)</div></div>
        <div class="totalcard"><div class="v" id="tBatChg">0</div><div class="l">Batería cargada (kWh)</div></div>
      </div>
    </div>
    <div class="panel">
      <p class="sub" style="margin:0">Para totales históricos de varios días, abre el panel en la nube cuando tengas conexión.</p>
    </div>
  </section>

  <!-- Configuration -->
  <section id="tab-config" class="hidden">
    <div class="panel"><h3>☀️ Sistema fotovoltaico</h3>
      <p class="sub">Datos del array, batería y ubicación. Se usan para estimar la producción solar.</p>
      <form onsubmit="savePv(event)" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px">Potencia array (kWp)<input id="pv_kwp" type="number" step="0.01" placeholder="ej. 5.20"></label>
        <label style="font-size:12px">Capacidad batería (kWh)<input id="pv_bat" type="number" step="0.1" placeholder="ej. 4.8"></label>
        <label style="font-size:12px">Nº paneles<input id="pv_n" type="number"></label>
        <label style="font-size:12px">W por panel<input id="pv_w" type="number"></label>
        <label style="font-size:12px">Azimut (°)<input id="pv_az" type="number" placeholder="180"></label>
        <label style="font-size:12px">Inclinación (°)<input id="pv_tilt" type="number" placeholder="30"></label>
        <label style="font-size:12px">Pérdidas (%)<input id="pv_loss" type="number" placeholder="14"></label>
        <label style="font-size:12px">&nbsp;<button type="button" onclick="autoFromInv()" class="cust-btn" style="width:100%">⚡ Auto desde inversor</button></label>
        <label style="font-size:12px">Latitud<input id="pv_lat" type="number" step="0.0001"></label>
        <label style="font-size:12px">Longitud<input id="pv_lon" type="number" step="0.0001"></label>
        <button style="grid-column:1/-1">Guardar configuración</button>
      </form>
    </div>
    <div class="panel"><h3>Especificación del inversor</h3><div id="specRows"></div></div>
    <div class="panel"><h3>Estado de red</h3><div id="netRows"></div></div>
    <div class="panel"><h3>Sistema</h3><div id="sysRows"></div></div>
    <div class="panel">
      <h3>Detecciones USB</h3>
      <div id="usbList" class="usblist">—</div>
    </div>
  </section>
</div>

<!-- Customizer modal -->
<div id="custModal" class="cust-modal hidden" onclick="if(event.target===this)closeCust()">
  <div class="cust-card">
    <h3 style="margin:0 0 10px">Widgets del dashboard</h3>
    <p class="sub" style="margin-bottom:12px">Activa, oculta y reordena. Se guarda en este dispositivo.</p>
    <div id="custList"></div>
    <div style="display:flex;justify-content:space-between;margin-top:12px">
      <button class="cust-btn" onclick="resetWidgets()">↺ Reiniciar</button>
      <button onclick="closeCust()">Listo</button>
    </div>
  </div>
</div>
</div>

<div id="actcard" class="panel hidden">
  <h1>Activar dispositivo</h1>
  <p class="sub">Pega el código de licencia y elige un nombre para este sitio.</p>
  <form onsubmit="act(event)">
    <input id="name" placeholder="Nombre del sitio" required>
    <input id="code" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required>
    <button>Activar</button>
  </form>
  <p id="msg" style="color:var(--danger)"></p>
</div>

<script>
const QMOD = {P:"Encendido (Power On)",S:"Standby",L:"Modo Red (Línea)",B:"Modo Batería",
  F:"Fallo",H:"Ahorro de energía (ECO)",D:"Apagado",Y:"Bypass",G:"Conectado a red (Grid-tie)",
  C:"Cargando",E:"ECO",T:"Test / Mantenimiento"};
function fmtMode(raw){
  if(!raw) return {label:"—",code:""};
  const c = String(raw).replace(/[^A-Za-z]/g,"").charAt(0).toUpperCase();
  if(!c) return {label:"—",code:""};
  return {label: QMOD[c] || ("Modo "+c+" (desconocido)"), code:c};
}
function row(k,v){return '<div class="row"><span class="k">'+k+'</span><span class="v">'+(v??"—")+'</span></div>'}

/* ---------- Widget customizer ---------- */
const WIDGETS = [
  {id:'mode',label:'Modo del inversor'},
  {id:'icons',label:'Tarjetas resumen'},
  {id:'rings',label:'Anillos concéntricos'},
  {id:'power',label:'Potencias en vivo'},
  {id:'bat3d',label:'Batería 3D animada'},
  {id:'sun',label:'Sol radiante'},
  {id:'sine',label:'Onda sinusoidal de red'},
  {id:'forecast',label:'Previsión solar y producción'},
];
const LS_KEY='solarops.widgets.v1';
function loadLayout(){
  try{ const w=JSON.parse(localStorage.getItem(LS_KEY)||'null'); if(Array.isArray(w)) {
    const known=new Set(WIDGETS.map(x=>x.id));
    const next=w.filter(x=>known.has(x.id));
    for(const d of WIDGETS) if(!next.find(x=>x.id===d.id)) next.push({id:d.id,visible:true});
    return next;
  }}catch(_){}
  return WIDGETS.map(d=>({id:d.id,visible:true}));
}
function saveLayout(L){localStorage.setItem(LS_KEY,JSON.stringify(L));}
let LAYOUT = loadLayout();
function renderWidgets(){
  const host=document.getElementById('widgets'); if(!host) return;
  host.innerHTML='';
  for(const w of LAYOUT){
    if(!w.visible) continue;
    const tpl=document.getElementById('w-'+w.id);
    if(tpl) host.appendChild(tpl.content.cloneNode(true));
  }
}
function openCust(){
  const list=document.getElementById('custList'); list.innerHTML='';
  LAYOUT.forEach((w,i)=>{
    const def=WIDGETS.find(d=>d.id===w.id); if(!def) return;
    const it=document.createElement('div'); it.className='cust-item';
    it.innerHTML='<div class="arr"><button data-a="up">▲</button><button data-a="dn">▼</button></div><span style="flex:1">'+def.label+'</span><button data-a="tg">'+(w.visible?'👁':'🚫')+'</button>';
    it.querySelector('[data-a=up]').onclick=()=>{if(i>0){[LAYOUT[i-1],LAYOUT[i]]=[LAYOUT[i],LAYOUT[i-1]];saveLayout(LAYOUT);openCust();renderWidgets();tick();}};
    it.querySelector('[data-a=dn]').onclick=()=>{if(i<LAYOUT.length-1){[LAYOUT[i+1],LAYOUT[i]]=[LAYOUT[i],LAYOUT[i+1]];saveLayout(LAYOUT);openCust();renderWidgets();tick();}};
    it.querySelector('[data-a=tg]').onclick=()=>{LAYOUT[i].visible=!LAYOUT[i].visible;saveLayout(LAYOUT);openCust();renderWidgets();tick();};
    list.appendChild(it);
  });
  document.getElementById('custModal').classList.remove('hidden');
}
function closeCust(){document.getElementById('custModal').classList.add('hidden');}
function resetWidgets(){LAYOUT=WIDGETS.map(d=>({id:d.id,visible:true}));saveLayout(LAYOUT);openCust();renderWidgets();tick();}

/* ---------- Visualization helpers ---------- */
function renderRings(pv,load,soc,pvMax){
  const svg=document.getElementById('ringsSvg'); if(!svg) return;
  const data=[{v:pv,m:pvMax,c:'var(--pv)'},{v:load,m:5000,c:'var(--load)'},{v:soc,m:100,c:'var(--bat)'}];
  let html=''; const cx=100,cy=100,stroke=14,gap=4;
  data.forEach((r,i)=>{const rad=85-i*(stroke+gap); const C=2*Math.PI*rad; const ratio=Math.min(1,Math.max(0,r.v/r.m));
    html+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rad+'" fill="none" stroke="'+r.c+'" stroke-opacity=".18" stroke-width="'+stroke+'"/>';
    html+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rad+'" fill="none" stroke="'+r.c+'" stroke-width="'+stroke+'" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+(C*(1-ratio))+'" transform="rotate(-90 '+cx+' '+cy+')" style="transition:stroke-dashoffset .8s"/>';
  });
  svg.innerHTML=html;
}
function renderSun(pv,pvMax){
  const g=document.getElementById('sunRays'); if(!g) return;
  const ratio=Math.min(1,Math.max(0,pv/pvMax)); const len=18+ratio*36;
  let html=''; for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2; const x1=Math.cos(a)*38,y1=Math.sin(a)*38;const x2=Math.cos(a)*(38+len),y2=Math.sin(a)*(38+len);
    html+='<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>';
  }
  g.innerHTML=html;
  const t=document.getElementById('sunKw'); if(t) t.textContent=(pv/1000).toFixed(2);
}
function renderSine(v){
  const svg=document.getElementById('sineSvg'); if(!svg) return;
  const connected=v>50; const color=connected?'#f59e0b':'#9ca3af';
  if(!connected){svg.innerHTML='<text x="200" y="50" text-anchor="middle" fill="#9ca3af" font-size="13">— sin señal —</text>';return;}
  let d='M0 45'; for(let i=0;i<=200;i++){const x=(i/200)*800; const y=45-Math.sin((i/200)*Math.PI*8)*30; d+=' L'+x.toFixed(1)+' '+y.toFixed(1);}
  svg.innerHTML='<g class="anim"><path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2.5" filter="drop-shadow(0 0 4px '+color+')"/></g>';
  const sv=document.getElementById('sineV'); if(sv) sv.textContent=v.toFixed(0)+' V';
  const sh=document.getElementById('sineHz'); if(sh) sh.textContent='50 Hz';
}
function renderBat3d(soc,vlt,charging){
  const liq=document.getElementById('batLiq'); if(!liq) return;
  const pct=Math.max(0,Math.min(100,soc));
  const color=pct>60?'#10b981':pct>30?'#f59e0b':'#ef4444';
  liq.style.height=pct+'%'; liq.style.background=color; liq.style.color=color;
  document.getElementById('batPctV').textContent=pct.toFixed(0)+'%';
  document.getElementById('batMode').textContent=charging?'⚡ Cargando':'Descargando';
  document.getElementById('batVv').textContent=vlt.toFixed(2)+' V';
}

/* ---------- Solar forecast & production estimate ---------- */
let _fctCache=null,_fctAt=0;
async function loadForecast(pvcfg){
  const lat=pvcfg.latitude, lon=pvcfg.longitude;
  if(lat==null||lon==null) return null;
  if(_fctCache && Date.now()-_fctAt<10*60*1000) return _fctCache;
  try{
    const u='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&hourly=shortwave_radiation,temperature_2m,weather_code&daily=weather_code,sunshine_duration,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto';
    const r=await fetch(u); _fctCache=await r.json(); _fctAt=Date.now(); return _fctCache;
  }catch(_){return null;}
}
function renderForecast(j,pvcfg){
  const bars=document.getElementById('fctBars'); const daily=document.getElementById('fctDaily'); const city=document.getElementById('fctCity');
  if(!bars) return;
  if(!j){bars.innerHTML='<div class="sub" style="grid-column:1/-1">Configura latitud/longitud en Configuración para ver la previsión.</div>'; daily.innerHTML=''; city.textContent=''; return;}
  city.textContent='Lat '+pvcfg.latitude+' · Lon '+pvcfg.longitude;
  const now=new Date(); const times=j.hourly.time||[]; const rad=j.hourly.shortwave_radiation||[];
  const next=[]; for(let i=0;i<times.length && next.length<12;i++){if(new Date(times[i])>=now) next.push({t:times[i],r:rad[i]||0});}
  const peak=Math.max(1,...next.map(x=>x.r));
  const kwp=parseFloat(pvcfg.array_kwp)||0; const loss=(parseFloat(pvcfg.system_losses_pct)||14)/100;
  const totalKwh=kwp?next.reduce((a,h)=>a+kwp*(h.r/1000)*(1-loss),0):0;
  const pe=document.getElementById('prodEst');
  if(kwp && pe){pe.classList.remove('hidden'); document.getElementById('prodKwh').textContent=totalKwh.toFixed(2);} else if(pe){pe.classList.add('hidden');}
  bars.innerHTML=next.map(h=>{const hh=new Date(h.t).getHours(); const ht=Math.max(4,(h.r/peak)*100); const kwh=kwp?(kwp*(h.r/1000)*(1-loss)):0;
    return '<div class="bar" style="height:'+ht+'%" title="'+Math.round(h.r)+' W/m²">'+(kwh>0?'<small>'+kwh.toFixed(1)+'</small>':'')+'<div style="position:absolute;bottom:-14px;left:0;right:0;text-align:center;font-size:9px;color:#9ca3af">'+hh+'h</div></div>';
  }).join('');
  const dt=j.daily.time||[]; const wc=j.daily.weather_code||[]; const sh=j.daily.sunshine_duration||[]; const mx=j.daily.temperature_2m_max||[]; const mn=j.daily.temperature_2m_min||[];
  daily.innerHTML=dt.slice(0,5).map((d,i)=>{const sun=(sh[i]||0)/3600; const dKwh=kwp?(kwp*sun*0.65*(1-loss)):0;
    const lab=i===0?'Hoy':new Date(d).toLocaleDateString('es',{weekday:'short'});
    return '<div class="d"><div style="font-weight:700">'+lab+'</div><div>'+Math.round(mx[i]||0)+'°/'+Math.round(mn[i]||0)+'°</div><div style="color:var(--pv)">'+sun.toFixed(1)+'h ☀</div>'+(kwp?'<strong>'+dKwh.toFixed(1)+' kWh</strong>':'')+'</div>';
  }).join('');
}

/* ---------- PV config form ---------- */
let _pvcfg={};
async function loadPv(){try{const r=await fetch('/api/pvconfig');_pvcfg=await r.json();}catch(_){_pvcfg={};}
  ['kwp','bat','n','w','az','tilt','loss','lat','lon'].forEach(k=>{
    const map={kwp:'array_kwp',bat:'battery_kwh',n:'panel_count',w:'panel_watts',az:'azimuth',tilt:'tilt',loss:'system_losses_pct',lat:'latitude',lon:'longitude'};
    const el=document.getElementById('pv_'+k); if(el && _pvcfg[map[k]]!=null) el.value=_pvcfg[map[k]];
  });
}
async function savePv(e){e.preventDefault();
  const map={kwp:'array_kwp',bat:'battery_kwh',n:'panel_count',w:'panel_watts',az:'azimuth',tilt:'tilt',loss:'system_losses_pct',lat:'latitude',lon:'longitude'};
  const body={};
  for(const k in map){const el=document.getElementById('pv_'+k); const v=el.value.trim(); body[map[k]]=v?parseFloat(v):null;}
  await fetch('/api/pvconfig',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  _pvcfg=body; _fctCache=null; alert('Guardado'); tick();
}
function autoFromInv(){
  fetch('/api/state').then(r=>r.json()).then(j=>{
    const sp=j.spec||{};
    const k=document.getElementById('pv_kwp'); if(!k.value && sp.max_ac_output_power) k.value=(sp.max_ac_output_power/1000).toFixed(2);
    const b=document.getElementById('pv_bat'); if(!b.value && sp.nominal_battery_voltage) b.value=(sp.nominal_battery_voltage*100/1000).toFixed(1);
  });
}

renderWidgets(); loadPv();

document.querySelectorAll('.tab').forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ['dashboard','charts','totals','config'].forEach(t=>{
      document.getElementById('tab-'+t).classList.toggle('hidden', t!==b.dataset.tab);
    });
  };
});

function drawChart(svg, points, color){
  const el = document.getElementById(svg);
  if(!el) return;
  el.innerHTML = "";
  const W = el.clientWidth || 600, H = 200, P = 8;
  if(!points || points.length < 2){
    el.innerHTML = '<text x="'+W/2+'" y="'+H/2+'" text-anchor="middle" fill="#9ca3af" font-size="13" font-family="sans-serif">Sin datos suficientes todavía</text>';
    return;
  }
  const vals = points.map(p=>Number(p)||0);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const sx = (W - 2*P) / (points.length - 1);
  const sy = (H - 2*P) / Math.max(1, max - min);
  let d = "";
  vals.forEach((v,i)=>{
    const x = P + i*sx, y = H - P - (v - min)*sy;
    d += (i===0?"M":"L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  });
  el.innerHTML = '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>';
}

async function tick(){
  let j;
  try{ j = await (await fetch('/api/state')).json(); }catch(_){return}
  const cfg = j.config||{};
  if(!cfg.device_token){
    document.getElementById('actcard').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  document.getElementById('actcard').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sname').textContent = cfg.site_name || cfg.site_id || 'Sitio local';

  const L = j.license||{};
  const cloudOk = L.last_check_ok !== false && !!L.last_check_at;
  document.getElementById('dot').className = 'dot ' + (cloudOk?'online':'offline');
  document.getElementById('connStatus').textContent = cloudOk ? 'sincronizado con la nube' : 'modo offline';

  const banner = document.getElementById('banner');
  if(L.plan && L.license_active===false){
    banner.classList.remove('hidden');
    banner.textContent = 'Licencia expirada. Contacta al administrador.';
  } else if(L.plan==='trial' && (L.days_remaining||0) <= 7){
    banner.classList.remove('hidden');
    banner.textContent = 'Trial: '+(L.days_remaining||0)+' días restantes.';
  } else { banner.classList.add('hidden'); }

  const s = j.latest||{};
  const hasData = Object.keys(s).length>0;
  document.getElementById('invStatus').textContent = hasData ? 'Inversor conectado' : 'Inversor no detectado aún';
  document.getElementById('invWarn').classList.toggle('hidden', hasData);
  const m = fmtMode(s.inverter_mode);
  document.getElementById('modeLabel').textContent = m.label;
  document.getElementById('modeCode').textContent = 'QMOD: ' + (m.code || '—');
  document.getElementById('invMode').textContent = m.label;
  document.getElementById('pvKw').textContent = ((s.pv_input_power||0)/1000).toFixed(1)+' kW';
  document.getElementById('gridV').textContent = (s.grid_voltage||0).toFixed(0)+' V';
  document.getElementById('gridWarn').classList.toggle('hidden', (s.grid_voltage||0)>0);
  document.getElementById('batPct').textContent = (s.battery_capacity||0).toFixed(0)+' %';
  document.getElementById('loadW').textContent = (s.ac_output_active_power||0).toFixed(0)+' W';
  document.getElementById('pvW').textContent = (s.pv_input_power||0).toFixed(0)+' W';
  const gw = (s.grid_voltage||0) > 0 ? (s.ac_output_active_power||0) : 0;
  document.getElementById('gridW').textContent = gw.toFixed(0)+' W';
  const bw = (s.battery_voltage||0) * (s.battery_discharge_current||0) - (s.battery_voltage||0)*(s.battery_charging_current||0);
  document.getElementById('batW').textContent = Math.abs(bw).toFixed(0)+' W';

  // Advanced widgets
  const pvMax = (parseFloat(_pvcfg.array_kwp)||5)*1000;
  const pvW = s.pv_input_power||0, loadW = s.ac_output_active_power||0;
  const charging = (s.battery_charging_current||0) > (s.battery_discharge_current||0);
  renderRings(pvW, loadW, s.battery_capacity||0, pvMax);
  renderSun(pvW, pvMax);
  renderSine(s.grid_voltage||0);
  renderBat3d(s.battery_capacity||0, s.battery_voltage||0, charging);
  if(document.getElementById('rPv')){document.getElementById('rPv').textContent=Math.round(pvW)+' W';document.getElementById('rLoad').textContent=Math.round(loadW)+' W';document.getElementById('rSoc').textContent=Math.round(s.battery_capacity||0)+' %';}
  // Forecast (async, cached)
  if(document.getElementById('fctBars')){loadForecast(_pvcfg).then(fc=>renderForecast(fc,_pvcfg));}

  // Charts
  const h = j.history||[];
  drawChart('chPv',   h.map(p=>p.pv),   '#f59e0b');
  drawChart('chLoad', h.map(p=>p.load), '#3b82f6');
  drawChart('chSoc',  h.map(p=>p.soc),  '#10b981');

  // Totals
  const T = j.totals_today||{};
  document.getElementById('tPv').textContent     = (T.pv_kwh||0).toFixed(2);
  document.getElementById('tLoad').textContent   = (T.load_kwh||0).toFixed(2);
  document.getElementById('tGrid').textContent   = (T.grid_used_kwh||0).toFixed(2);
  document.getElementById('tBatChg').textContent = (T.battery_charged_kwh||0).toFixed(2);

  // Configuration
  const sp = j.spec||{}, sn = j.snapshot||{};
  document.getElementById('specRows').innerHTML =
    row('Driver', sp.driver) + row('Modelo', sp.model_name) + row('Serie', sp.serial_number) +
    row('Firmware', sp.firmware) + row('Voltaje nominal batería', sp.nominal_battery_voltage?sp.nominal_battery_voltage+' V':null) +
    row('Voltaje AC esperado', sp.expected_ac_input_voltage?sp.expected_ac_input_voltage+' V':null) +
    row('Max AC entrada', sp.max_ac_input_current?sp.max_ac_input_current+' A':null) +
    row('Max AC salida', sp.max_ac_output_current?sp.max_ac_output_current+' A':null) +
    row('Max potencia AC', sp.max_ac_output_power?sp.max_ac_output_power+' W':null);
  document.getElementById('netRows').innerHTML =
    row('SSID WiFi', sn.ssid) + row('Internet', sn.internet_up?'Conectado':'Desconectado') +
    row('IP Ethernet', sn.ip_eth) + row('IP WiFi', sn.ip_wlan) + row('IP pública', sn.ip_public);
  document.getElementById('sysRows').innerHTML =
    row('Modelo de placa', sn.board_model) + row('Versión del agente', sn.agent_version) +
    row('Temperatura CPU', sn.cpu_temp_c?sn.cpu_temp_c.toFixed(1)+' °C':null) +
    row('Almacenamiento', (sn.storage_used_pct!=null && sn.storage_total_gb)?sn.storage_used_pct.toFixed(0)+'% de '+sn.storage_total_gb.toFixed(0)+' GB':null) +
    row('Dispositivos USB', sn.usb_devices);
  const usbs = sn.usb_devices_list||[];
  document.getElementById('usbList').innerHTML = usbs.length
    ? usbs.map(d=>'<div>• '+d.replace(/[<>]/g,'')+'</div>').join('')
    : '<div style="color:#9ca3af">Sin dispositivos USB detectados</div>';
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

def compute_today_totals(samples: list[dict]) -> dict:
    """Trapezoidal kWh from a list of samples (each has recorded_at + powers)."""
    if len(samples) < 2:
        return {"pv_kwh": 0, "load_kwh": 0, "grid_used_kwh": 0,
                "battery_charged_kwh": 0, "battery_discharged_kwh": 0}
    def parse(s): 
        try: return datetime.fromisoformat(s.replace("Z","+00:00"))
        except Exception: return None
    pv = load = grid = bchg = bdis = 0.0
    for a, b in zip(samples, samples[1:]):
        ta, tb = parse(a.get("recorded_at","")), parse(b.get("recorded_at",""))
        if not ta or not tb: continue
        h = (tb - ta).total_seconds() / 3600.0
        if h <= 0 or h > 0.5: continue  # skip gaps > 30min
        def avg(k): return (float(a.get(k) or 0) + float(b.get(k) or 0)) / 2.0
        pv   += avg("pv_input_power") * h
        load += avg("ac_output_active_power") * h
        if avg("grid_voltage") > 50:
            grid += avg("ac_output_active_power") * h
        bv = avg("battery_voltage")
        bchg += max(0.0, avg("battery_charging_current")) * bv * h
        bdis += max(0.0, avg("battery_discharge_current")) * bv * h
    return {
        "pv_kwh": round(pv/1000, 3),
        "load_kwh": round(load/1000, 3),
        "grid_used_kwh": round(grid/1000, 3),
        "battery_charged_kwh": round(bchg/1000, 3),
        "battery_discharged_kwh": round(bdis/1000, 3),
    }


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
            snapshot = dict(agent.snapshot)
            spec = dict(agent.spec)
            # Downsample history for the chart: keep ~120 points max.
            hist = list(agent.history)
        if len(hist) > 120:
            step = max(1, len(hist) // 120)
            hist = hist[::step]
        # Compute today's totals from history (rough trapezoidal).
        today = datetime.now(timezone.utc).date().isoformat()
        today_samples = [s for s in agent.history if str(s.get("recorded_at","")).startswith(today)]
        totals = compute_today_totals(today_samples)
        cfg = {k: v for k, v in agent.config.items() if k != "device_token"}
        cfg["device_token"] = bool(agent.config.get("device_token"))
        return jsonify({
            "latest": latest, "config": cfg, "license": license,
            "snapshot": snapshot, "spec": spec,
            "history": [
                {"t": s.get("recorded_at"),
                 "pv": s.get("pv_input_power"),
                 "load": s.get("ac_output_active_power"),
                 "soc": s.get("battery_capacity"),
                 "grid": s.get("grid_voltage")}
                for s in hist
            ],
            "totals_today": totals,
        })

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
    @app.get("/api/pvconfig")
    def get_pvcfg():
        return jsonify(load_pvcfg())

    @app.post("/api/pvconfig")
    def set_pvcfg():
        body = request.get_json(force=True) or {}
        # Whitelist of allowed keys (mirrors cloud schema).
        allowed = {"array_kwp","battery_kwh","panel_count","panel_watts",
                   "azimuth","tilt","system_losses_pct","latitude","longitude"}
        cfg = {k: body.get(k) for k in allowed if k in body}
        save_pvcfg(cfg)
        return jsonify({"ok": True, "config": cfg})

    @app.get("/manifest.webmanifest")
    def manifest():
        return jsonify({
            "name": "SolarOps Local",
            "short_name": "SolarOps",
            "start_url": "/",
            "scope": "/",
            "display": "standalone",
            "background_color": "#0b1220",
            "theme_color": "#f59e0b",
            "icons": [
                {"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable"}
            ],
        })

    @app.get("/icon.svg")
    def icon():
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">'
               '<rect width="192" height="192" rx="40" fill="#0b1220"/>'
               '<g fill="#f59e0b"><circle cx="96" cy="96" r="34"/>'
               '<g stroke="#f59e0b" stroke-width="10" stroke-linecap="round">'
               '<line x1="96" y1="20" x2="96" y2="48"/><line x1="96" y1="144" x2="96" y2="172"/>'
               '<line x1="20" y1="96" x2="48" y2="96"/><line x1="144" y1="96" x2="172" y2="96"/>'
               '<line x1="42" y1="42" x2="62" y2="62"/><line x1="130" y1="130" x2="150" y2="150"/>'
               '<line x1="42" y1="150" x2="62" y2="130"/><line x1="130" y1="62" x2="150" y2="42"/>'
               '</g></g></svg>')
        return app.response_class(svg, mimetype="image/svg+xml")

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
    threading.Thread(target=agent.snapshot_loop, daemon=True).start()

    app = make_app(agent)
    app.run(host="0.0.0.0", port=args.port, debug=False, use_reloader=False)

if __name__ == "__main__":
    main()
