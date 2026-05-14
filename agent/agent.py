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
POLL_INTERVAL = 1.0  # leer inversor cada 1s para sensación "en vivo"
PUSH_INTERVAL = 1.0  # empujar al cloud cada 1s
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
        # Strip everything before the first '(' (some inverters / HID dongles
        # prepend stray bytes like '0' or NUL) plus the trailing 2-byte CRC.
        i = raw.find(b"(")
        if i >= 0: raw = raw[i+1:]
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
        i = raw.find(b"(")
        if i >= 0: raw = raw[i+1:]
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
    """Parse a QPIGS reply. Skips garbage tokens silently — almacenar
    strings no-numéricos en campos numéricos rompe los downstream consumers
    (cloud ingest, compute_today_totals, frontend gauges)."""
    parts = reply.split()
    out: dict = {}
    for i, name in enumerate(QPIGS_FIELDS):
        if name.startswith("_") or i >= len(parts): continue
        tok = parts[i]
        try:
            out[name] = float(tok)
        except ValueError:
            # Token corrupto (típico cuando el HID concatena dos respuestas
            # o el inversor devuelve un byte basura). Lo ignoramos para no
            # contaminar la muestra; el poll_loop detectará la baja calidad
            # y forzará reconexión si pasa repetidas veces.
            continue
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
        # Diagnóstico para la página de estado local
        self.last_error: str | None = None
        self.last_error_at: str | None = None
        self.last_sample_at: str | None = None
        self.error_count: int = 0
        self.read_count: int = 0
        self.started_at: str = datetime.now(timezone.utc).isoformat()
        # Diagnóstico de la conexión con el inversor — usado por el badge
        # "Inversor: …" del frontend local para que el operador sepa por qué
        # no ve datos sin tener que abrir /status.
        self.inverter_connected_at: str | None = None
        self.inverter_reconnect_count: int = 0
        self.inverter_consecutive_empty: int = 0
        self.inverter_state: str = "init"  # init | searching | connected | stale | error
        # Diagnóstico del push_loop hacia el cloud
        self.push_ok_count: int = 0
        self.push_fail_count: int = 0
        self.push_last_ok_at: str | None = None
        self.push_last_attempt_at: str | None = None
        self.push_last_error: str | None = None
        self.push_loop_restarts: int = 0

    def ensure_transport(self):
        if self.transport: return
        self.inverter_state = "searching"
        preferred = self.config.get("inverter_port")
        self.transport = autodetect(preferred=preferred)
        if self.transport:
            self.inverter_connected_at = datetime.now(timezone.utc).isoformat()
            self.inverter_reconnect_count += 1
            self.inverter_consecutive_empty = 0
            self.inverter_state = "connected"
            print(f"[agent] inverter connected on {self.transport.path} "
                  f"({self.transport.kind}) — reconexión #{self.inverter_reconnect_count}", flush=True)
            if self.config.get("inverter_port") != self.transport.path:
                self.config["inverter_port"] = self.transport.path
                self.config["inverter_transport"] = self.transport.kind
                save_config(self.config)
        else:
            self.last_error = "No se detectó inversor en ningún puerto"
            self.last_error_at = datetime.now(timezone.utc).isoformat()
            self.inverter_state = "error"
            print("[agent] no inverter detected, retrying in 5 s")

    def _force_reconnect(self, reason: str):
        """Cierra el transporte y deja que el próximo ciclo lo reabra."""
        print(f"[agent] forcing inverter reconnect: {reason}", flush=True)
        self.last_error = reason
        self.last_error_at = datetime.now(timezone.utc).isoformat()
        self.inverter_state = "error"
        if self.transport:
            try: self.transport.close()
            except Exception: pass
        self.transport = None
        self.inverter_consecutive_empty = 0

    def poll_loop(self):
        # Backoff cuando no hay inversor — evitamos hacer autodetect cada
        # segundo (escanea /dev/hidraw* + /dev/serial/by-id/* y es caro).
        no_device_sleep = 0.0
        while True:
            try:
                if not self.transport and no_device_sleep > 0:
                    time.sleep(min(no_device_sleep, 5.0))
                self.ensure_transport()
                if not self.transport:
                    no_device_sleep = min(5.0, no_device_sleep + 1.0)
                    time.sleep(POLL_INTERVAL)
                    continue
                no_device_sleep = 0.0
                qpigs = self.transport.send("QPIGS")
                qmod = self.transport.send("QMOD")
                sample = parse_qpigs(qpigs)
                # Si la muestra no tiene siquiera la tensión de red, la
                # consideramos vacía y forzamos reconexión tras 3 intentos
                # — típico cuando el cable USB se desenchufa pero el
                # /dev/hidraw0 sigue existiendo y devuelve cadenas vacías.
                if not sample.get("grid_voltage") and not sample.get("ac_output_voltage"):
                    self.inverter_consecutive_empty += 1
                    if self.inverter_consecutive_empty >= 3:
                        self._force_reconnect("3 lecturas vacías consecutivas")
                    else:
                        self.inverter_state = "stale"
                    time.sleep(POLL_INTERVAL)
                    continue
                self.inverter_consecutive_empty = 0
                self.inverter_state = "connected"
                sample["inverter_mode"] = qmod
                sample["recorded_at"] = datetime.now(timezone.utc).isoformat()
                with self.lock:
                    self.latest = sample
                    self.last_sample_at = sample["recorded_at"]
                    self.read_count += 1
                    self.history.append(sample)
                    # Keep ~12h at 5s = 8640 samples; cap at 2000 to limit memory.
                    if len(self.history) > 2000: self.history = self.history[-2000:]
                try: self.pending.put_nowait(sample)
                except queue.Full: pass
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {e}"
                self.last_error_at = datetime.now(timezone.utc).isoformat()
                self.error_count += 1
                self.inverter_state = "error"
                print(f"[agent] poll error: {e}")
                if self.transport:
                    try: self.transport.close()
                    except Exception: pass
                self.transport = None
            time.sleep(POLL_INTERVAL)


    def push_loop(self):
        # Bucle exterior blindado: si una excepción inesperada (p.ej. error
        # de SSL transitorio, timeout en json.dumps, race en la cola)
        # tumbase el thread, sin esto el agente seguiría leyendo el inversor
        # localmente pero dejaría de empujar al cloud silenciosamente.
        while True:
            try:
                self._push_loop_inner()
            except Exception as e:
                self.push_loop_restarts += 1
                self.push_last_error = f"loop crashed: {type(e).__name__}: {e}"
                self.push_last_attempt_at = datetime.now(timezone.utc).isoformat()
                print(f"[agent] push_loop crashed (#{self.push_loop_restarts}): {e}", flush=True)
                time.sleep(2.0)

    def _push_loop_inner(self):
        while True:
            time.sleep(PUSH_INTERVAL)
            token = self.config.get("device_token")
            if not token: continue
            batch = []
            while not self.pending.empty() and len(batch) < 60:
                try: batch.append(self.pending.get_nowait())
                except queue.Empty: break
            if not batch: continue
            self.push_last_attempt_at = datetime.now(timezone.utc).isoformat()
            try:
                r = requests.post(
                    f"{self.config['cloud_url']}/api/public/ingest",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    data=json.dumps({"samples": batch}), timeout=15,
                )
                if r.status_code != 200:
                    self.push_fail_count += 1
                    self.push_last_error = f"HTTP {r.status_code}: {r.text[:200]}"
                    print(f"[agent] push failed {r.status_code}: {r.text[:200]}", flush=True)
                    for s in batch:
                        try: self.pending.put_nowait(s)
                        except queue.Full: break
                else:
                    self.push_ok_count += len(batch)
                    self.push_last_ok_at = self.push_last_attempt_at
                    self.push_last_error = None
            except Exception as e:
                self.push_fail_count += 1
                self.push_last_error = f"{type(e).__name__}: {e}"
                print(f"[agent] push error: {e}", flush=True)
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
WRAPPER_PAGE = r"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>SolarOps</title>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#15171f">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
  html,body{margin:0;padding:0;height:100%;background:#15171f;color:#f5f3ee;
    font-family:-apple-system,BlinkMacSystemFont,"Inter","SF Pro Display","Segoe UI",sans-serif}
  #frame{position:fixed;inset:0;width:100%;height:100%;border:0;background:#15171f;
    opacity:0;transition:opacity .3s ease}
  #frame.ready{opacity:1}
  #boot{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:14px;text-align:center;padding:24px}
  #boot .logo{font-size:22px;font-weight:800;letter-spacing:-.02em;color:#f5b945}
  #boot .sub{font-size:13px;color:#8a8d97;max-width:420px;line-height:1.5}
  #boot .spin{width:34px;height:34px;border:3px solid rgba(245,185,69,.15);
    border-top-color:#f5b945;border-radius:50%;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .btn{margin-top:6px;padding:9px 16px;border-radius:10px;border:1px solid #2c2f42;
    background:#1d2030;color:#f5f3ee;font-size:13px;font-weight:600;cursor:pointer;
    text-decoration:none;display:inline-block}
  .btn:hover{background:#232739}
</style>
</head><body>
<div id="boot">
  <div class="logo">SolarOps</div>
  <div class="spin"></div>
  <div class="sub" id="bootMsg">Verificando agente local…</div>
  <a class="btn" href="/legacy" id="fallbackBtn" style="display:none">Abrir panel local (offline)</a>
  <a class="btn" href="#" id="toLegacyBtn" onclick="switchMode('legacy');return false;">Cambiar a modo legacy</a>
  <a class="btn" href="/status" style="background:transparent">Diagnóstico del agente</a>
</div>
<iframe id="frame" allow="fullscreen; clipboard-write" referrerpolicy="no-referrer"></iframe>
<script>
(function(){
  var origin = window.location.origin;
  var cloud  = "{{ cloud_base }}";
  var url    = cloud + "/local?agent=" + encodeURIComponent(origin) + "&v={{ boot_id }}";
  var frame  = document.getElementById("frame");
  var boot   = document.getElementById("boot");
  var msg    = document.getElementById("bootMsg");
  var fb     = document.getElementById("fallbackBtn");

  // Mixed content: si esta página se sirvió por HTTPS pero el agente vive
  // en HTTP (caso típico en LAN), el navegador bloqueará los fetch
  // HTTPS→HTTP del iframe cloud. Detectamos eso y vamos directo al panel
  // local — sin iframe, sin esperar timeouts.
  var pageIsHttps  = window.location.protocol === "https:";
  var agentIsHttp  = origin.indexOf("http://") === 0;
  var mixedContent = pageIsHttps && agentIsHttp;

  var ready = false;
  function goLegacy(reason){
    if (ready) return;
    msg.textContent = reason || "Mostrando el panel local.";
    fb.style.display = "inline-block";
    setTimeout(function(){ if(!ready) window.location.replace("/legacy"); }, 800);
  }

  // 1) Healthcheck del propio agente. Si esto falla, nada más tiene sentido.
  fetch("/api/health", { cache:"no-store" })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("health "+r.status)); })
    .then(function(h){
      // Si el usuario eligió modo legacy explícitamente, ir directo.
      if (h && h.ui_mode === "legacy") { window.location.replace("/legacy"); return; }
      if (mixedContent) { goLegacy("Conexión segura no disponible — usando panel local."); return; }
      msg.textContent = h && h.has_inverter_data
        ? "Conectando con el panel cloud…"
        : "Esperando primer dato del inversor…";
      probeCloud();
    })
    .catch(function(e){
      msg.textContent = "Agente local no responde (" + (e && e.message || "error") + ").";
      fb.style.display = "inline-block";
    });

  // 2) Probe de internet hecho desde el AGENTE (TCP a 1.1.1.1:53). Esto
  // evita falsos negativos por CORS / mixed-content / DNS lento del navegador
  // que aparecían cuando se hacía el probe directo al cloud desde el cliente.
  function probeCloud(){
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var to = setTimeout(function(){ if(ctrl) ctrl.abort(); }, 6000);
    fetch("/api/internet", { cache:"no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function(r){ return r.json(); })
      .then(function(j){
        clearTimeout(to);
        if (j && j.online) loadIframe();
        else goLegacy("Sin internet en el dispositivo. Cargando panel local.");
      })
      .catch(function(){ clearTimeout(to); goLegacy("No se pudo verificar internet. Cargando panel local."); });
  }

  // Botón global para alternar modo y persistirlo en el agente.
  window.switchMode = function(mode){
    fetch("/api/mode", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ui_mode: mode })
    }).finally(function(){
      window.location.replace(mode === "legacy" ? "/legacy" : "/");
    });
  };

  function loadIframe(){
    var deadline = setTimeout(function(){ goLegacy("Cloud no respondió a tiempo."); }, 2500);
    frame.addEventListener("load", function(){
      try {
        var href = frame.contentWindow && frame.contentWindow.location && frame.contentWindow.location.href;
        if (href && href.indexOf("about:blank") === 0) return;
      } catch(_) { /* cross-origin = bien, cargó el cloud */ }
      clearTimeout(deadline);
      ready = true;
      frame.classList.add("ready");
      boot.style.display = "none";
    });
    frame.addEventListener("error", function(){ goLegacy("Error cargando el panel cloud."); });
    frame.src = url;
    setTimeout(tick, 500);
  }

  // ---- Bridge postMessage: el padre (mismo origen que /api/*) hace los
  // fetches y se los pasa al iframe HTTPS para sortear mixed-content.
  var lastState = null, lastPv = null;
  function postTo(target, type, payload){
    try { target.postMessage({ source:"solarops-agent", type: type, payload: payload }, "*"); }
    catch(_) {}
  }
  async function pull(path){
    try {
      var r = await fetch(path, { cache:"no-store" });
      var ct = (r.headers.get("content-type")||"").toLowerCase();
      if (!r.ok || ct.indexOf("application/json") < 0) return null;
      return await r.json();
    } catch(_) { return null; }
  }
  async function tick(){
    var w = frame.contentWindow; if (!w) return;
    var s = await pull("/api/state");
    if (s) { lastState = s; postTo(w, "state", s); }
    if (!lastPv) {
      var p = await pull("/api/pvconfig");
      if (p) { lastPv = p; postTo(w, "pvconfig", p); }
    }
  }
  window.addEventListener("message", function(ev){
    var d = ev && ev.data;
    if (!d || d.source !== "solarops-local" || d.type !== "ready") return;
    var w = frame.contentWindow; if (!w) return;
    if (lastState) postTo(w, "state", lastState);
    if (lastPv)    postTo(w, "pvconfig", lastPv);
  });
  setInterval(tick, 2000);
})();
</script>
</body></html>"""

PAGE = r"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>SolarOps · Local</title>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1a1a2e">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
:root{
  --bg:#15171f; --fg:#f5f3ee; --muted:#8a8d97; --card:#1d2030; --card2:#232739;
  --border:#2c2f42; --accent:#f5b945; --accent2:#fbbf24;
  --pv:#f59e0b; --battery:#22c55e; --grid:#ef4444; --load:#3b82f6;
  --success:#22c55e; --warn:#f59e0b; --danger:#ef4444;
  --shadow:0 10px 40px -12px rgba(0,0,0,.55);
  --radius:16px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg)}
body{font-family:-apple-system,BlinkMacSystemFont,"Inter","SF Pro Display","Segoe UI",sans-serif;
  min-height:100vh;-webkit-font-smoothing:antialiased;
  background:radial-gradient(1200px 600px at 80% -10%,rgba(245,185,69,.06),transparent 60%),
             radial-gradient(900px 500px at -10% 110%,rgba(34,197,94,.05),transparent 60%),var(--bg)}
.wrap{max-width:1480px;margin:0 auto;padding:18px 16px 80px}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.hdr h1{font-size:22px;font-weight:800;margin:0;letter-spacing:-.02em}
.hdr .sub{color:var(--muted);font-size:12.5px}
.badge{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--border);border-radius:999px;font-size:11.5px;font-weight:600;background:var(--card)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);box-shadow:0 0 0 0 currentColor}
.dot.on{background:var(--success);animation:pulse 2s infinite}
.dot.off{background:var(--danger)}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
.tabs{display:flex;gap:2px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:14px;overflow-x:auto}
.tab{padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border:0;background:transparent;white-space:nowrap}
.tab.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#1a1a2e;box-shadow:0 4px 14px -4px rgba(245,185,69,.5)}
.banner{background:linear-gradient(135deg,rgba(245,185,69,.12),rgba(251,191,36,.06));border:1px solid rgba(245,185,69,.3);color:var(--accent);padding:11px 14px;border-radius:12px;font-size:13px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.modecard{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px}
.modecard .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600}
.modecard .v{font-size:18px;font-weight:800;margin-top:2px;letter-spacing:-.01em}

/* ===== Grid + tiles (drag & drop + resize) ===== */
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;align-items:start}
.tile{container-type:inline-size;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  position:relative;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
  min-height:160px}
.tile:hover{border-color:#3a3e58}
.tile.dragging{opacity:.4}
.tile.over{border-color:var(--accent);box-shadow:0 0 0 2px rgba(245,185,69,.25)}
.tile .body{padding:16px;height:100%}
.tile .toolbar{position:absolute;top:6px;right:6px;display:none;gap:2px;background:rgba(15,17,24,.85);backdrop-filter:blur(8px);padding:3px;border-radius:8px;border:1px solid var(--border);z-index:5}
.tile:hover .toolbar,.editing .tile .toolbar{display:flex}
.tbtn{background:transparent;border:0;color:var(--muted);font-size:11px;font-weight:700;cursor:pointer;padding:4px 7px;border-radius:5px;font-family:inherit}
.tbtn:hover{background:var(--card2);color:var(--fg)}
.tbtn.act{color:var(--accent)}
.handle{position:absolute;top:6px;left:6px;width:22px;height:22px;display:none;align-items:center;justify-content:center;color:var(--muted);cursor:grab;border-radius:6px;background:rgba(15,17,24,.7);z-index:5}
.tile:hover .handle,.editing .tile .handle{display:flex}
.handle:active{cursor:grabbing}
.editing .tile{box-shadow:inset 0 0 0 1px rgba(245,185,69,.3)}
@media(max-width:768px){
  .grid{grid-template-columns:repeat(4,1fr);gap:10px}
  .toolbar,.handle{display:flex !important}
}
@media(max-width:480px){
  .grid{grid-template-columns:repeat(2,1fr)}
}

/* widget chrome */
.wh{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.wh .t{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:7px}
.wh .v{font-size:11px;color:var(--muted)}
.icon{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center}
.big{font-size:32px;font-weight:800;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
@container (min-width: 360px){.big{font-size:40px}}
@container (min-width: 520px){.big{font-size:48px}}
.unit{font-size:13px;color:var(--muted);margin-left:4px;font-weight:600}
.sub2{font-size:12px;color:var(--muted);margin-top:6px}

/* row stats */
.rows{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.rk{display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0;border-bottom:1px dashed var(--border)}
.rk:last-child{border:0}
.rk .k{color:var(--muted)}
.rk .v{font-weight:700;font-variant-numeric:tabular-nums}

/* Settings/forms */
.panel{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:12px}
.panel h3{margin:0 0 12px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px}
.formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
label{display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
input,select,textarea{width:100%;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:9px;color:var(--fg);font-size:13.5px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px rgba(245,185,69,.18)}
.btn{padding:10px 16px;border:0;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#1a1a2e;font-weight:700;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn.ghost{background:var(--card2);color:var(--fg);border:1px solid var(--border)}
.btn:hover{filter:brightness(1.08)}
.code{background:var(--card2);padding:3px 8px;border-radius:6px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--accent)}
.usblist{background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:10px;font-family:ui-monospace,Menlo,monospace;font-size:11px;max-height:220px;overflow:auto}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
.row:last-child{border:0} .row .k{color:var(--muted)} .row .v{font-weight:600;text-align:right;word-break:break-all}

/* Animations */
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.tile{animation:fadeIn .35s ease}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shimmer{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes flow{to{stroke-dashoffset:-40}}

/* Charts */
.chart{height:240px;background:var(--card2);border-radius:10px;padding:8px}

/* Edit-mode toggle */
.editmode-toggle{position:fixed;bottom:16px;right:16px;z-index:50;padding:11px 16px;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#1a1a2e;font-weight:800;border:0;box-shadow:var(--shadow);cursor:pointer;font-size:13px}
.editing .editmode-toggle{background:var(--card);color:var(--accent);border:1px solid var(--accent)}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div>
      <h1 id="siteName">SolarOps Local</h1>
      <div class="sub"><span class="badge"><span class="dot" id="conDot"></span><span id="conTxt">Conectando…</span></span>
        <span style="margin-left:6px;color:var(--muted);font-size:12px" id="lastSeen"></span></div>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <span class="badge" id="modeBadge">Modo: —</span>
      <span class="badge" id="planBadge">Plan: —</span>
      <button class="badge" style="cursor:pointer;border:1px solid var(--border);background:var(--card2);color:var(--fg)"
        onclick="fetch('/api/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ui_mode:'modern'})}).finally(function(){window.location.replace('/');});">
        ↗ Cambiar a modo moderno
      </button>
    </div>
  </div>

  <div id="actBanner" class="banner" style="display:none">
    Este dispositivo aún no está activado.
    <a href="#" id="actLink" style="color:var(--accent);font-weight:700;text-decoration:underline;margin-left:6px">Activar ahora →</a>
  </div>

  <div class="tabs" id="tabs">
    <button class="tab active" data-tab="dash">Dashboard</button>
    <button class="tab" data-tab="charts">Gráficos</button>
    <button class="tab" data-tab="config">Configuración</button>
    <button class="tab" data-tab="diag">Diagnóstico</button>
  </div>

  <!-- ============ DASHBOARD ============ -->
  <section data-pane="dash">
    <div class="modecard">
      <div><div class="l">Modo del inversor</div><div class="v" id="invMode">—</div></div>
      <div style="text-align:right"><div class="l">Hora</div><div class="v" id="clock" style="font-variant-numeric:tabular-nums">—</div></div>
    </div>
    <div class="grid" id="grid"></div>
  </section>

  <!-- ============ CHARTS ============ -->
  <section data-pane="charts" style="display:none">
    <div class="panel"><h3>Producción solar (últimas 2 h)</h3><svg id="chPv" class="chart" preserveAspectRatio="none"></svg></div>
    <div class="panel"><h3>Consumo de la casa (últimas 2 h)</h3><svg id="chLoad" class="chart" preserveAspectRatio="none"></svg></div>
    <div class="panel"><h3>Estado de batería SOC %</h3><svg id="chSoc" class="chart" preserveAspectRatio="none"></svg></div>
    <div class="panel"><h3>Totales hoy</h3><div id="totalsBox" class="formgrid"></div></div>
  </section>

  <!-- ============ CONFIG ============ -->
  <section data-pane="config" style="display:none">
    <div class="panel">
      <h3>⚡ Sistema fotovoltaico</h3>
      <div class="formgrid">
        <div><label>Potencia del arreglo (kWp)</label><input id="cf_kwp" type="number" step="0.1"></div>
        <div><label>N° de paneles</label><input id="cf_pc" type="number"></div>
        <div><label>Watts por panel</label><input id="cf_pw" type="number"></div>
        <div><label>Capacidad de batería (kWh)</label><input id="cf_bat" type="number" step="0.1"></div>
        <div><label>Acimut (°)</label><input id="cf_az" type="number"></div>
        <div><label>Inclinación (°)</label><input id="cf_ti" type="number"></div>
        <div><label>Pérdidas (%)</label><input id="cf_lo" type="number"></div>
        <div><label>Latitud</label><input id="cf_la" type="number" step="0.0001"></div>
        <div><label>Longitud</label><input id="cf_ln" type="number" step="0.0001"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px"><button class="btn" onclick="savePvCfg()">Guardar</button></div>
    </div>
  </section>

  <!-- ============ DIAG ============ -->
  <section data-pane="diag" style="display:none">
    <div class="panel"><h3>📋 Especificación del inversor</h3><div id="specRows"></div></div>
    <div class="panel"><h3>🌐 Red</h3><div id="netRows"></div></div>
    <div class="panel"><h3>🖥️ Sistema</h3><div id="sysRows"></div></div>
    <div class="panel"><h3>🔌 USB</h3><div id="usbList" class="usblist">—</div></div>
    <div class="panel">
      <h3>🔑 Token / Activación</h3>
      <div id="actBlock"></div>
    </div>
  </section>
</div>

<button class="editmode-toggle" id="editBtn" onclick="toggleEdit()">✏️ Personalizar</button>

<script>
// ====== State ======
let STATE = null;
let EDIT = false;
const LS_KEY = 'solarops.local.layout.v2';
const DEFAULT_LAYOUT = [
  { id: 'pv',       w: 4 },
  { id: 'load',     w: 4 },
  { id: 'battery',  w: 4 },
  { id: 'backup',   w: 6 },
  { id: 'rings',    w: 6 },
  { id: 'flow',     w: 12 },
  { id: 'grid',     w: 4 },
  { id: 'mode',     w: 4 },
  { id: 'temp',     w: 4 },
  { id: 'totals',   w: 12 },
];
function loadLayout(){
  try{ const v=JSON.parse(localStorage.getItem(LS_KEY)); if(Array.isArray(v)&&v.length) return v;}catch(e){}
  return DEFAULT_LAYOUT.slice();
}
function saveLayout(l){ localStorage.setItem(LS_KEY, JSON.stringify(l)); }
let LAYOUT = loadLayout();

// ====== Tabs ======
document.getElementById('tabs').addEventListener('click', e=>{
  if(!e.target.matches('.tab')) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  e.target.classList.add('active');
  const k=e.target.dataset.tab;
  document.querySelectorAll('section[data-pane]').forEach(s=>s.style.display=s.dataset.pane===k?'':'none');
});

// ====== Edit mode ======
function toggleEdit(){
  EDIT=!EDIT;
  document.body.classList.toggle('editing',EDIT);
  document.getElementById('editBtn').textContent = EDIT?'✓ Listo':'✏️ Personalizar';
}

// ====== Widget renderers ======
function fmt(v,d=0){ if(v==null||isNaN(v)) return '—'; return Number(v).toFixed(d); }
function kw(w){ if(w==null) return '—'; const k=w/1000; return k.toFixed(k>=10?1:2); }
// Formato completo en W con separador de miles, sin abreviar.
function wFull(w){ if(w==null||isNaN(w)) return '—'; return Math.round(Number(w)).toLocaleString('es-CL'); }

function widgetHTML(id){
  const L=STATE&&STATE.latest||{};
  const pvW=Number(L.pv_input_power||0), loadW=Number(L.ac_output_active_power||0);
  const soc=Number(L.battery_capacity||0), batV=Number(L.battery_voltage||0);
  const gridV=Number(L.grid_voltage||0), gridF=Number(L.grid_frequency||0);
  const temp=Number(L.inverter_temperature||0);
  const acV=Number(L.ac_output_voltage||0);
  const charging=pvW>loadW;

  switch(id){
    case 'pv': return solarPanelsCard(pvW);
    case 'load': return houseCard(loadW);
    case 'battery': return batteryCard(soc,batV,charging);
    case 'backup': return backupCard(soc,loadW,pvW);
    case 'rings': return ringsCard(pvW,loadW,soc);
    case 'flow': return flowCard(pvW,loadW,gridV,soc,batV);
    case 'grid': return gridCard(gridV,gridF);
    case 'mode': return statTile('🔌','Modo',L.inverter_mode||'—','Salida AC: '+fmt(acV,1)+' V');
    case 'temp': return statTile('🌡️','Temperatura',fmt(temp,1)+'°C',temp>60?'Alta':'Normal');
    case 'totals': return totalsCard();
  }
  return '<div class="body">—</div>';
}

function statTile(emoji,label,big,sub){
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">${emoji}</span>${label}</div></div>
    <div class="big">${big}</div><div class="sub2">${sub||''}</div></div>`;
}

function solarPanelsCard(pvW){
  const intensity = Math.min(1, pvW/3000);
  const rays = Math.round(20+intensity*60);
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">☀️</span>Producción solar</div><div class="v">${pvW>50?'Generando':'En reposo'}</div></div>
    <svg viewBox="0 0 220 110" style="width:100%;height:auto;max-height:140px">
      <defs><radialGradient id="sun"><stop offset="0%" stop-color="#fde047"/><stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/></radialGradient></defs>
      <circle cx="40" cy="34" r="${14+intensity*8}" fill="#fbbf24" style="filter:drop-shadow(0 0 ${rays/4}px #fbbf24)"/>
      <circle cx="40" cy="34" r="${24+intensity*14}" fill="url(#sun)" opacity="${.4+intensity*.4}"/>
      <g stroke="#fbbf24" stroke-width="2" stroke-linecap="round" opacity="${intensity}">
        ${[0,45,90,135,180,225,270,315].map(a=>{const r1=20+intensity*4,r2=r1+8;const x1=40+Math.cos(a*Math.PI/180)*r1,y1=34+Math.sin(a*Math.PI/180)*r1;const x2=40+Math.cos(a*Math.PI/180)*r2,y2=34+Math.sin(a*Math.PI/180)*r2;return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`}).join('')}
      </g>
      <!-- panels -->
      <g transform="translate(105 50)">
        ${[0,1].map(r=>[0,1,2].map(c=>{const x=c*32,y=r*22;const lit=intensity>0.05;return `
          <rect x="${x}" y="${y}" width="28" height="18" rx="2" fill="${lit?'#1e3a5f':'#1a2335'}" stroke="#0f1729" stroke-width="1"/>
          <line x1="${x+9}" y1="${y}" x2="${x+9}" y2="${y+18}" stroke="#0f1729" stroke-width=".5"/>
          <line x1="${x+19}" y1="${y}" x2="${x+19}" y2="${y+18}" stroke="#0f1729" stroke-width=".5"/>
          <line x1="${x}" y1="${y+9}" x2="${x+28}" y2="${y+9}" stroke="#0f1729" stroke-width=".5"/>
          ${lit?`<rect x="${x}" y="${y}" width="28" height="18" rx="2" fill="#fbbf24" opacity="${.05+intensity*.25}"><animate attributeName="opacity" values="${.05+intensity*.15};${.1+intensity*.4};${.05+intensity*.15}" dur="2.4s" repeatCount="indefinite"/></rect>`:''}
        `}).join('')).join('')}
      </g>
    </svg>
    <div class="big" style="color:var(--pv);text-shadow:0 0 24px rgba(245,158,11,.35)">${wFull(pvW)}<span class="unit">W</span></div>
    <div class="sub2">${kw(pvW)} kW · arreglo solar</div>
  </div>`;
}

function houseCard(loadW){
  const intensity = Math.min(1, loadW/3000);
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">🏠</span>Consumo de la casa</div><div class="v">${loadW>30?'Activo':'Mínimo'}</div></div>
    <svg viewBox="0 0 220 110" style="width:100%;height:auto;max-height:140px">
      <!-- modern house -->
      <g transform="translate(60 18)">
        <!-- roof -->
        <polygon points="0,40 50,5 100,40" fill="#2c3349" stroke="#3a4262" stroke-width="1"/>
        <!-- body -->
        <rect x="6" y="38" width="88" height="50" fill="#3b82f6" opacity=".18" stroke="#3b82f6" stroke-width="1.2" rx="2"/>
        <rect x="6" y="38" width="88" height="50" fill="none" stroke="#3b82f6" stroke-width="1.2" rx="2"/>
        <!-- door -->
        <rect x="42" y="60" width="16" height="28" fill="#1a2335" stroke="#3b82f6" stroke-width="1" rx="1"/>
        <circle cx="54" cy="74" r="1.4" fill="#fbbf24"/>
        <!-- windows -->
        <g fill="${loadW>50?'#fbbf24':'#1a2335'}" stroke="#3b82f6" stroke-width=".8">
          <rect x="14" y="46" width="14" height="12" rx="1" opacity="${.3+intensity*.7}">
            ${loadW>50?'<animate attributeName="opacity" values=".5;1;.5" dur="3s" repeatCount="indefinite"/>':''}
          </rect>
          <rect x="72" y="46" width="14" height="12" rx="1" opacity="${.3+intensity*.7}">
            ${loadW>50?'<animate attributeName="opacity" values=".5;1;.5" dur="2.7s" repeatCount="indefinite"/>':''}
          </rect>
        </g>
        <!-- chimney smoke when high load -->
        ${loadW>1500?`<g opacity=".5"><circle cx="78" cy="14" r="3" fill="#8a8d97"><animate attributeName="cy" values="14;-6" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values=".5;0" dur="3s" repeatCount="indefinite"/></circle></g>`:''}
      </g>
    </svg>
    <div class="big" style="color:var(--load);text-shadow:0 0 24px rgba(59,130,246,.35)">${wFull(loadW)}<span class="unit">W</span></div>
    <div class="sub2">${kw(loadW)} kW · consumo actual</div>
  </div>`;
}

function batteryCard(soc,batV,charging){
  const fill=Math.max(0,Math.min(100,soc));
  const col = fill>50?'var(--success)':fill>20?'var(--warn)':'var(--danger)';
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">🔋</span>Batería</div><div class="v">${charging?'Cargando':'Descargando'}</div></div>
    <svg viewBox="0 0 220 110" style="width:100%;height:auto;max-height:140px">
      <g transform="translate(40 25)">
        <rect x="0" y="0" width="120" height="60" rx="8" fill="none" stroke="#3a4262" stroke-width="2"/>
        <rect x="120" y="20" width="6" height="20" rx="2" fill="#3a4262"/>
        <rect x="6" y="6" width="${(108)*(fill/100)}" height="48" rx="4" fill="${col}" opacity=".75">
          ${charging?'<animate attributeName="opacity" values=".5;.95;.5" dur="1.8s" repeatCount="indefinite"/>':''}
        </rect>
        <text x="63" y="38" text-anchor="middle" fill="#fff" font-size="20" font-weight="800" font-family="inherit">${fill.toFixed(0)}%</text>
        ${charging?`<g transform="translate(140 24)"><path d="M6 0 L0 14 L5 14 L3 26 L11 12 L6 12 Z" fill="${col}"><animate attributeName="opacity" values=".4;1;.4" dur="1.2s" repeatCount="indefinite"/></path></g>`:''}
      </g>
    </svg>
    <div class="rows">
      <div class="rk"><span class="k">SOC</span><span class="v">${fill.toFixed(0)} %</span></div>
      <div class="rk"><span class="k">Voltaje</span><span class="v">${batV.toFixed(1)} V</span></div>
    </div>
  </div>`;
}

function backupCard(soc,loadW,pvW){
  const cfg = STATE&&STATE.config||{};
  const batKwh = Number(cfg.battery_kwh||0);
  const dod = Number(cfg.battery_usable_dod_pct||80)/100;
  const usable = batKwh*(soc/100)*dod;
  const netW = Math.max(0, loadW-pvW);
  const charging = pvW>loadW+5;
  const hours = (!charging && netW>10 && usable>0) ? (usable/(netW/1000)) : null;
  const hh = hours==null?0:Math.floor(hours);
  const mm = hours==null?0:Math.round((hours-hh)*60);
  const col = hours==null?'var(--success)':hours>6?'var(--success)':hours>2?'var(--warn)':'var(--danger)';
  const ringPct = hours==null?100:Math.min(100,(hours/12)*100);
  const r=52, c=2*Math.PI*r;
  const tag = charging?'⚡ Cargando — sin descarga':hours==null?'Configura el banco':hours>6?'● Holgado':hours>2?'● Limitado':'● Crítico';
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">⏱️</span>Tiempo de respaldo</div>
      <span class="v" style="background:color-mix(in oklab,${col} 18%,transparent);color:${col};padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700">${tag}</span></div>
    <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div style="position:relative;width:140px;height:140px;flex-shrink:0">
        <svg width="140" height="140" style="transform:rotate(-90deg)">
          <circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-opacity=".15" stroke-width="12"/>
          <circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${c}" stroke-dashoffset="${c*(1-ringPct/100)}"
            style="transition:stroke-dashoffset 1s ease;filter:drop-shadow(0 0 6px ${col})"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
          ${charging?`<div style="font-size:24px;color:${col}">⚡</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-top:2px">cargando</div>`:
          hours==null?`<div style="font-size:11px;color:var(--muted);padding:0 8px">Configura el banco</div>`:
          hours>99?`<div style="font-size:24px;font-weight:800;color:${col}">99+</div><div style="font-size:10px;color:var(--muted)">horas</div>`:
          `<div style="font-size:24px;font-weight:800;color:${col};line-height:1">${hh}<span style="font-size:13px">h</span> ${mm}<span style="font-size:13px">m</span></div><div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;margin-top:3px;letter-spacing:.05em">restantes</div>`}
        </div>
      </div>
      <div style="flex:1;min-width:140px" class="rows">
        <div class="rk"><span class="k">Energía útil</span><span class="v">${usable.toFixed(2)} kWh</span></div>
        <div class="rk"><span class="k">Descarga neta</span><span class="v">${wFull(netW)} W</span></div>
        <div class="rk"><span class="k">Banco</span><span class="v">${batKwh||'—'} kWh</span></div>
        <div class="rk"><span class="k">DoD útil</span><span class="v">${(dod*100).toFixed(0)} %</span></div>
      </div>
    </div>
  </div>`;
}

function ringsCard(pvW,loadW,soc){
  const rings = [
    {c:'#f59e0b', v:Math.min(1,pvW/5000), l:'PV'},
    {c:'#3b82f6', v:Math.min(1,loadW/5000), l:'Carga'},
    {c:'#22c55e', v:soc/100, l:'SOC'},
  ];
  const cx=80,cy=80; let html='';
  rings.forEach((r,i)=>{const rad=66-i*16; const C=2*Math.PI*rad;
    html+=`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${r.c}" stroke-opacity=".18" stroke-width="11"/>
    <circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${r.c}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C*(1-r.v)}" transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset .8s;filter:drop-shadow(0 0 4px ${r.c})"/>`;
  });
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">⭕</span>Vista general</div></div>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center">
      <svg viewBox="0 0 160 160" style="width:160px;height:160px">${html}</svg>
      <div class="rows" style="flex:1;min-width:140px">
        <div class="rk"><span class="k" style="color:var(--pv)">● PV</span><span class="v">${wFull(pvW)} W</span></div>
        <div class="rk"><span class="k" style="color:var(--load)">● Carga</span><span class="v">${wFull(loadW)} W</span></div>
        <div class="rk"><span class="k" style="color:var(--success)">● SOC</span><span class="v">${soc.toFixed(0)} %</span></div>
      </div>
    </div>
  </div>`;
}

function flowCard(pvW,loadW,gridV,soc,batV){
  const gridOn = gridV>50;
  const charging = pvW>loadW;
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">🔄</span>Flujo de energía</div></div>
    <svg viewBox="0 0 600 220" style="width:100%;height:auto">
      <defs>
        <marker id="ah" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <circle cx="3" cy="3" r="2.5" fill="#fff"/>
        </marker>
      </defs>
      <!-- Nodes -->
      <g font-family="inherit" font-size="11" font-weight="700" fill="#fff">
        <!-- PV -->
        <g transform="translate(40 20)"><rect width="120" height="60" rx="12" fill="#1e3a5f" stroke="#f59e0b" stroke-width="1.5"/>
          <text x="60" y="28" text-anchor="middle" fill="#f59e0b">☀ Solar</text>
          <text x="60" y="48" text-anchor="middle">${wFull(pvW)} W</text></g>
        <!-- Inverter -->
        <g transform="translate(240 80)"><rect width="120" height="60" rx="12" fill="#2c3349" stroke="#f5b945" stroke-width="1.5"/>
          <text x="60" y="28" text-anchor="middle" fill="#f5b945">⚡ Inversor</text>
          <text x="60" y="48" text-anchor="middle">${batV.toFixed(1)} V</text></g>
        <!-- Battery -->
        <g transform="translate(440 20)"><rect width="120" height="60" rx="12" fill="#1a3c2a" stroke="#22c55e" stroke-width="1.5"/>
          <text x="60" y="28" text-anchor="middle" fill="#22c55e">🔋 Batería</text>
          <text x="60" y="48" text-anchor="middle">${soc.toFixed(0)}%</text></g>
        <!-- Grid -->
        <g transform="translate(40 140)"><rect width="120" height="60" rx="12" fill="#3c1a1a" stroke="#ef4444" stroke-width="1.5"/>
          <text x="60" y="28" text-anchor="middle" fill="#ef4444">⚡ Red</text>
          <text x="60" y="48" text-anchor="middle">${gridOn?gridV.toFixed(0)+' V':'Sin red'}</text></g>
        <!-- Load -->
        <g transform="translate(440 140)"><rect width="120" height="60" rx="12" fill="#1a2440" stroke="#3b82f6" stroke-width="1.5"/>
          <text x="60" y="28" text-anchor="middle" fill="#3b82f6">🏠 Casa</text>
          <text x="60" y="48" text-anchor="middle">${wFull(loadW)} W</text></g>
      </g>
      <!-- Animated lines -->
      <g fill="none" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="8 8">
        ${pvW>30?`<path d="M160 50 Q200 50 240 110" stroke="#f59e0b"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.2s" repeatCount="indefinite"/></path>`:`<path d="M160 50 Q200 50 240 110" stroke="#3a4262"/>`}
        ${loadW>30?`<path d="M360 110 Q400 170 440 170" stroke="#3b82f6"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.2s" repeatCount="indefinite"/></path>`:`<path d="M360 110 Q400 170 440 170" stroke="#3a4262"/>`}
        ${charging?`<path d="M360 110 Q400 50 440 50" stroke="#22c55e"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.2s" repeatCount="indefinite"/></path>`:`<path d="M440 50 Q400 50 360 110" stroke="#22c55e" opacity=".5"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.4s" repeatCount="indefinite"/></path>`}
        ${gridOn?`<path d="M160 170 Q200 170 240 110" stroke="#ef4444"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.4s" repeatCount="indefinite"/></path>`:`<path d="M160 170 Q200 170 240 110" stroke="#3a4262"/>`}
      </g>
    </svg>
  </div>`;
}

function gridCard(gridV,gridF){
  const on = gridV>50;
  const points = Array.from({length:80},(_,i)=>{const x=i*7.5;const y=30+(on?Math.sin(i*0.5)*16:0);return `${x},${y}`}).join(' ');
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">⚡</span>Red eléctrica</div><div class="v">${on?'Conectada':'Sin red'}</div></div>
    <svg viewBox="0 0 600 60" style="width:100%;height:60px">
      <polyline points="${points}" fill="none" stroke="${on?'var(--grid)':'#3a4262'}" stroke-width="2.4" stroke-linecap="round" style="filter:${on?'drop-shadow(0 0 4px var(--grid))':'none'}"/>
    </svg>
    <div class="rows">
      <div class="rk"><span class="k">Voltaje</span><span class="v">${gridV.toFixed(1)} V</span></div>
      <div class="rk"><span class="k">Frecuencia</span><span class="v">${gridF.toFixed(2)} Hz</span></div>
    </div>
  </div>`;
}

function totalsCard(){
  const t = STATE&&STATE.totals_today||{};
  const items=[
    {k:'pv_kwh',l:'☀️ Producción', c:'var(--pv)'},
    {k:'load_kwh',l:'🏠 Consumo', c:'var(--load)'},
    {k:'battery_charged_kwh',l:'🔋↑ Cargado', c:'var(--success)'},
    {k:'battery_discharged_kwh',l:'🔋↓ Descargado', c:'var(--warn)'},
    {k:'grid_used_kwh',l:'⚡ Red', c:'var(--grid)'},
  ];
  return `<div class="body">
    <div class="wh"><div class="t"><span class="icon">📊</span>Totales hoy</div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:6px">
      ${items.map(i=>`<div style="background:var(--card2);padding:14px 12px;border-radius:10px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600">${i.l}</div>
        <div style="font-size:20px;font-weight:800;color:${i.c};font-variant-numeric:tabular-nums">${(Number(t[i.k]||0)).toFixed(2)}</div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase">kWh</div></div>`).join('')}
    </div>
  </div>`;
}

// ====== Render grid (sin parpadeo) ======
// Sólo reconstruye DOM cuando cambia el LAYOUT. Para refrescos de datos
// reemplaza únicamente el body de cada widget si su HTML cambió.
let LAST_LAYOUT_KEY = '';
function buildGrid(){
  const g = document.getElementById('grid');
  g.innerHTML = '';
  LAYOUT.forEach((item,idx)=>{
    const tile=document.createElement('div');
    tile.className='tile';
    tile.style.gridColumn=`span ${item.w}`;
    tile.dataset.idx=idx;
    tile.dataset.id=item.id;
    tile.draggable=true;
    const bodyHTML = widgetHTML(item.id);
    tile.innerHTML = `
      <div class="handle" title="Arrastrar">⋮⋮</div>
      <div class="toolbar">
        ${[3,6,9,12].map(w=>`<button class="tbtn ${item.w===w?'act':''}" onclick="resizeTile(${idx},${w})">${(w/12*100)|0}%</button>`).join('')}
      </div>
      <div class="widget-body" data-rendered="${escapeAttr(bodyHTML)}">${bodyHTML}</div>`;
    tile.addEventListener('dragstart',e=>{ tile.classList.add('dragging'); e.dataTransfer.setData('text/plain',idx); e.dataTransfer.effectAllowed='move';});
    tile.addEventListener('dragend',()=>tile.classList.remove('dragging'));
    tile.addEventListener('dragover',e=>{e.preventDefault();tile.classList.add('over')});
    tile.addEventListener('dragleave',()=>tile.classList.remove('over'));
    tile.addEventListener('drop',e=>{
      e.preventDefault(); tile.classList.remove('over');
      const from=Number(e.dataTransfer.getData('text/plain')); const to=Number(tile.dataset.idx);
      if(isNaN(from)||from===to) return;
      const next=LAYOUT.slice(); const [m]=next.splice(from,1); next.splice(to,0,m);
      LAYOUT=next; saveLayout(LAYOUT); LAST_LAYOUT_KEY=''; renderGrid();
    });
    g.appendChild(tile);
  });
}
function escapeAttr(s){ return ''; /* sin uso real, sólo para evitar reflow */ }
function updateGridBodies(){
  const g = document.getElementById('grid'); if(!g) return;
  const tiles = g.querySelectorAll('.tile');
  tiles.forEach((tile,idx)=>{
    const item = LAYOUT[idx]; if(!item) return;
    const body = tile.querySelector('.widget-body'); if(!body) return;
    const next = widgetHTML(item.id);
    // Sólo reemplaza si realmente cambió el HTML — evita parpadeo cuando
    // los valores son idénticos entre ticks.
    if (body.__last !== next) {
      body.innerHTML = next;
      body.__last = next;
    }
  });
}
function renderGrid(){
  const key = LAYOUT.map(i=>i.id+':'+i.w).join('|');
  if (key !== LAST_LAYOUT_KEY) {
    LAST_LAYOUT_KEY = key;
    buildGrid();
  } else {
    updateGridBodies();
  }
}
function resizeTile(idx,w){ LAYOUT[idx].w=w; saveLayout(LAYOUT); LAST_LAYOUT_KEY=''; renderGrid(); }
window.resizeTile=resizeTile;

// ====== Charts (re-render sólo si cambió la data) ======
const _CHART_CACHE = {};
function drawChart(id, points, color){
  const svg=document.getElementById(id); if(!svg) return;
  const sig = id+':'+color+':'+points.map(v=>v==null?'_':Number(v).toFixed(0)).join(',');
  if (_CHART_CACHE[id] === sig) return;
  _CHART_CACHE[id] = sig;
  const W=600,H=200; svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  if(!points.length){ svg.innerHTML=`<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#8a8d97" font-size="12">Sin datos aún</text>`; return; }
  const xs=points.map((_,i)=>i*W/Math.max(1,points.length-1));
  const ys=points.map(v=>v==null?null:v);
  const max=Math.max(1,...ys.filter(v=>v!=null)); const min=Math.min(0,...ys.filter(v=>v!=null));
  const sc=v=>H-10-(v-min)/(max-min||1)*(H-20);
  let d=''; let started=false;
  ys.forEach((y,i)=>{ if(y==null) return; const px=xs[i],py=sc(y); d+=(started?'L':'M')+px+' '+py+' '; started=true; });
  let area=d?d+`L${xs[xs.length-1]} ${H} L0 ${H} Z`:'';
  svg.innerHTML = `
    <defs><linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".4"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${area?`<path d="${area}" fill="url(#${id}g)"/>`:''}
    ${d?`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`:''}`;
}

let _LAST_TOTALS_HTML = '';
function renderCharts(){
  const h = STATE&&STATE.history||[];
  drawChart('chPv', h.map(p=>p.pv), '#f59e0b');
  drawChart('chLoad', h.map(p=>p.load), '#3b82f6');
  drawChart('chSoc', h.map(p=>p.soc), '#22c55e');
  const t = STATE&&STATE.totals_today||{};
  const html = [['☀️ PV','pv_kwh','#f59e0b'],['🏠 Carga','load_kwh','#3b82f6'],['🔋↑','battery_charged_kwh','#22c55e'],['🔋↓','battery_discharged_kwh','#f59e0b'],['⚡ Red','grid_used_kwh','#ef4444']]
    .map(([l,k,c])=>`<div style="background:var(--card2);padding:14px;border-radius:10px;text-align:center;border:1px solid var(--border)"><div style="color:var(--muted);font-size:11px">${l}</div><div style="font-size:22px;font-weight:800;color:${c};margin-top:4px">${(Number(t[k]||0)).toFixed(2)}</div><div style="font-size:10px;color:var(--muted)">kWh</div></div>`).join('');
  if (html !== _LAST_TOTALS_HTML) { document.getElementById('totalsBox').innerHTML = html; _LAST_TOTALS_HTML = html; }
}

// ====== Diagnostics (sólo actualiza si cambió) ======
const _DIAG_CACHE = {};
function setHTMLIfChanged(id, html){
  if (_DIAG_CACHE[id] === html) return;
  _DIAG_CACHE[id] = html;
  const el = document.getElementById(id); if (el) el.innerHTML = html;
}
function renderDiag(){
  const sn=STATE&&STATE.snapshot||{}, sp=STATE&&STATE.spec||{};
  const rows=(o,keys)=>keys.map(([k,l])=>`<div class="row"><span class="k">${l}</span><span class="v">${o[k]??'—'}</span></div>`).join('');
  setHTMLIfChanged('specRows', rows(sp,[
    ['driver','Driver'],['model_name','Modelo'],['serial_number','Serial'],['firmware','Firmware'],
    ['nominal_battery_voltage','Batería nominal (V)'],['max_ac_output_power','Pot. máx AC (W)'],['topology','Topología']]));
  setHTMLIfChanged('netRows', rows(sn,[
    ['ssid','SSID'],['ip_eth','IP eth0'],['ip_wlan','IP wlan0'],['ip_public','IP pública'],
    ['internet_up','Internet']]));
  setHTMLIfChanged('sysRows', rows(sn,[
    ['cpu_temp_c','CPU °C'],['storage_used_pct','Disco %'],['storage_total_gb','Disco total (GB)'],
    ['board_model','Placa'],['agent_version','Agente']]));
  const usbs = sn.usb_devices_list||[];
  setHTMLIfChanged('usbList', usbs.length
    ? usbs.map(u=>`<div>${u}</div>`).join('')
    : '<div style="color:var(--muted)">Sin dispositivos USB</div>');

  const tokenSet = STATE&&STATE.config&&STATE.config.device_token;
  setHTMLIfChanged('actBlock', tokenSet
    ? `<div class="row"><span class="k">Estado</span><span class="v" style="color:var(--success)">● Activado</span></div>
       <div class="row"><span class="k">Plan</span><span class="v">${STATE.license&&STATE.license.plan||'—'}</span></div>
       <div class="row"><span class="k">Cloud URL</span><span class="v"><span class="code">${(STATE.config&&STATE.config.cloud_url)||''}</span></span></div>`
    : `<form onsubmit="event.preventDefault();activateDevice()">
        <label>Código de licencia</label><input id="actCode" required placeholder="Pega el código aquí">
        <label>Nombre del sitio</label><input id="actName" value="Local site">
        <button class="btn" type="submit">Activar</button></form>`);
}
async function activateDevice(){
  const code=document.getElementById('actCode').value.trim();
  const name=document.getElementById('actName').value.trim()||'Local site';
  try {
    await fetchJSON('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,name})});
    alert('Activado ✓'); refresh();
  } catch(e) { alert('Error: '+e.message); }
}
window.activateDevice=activateDevice;

// ====== Helper: fetch JSON con manejo de errores claro ======
async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  const ct = (r.headers.get('content-type')||'').toLowerCase();
  if (!r.ok) {
    let detail = '';
    try { detail = ct.includes('json') ? JSON.stringify(await r.json()) : (await r.text()).slice(0,140); } catch(_){}
    throw new Error('HTTP '+r.status+(detail?(' · '+detail):''));
  }
  if (!ct.includes('application/json')) {
    const txt = (await r.text()).slice(0,140);
    throw new Error('Respuesta no-JSON desde '+url+' (¿agente sin reiniciar?): '+txt);
  }
  return r.json();
}

// ====== Config ======
async function loadPvCfg(){
  try {
    const c = await fetchJSON('/api/pvconfig') || {};
    ['kwp','pc','pw','bat','az','ti','lo','la','ln'].forEach((k,i)=>{
      const map=['array_kwp','panel_count','panel_watts','battery_kwh','azimuth','tilt','system_losses_pct','latitude','longitude'];
      const el=document.getElementById('cf_'+k); if(el && c[map[i]]!=null) el.value=c[map[i]];
    });
  } catch(e) { console.warn('loadPvCfg:', e.message); }
}
async function savePvCfg(){
  const map={'cf_kwp':'array_kwp','cf_pc':'panel_count','cf_pw':'panel_watts','cf_bat':'battery_kwh',
    'cf_az':'azimuth','cf_ti':'tilt','cf_lo':'system_losses_pct','cf_la':'latitude','cf_ln':'longitude'};
  const body={}; Object.entries(map).forEach(([id,k])=>{const v=document.getElementById(id).value; if(v!=='') body[k]=Number(v)});
  try {
    await fetchJSON('/api/pvconfig',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    alert('Guardado ✓');
  } catch(e) { alert('Error: '+e.message); }
}
window.savePvCfg=savePvCfg;

// ====== Refresh loop ======
async function refresh(){
  try{
    STATE = await fetchJSON('/api/state');
    const dot=document.getElementById('conDot'), txt=document.getElementById('conTxt');
    const fresh = STATE.latest&&STATE.latest.recorded_at;
    dot.className='dot '+(fresh?'on':'off');
    txt.textContent = fresh?'En vivo · cada 2 s':'Sin datos del inversor';
    document.getElementById('lastSeen').textContent = fresh?('Última lectura: '+new Date(fresh).toLocaleTimeString()):'';
    document.getElementById('invMode').textContent = (STATE.latest&&STATE.latest.inverter_mode)||'—';
    document.getElementById('modeBadge').textContent = 'Modo: '+((STATE.latest&&STATE.latest.inverter_mode)||'—');
    document.getElementById('planBadge').textContent = 'Plan: '+((STATE.license&&STATE.license.plan)||'local');
    document.getElementById('siteName').textContent = (STATE.license&&STATE.license.site_name)||'SolarOps Local';
    document.getElementById('actBanner').style.display = (STATE.config&&STATE.config.device_token)?'none':'';
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
    renderGrid();
    renderCharts();
    renderDiag();
  }catch(e){
    document.getElementById('conDot').className='dot off';
    document.getElementById('conTxt').textContent='Error: '+e.message;
    console.error('refresh failed:', e);
  }
}
document.getElementById('actLink').onclick=e=>{e.preventDefault();document.querySelector('[data-tab=diag]').click()};
loadPvCfg();
refresh();
setInterval(refresh, 2000);
setInterval(()=>{document.getElementById('clock').textContent=new Date().toLocaleTimeString()}, 1000);
</script></body></html>"""

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
        def _num(v):
            try: return float(v)
            except (TypeError, ValueError): return 0.0
        def avg(k): return (_num(a.get(k)) + _num(b.get(k))) / 2.0
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

    # Cualquier excepción dentro de un endpoint /api/* debe devolver JSON,
    # nunca el HTML por defecto de Flask. Si no, el frontend ve "Respuesta
    # no-JSON" o `<!doctype html>...500 Internal Server Error` crudo.
    @app.errorhandler(Exception)
    def _json_errors(err):
        from werkzeug.exceptions import HTTPException
        path = request.path or ""
        if not path.startswith("/api/"):
            # rutas HTML: re-lanzar para que Flask siga su flujo normal
            if isinstance(err, HTTPException):
                return err
            raise err
        import traceback
        tb = traceback.format_exc(limit=6)
        try: print(f"[api error] {path}: {err}\n{tb}", flush=True)
        except Exception: pass
        status = err.code if isinstance(err, HTTPException) else 500
        return jsonify({
            "ok": False,
            "error": str(err) or err.__class__.__name__,
            "where": path,
        }), status

    # Build / boot id — cambia cada arranque del agente. Se usa para invalidar
    # cachés del navegador después de un solarops-update.
    BOOT_ID = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    # URL pública del dashboard cloud que sirve la UI compartida.
    CLOUD_BASE = os.environ.get(
        "SOLAROPS_CLOUD_URL",
        "https://solar-heartbeat-sync.lovable.app",
    ).rstrip("/")

    @app.after_request
    def _no_store_and_cors(resp):
        path = request.path or ""
        # Evita que el navegador sirva /api/* desde caché.
        if path.startswith("/api/") or path in ("/", "/status", "/legacy"):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        # CORS para que el iframe del dashboard cloud (otro origin) pueda
        # leer /api/state, /api/pvconfig, etc. desde el agente local.
        if path.startswith("/api/"):
            resp.headers["Access-Control-Allow-Origin"] = "*"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            resp.headers["Access-Control-Max-Age"] = "86400"
        resp.headers["X-SolarOps-Boot"] = BOOT_ID
        return resp

    # Preflight CORS para cualquier endpoint /api/*
    @app.route("/api/<path:_p>", methods=["OPTIONS"])
    def _api_options(_p):
        return ("", 204)

    @app.get("/")
    def index():
        # Wrapper híbrido: intentamos cargar el dashboard cloud en un iframe
        # (parity 100% con la UI online). Si no hay internet o el cloud no
        # responde en 4 s, caemos automáticamente a /legacy (la UI Flask
        # local que funciona 100% offline).
        return render_template_string(WRAPPER_PAGE, cloud_base=CLOUD_BASE, boot_id=BOOT_ID)

    @app.get("/legacy")
    def legacy_index():
        # UI Flask local — fallback offline / sin internet.
        return render_template_string(PAGE, boot_id=BOOT_ID)

    @app.get("/api/health")
    def health():
        # Endpoint ligero para validar que el agente está vivo antes de
        # intentar cargar el dashboard. Pensado para que el wrapper híbrido
        # (y cualquier monitor externo) decida si mostrar UI o fallback.
        with agent.lock:
            latest = dict(agent.latest)
            license = dict(agent.license)
            cfg = dict(agent.config)
        recorded_at = latest.get("recorded_at")
        fresh = False
        if recorded_at:
            try:
                t = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
                fresh = (datetime.now(timezone.utc) - t).total_seconds() < 60
            except Exception:
                fresh = False
        return jsonify({
            "ok": True,
            "boot_id": BOOT_ID,
            "has_inverter_data": bool(recorded_at),
            "fresh": fresh,
            "last_recorded_at": recorded_at,
            "site_id": license.get("site_id"),
            "site_name": license.get("site_name"),
            "plan": license.get("plan"),
            "activated": bool(cfg.get("device_token")),
            "cloud_url": cfg.get("cloud_url"),
            "ui_mode": cfg.get("ui_mode") or "modern",
            # Diagnóstico del push al cloud — útil para detectar cuándo el
            # inversor está leyendo OK localmente pero el cloud no recibe.
            "push": {
                "queue_size": agent.pending.qsize(),
                "ok_count": agent.push_ok_count,
                "fail_count": agent.push_fail_count,
                "last_ok_at": agent.push_last_ok_at,
                "last_attempt_at": agent.push_last_attempt_at,
                "last_error": agent.push_last_error,
                "loop_restarts": agent.push_loop_restarts,
            },
            # Diagnóstico de la conexión al inversor para el badge del frontend.
            "inverter": {
                "state": agent.inverter_state,
                "connected": bool(agent.transport),
                "transport": getattr(agent.transport, "kind", None) if agent.transport else None,
                "port": getattr(agent.transport, "path", None) if agent.transport else cfg.get("inverter_port"),
                "connected_at": agent.inverter_connected_at,
                "reconnect_count": agent.inverter_reconnect_count,
                "consecutive_empty": agent.inverter_consecutive_empty,
                "read_count": agent.read_count,
                "error_count": agent.error_count,
                "last_sample_at": agent.last_sample_at,
                "last_error": agent.last_error,
                "last_error_at": agent.last_error_at,
            },
        })

    @app.get("/api/internet")
    def api_internet():
        # Probe rápido server-side: evita CORS/mixed-content desde el navegador.
        return jsonify({"online": internet_up()})

    # ---------- WiFi (estilo Solar Assistant) ----------
    @app.get("/wifi")
    def wifi_page():
        return render_template_string(WIFI_PAGE)

    @app.get("/api/wifi/status")
    def wifi_status():
        return jsonify({
            "ssid": get_ssid(),
            "ip_wlan": get_ip("wlan0"),
            "ip_eth": get_ip("eth0"),
            "internet_up": internet_up(),
        })

    @app.get("/api/wifi/scan")
    def wifi_scan():
        # Forzar rescan y listar — requiere NetworkManager (nmcli)
        subprocess.run(["nmcli", "device", "wifi", "rescan"],
                       capture_output=True, timeout=8)
        out = _run(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,IN-USE",
                    "device", "wifi", "list"], timeout=8)
        nets = []
        seen = set()
        for ln in out.splitlines():
            # nmcli -t separa por ':' y escapa ':' literales como '\:'
            parts = [p.replace("\\:", ":") for p in ln.split(":")]
            if len(parts) < 3: continue
            ssid = parts[0].strip()
            if not ssid or ssid in seen: continue
            seen.add(ssid)
            try: signal = int(parts[1])
            except Exception: signal = 0
            sec = parts[2].strip() or "—"
            in_use = (len(parts) > 3 and parts[3].strip() == "*")
            nets.append({"ssid": ssid, "signal": signal,
                         "security": sec, "in_use": in_use})
        nets.sort(key=lambda n: n["signal"], reverse=True)
        if not nets:
            return jsonify({"networks": [], "error":
                "No se pudo escanear (¿NetworkManager/nmcli instalado?)."})
        return jsonify({"networks": nets})

    @app.post("/api/wifi/connect")
    def wifi_connect():
        body = request.get_json(force=True) or {}
        ssid = (body.get("ssid") or "").strip()
        pwd = (body.get("password") or "")
        if not ssid:
            return jsonify({"error": "missing ssid"}), 400
        cmd = ["nmcli", "device", "wifi", "connect", ssid]
        if pwd:
            cmd += ["password", pwd]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
        if r.returncode != 0:
            return jsonify({"error": (r.stderr or r.stdout or "Error desconocido").strip()}), 400
        return jsonify({"ok": True, "ssid": ssid, "ip_wlan": get_ip("wlan0")})

    @app.post("/api/wifi/forget")
    def wifi_forget():
        body = request.get_json(force=True) or {}
        ssid = (body.get("ssid") or "").strip()
        if not ssid:
            return jsonify({"error": "missing ssid"}), 400
        r = subprocess.run(["nmcli", "connection", "delete", ssid],
                           capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return jsonify({"error": (r.stderr or r.stdout).strip()}), 400
        return jsonify({"ok": True})

    @app.get("/api/mode")
    def get_mode():
        return jsonify({"ui_mode": agent.config.get("ui_mode") or "modern"})

    @app.post("/api/mode")
    def set_mode():
        body = request.get_json(force=True) or {}
        mode = (body.get("ui_mode") or "").strip().lower()
        if mode not in ("modern", "legacy"):
            return jsonify({"error": "ui_mode must be 'modern' or 'legacy'"}), 400
        agent.config["ui_mode"] = mode
        save_config(agent.config)
        return jsonify({"ok": True, "ui_mode": mode})

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

    @app.get("/status")
    def status_page():
        return render_template_string(STATUS_PAGE)

    @app.get("/api/status")
    def status_api():
        # systemd unit status (active/inactive/failed/unknown)
        def unit(name: str) -> dict:
            try:
                act = subprocess.run(
                    ["systemctl", "is-active", name],
                    capture_output=True, text=True, timeout=2,
                ).stdout.strip() or "unknown"
                en = subprocess.run(
                    ["systemctl", "is-enabled", name],
                    capture_output=True, text=True, timeout=2,
                ).stdout.strip() or "unknown"
                return {"name": name, "active": act, "enabled": en}
            except Exception as e:
                return {"name": name, "active": "unknown", "enabled": "unknown", "error": str(e)}

        with agent.lock:
            latest = dict(agent.latest)
            last_err = agent.last_error
            last_err_at = agent.last_error_at
            last_sample_at = agent.last_sample_at
            err_count = agent.error_count
            read_count = agent.read_count
            started_at = agent.started_at
            transport_path = agent.transport.path if agent.transport else None
            transport_kind = agent.transport.kind if agent.transport else None

        # Lista de puertos candidatos detectables (USB/HID/serie)
        candidates = _candidate_ports()
        usb_devs = list_usb_devices()

        return jsonify({
            "agent": {
                "started_at": started_at,
                "version": agent.snapshot.get("agent_version") if agent.snapshot else None,
                "hardware_id": hardware_id(),
                "board": board_model(),
                "uptime_seconds": int(time.time() - time.mktime(datetime.fromisoformat(started_at.replace("Z","+00:00")).timetuple())) if started_at else None,
            },
            "transport": {
                "connected": transport_path is not None,
                "port": transport_path,
                "kind": transport_kind,
                "preferred": agent.config.get("inverter_port"),
                "candidates": candidates,
                "usb_devices": usb_devs,
            },
            "data": {
                "last_sample_at": last_sample_at,
                "read_count": read_count,
                "error_count": err_count,
                "latest": {k: latest.get(k) for k in (
                    "battery_capacity","battery_voltage","pv_input_power",
                    "ac_output_active_power","grid_voltage","inverter_mode")},
            },
            "errors": {
                "last": last_err,
                "last_at": last_err_at,
            },
            "systemd": [
                unit("solarops.service"),
                unit("solarops-kiosk.service"),
                unit("solarops-update.timer"),
                unit("solarops-update.service"),
            ],
        })

    @app.get("/manifest.webmanifest")
    def manifest():
        return jsonify({
            "name": "SolarOps Local", "short_name": "SolarOps",
            "start_url": "/", "scope": "/", "display": "standalone",
            "background_color": "#0b1220", "theme_color": "#f59e0b",
            "icons": [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable"}],
        })

    @app.get("/icon.svg")
    def icon():
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">'
               '<rect width="192" height="192" rx="40" fill="#0b1220"/>'
               '<circle cx="96" cy="96" r="34" fill="#f59e0b"/></svg>')
        return app.response_class(svg, mimetype="image/svg+xml")

    return app


STATUS_PAGE = r"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Estado local · SolarOps</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root{color-scheme:dark;--bg:#0b1220;--card:#111827;--border:#1f2937;--fg:#e5e7eb;--mut:#9ca3af;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444;--accent:#f59e0b}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto;background:var(--bg);color:var(--fg)}
header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:#0f172a}
h1{margin:0;font-size:18px;font-weight:600}h2{margin:0 0 12px;font-size:13px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
a{color:var(--accent);text-decoration:none}main{padding:20px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));max-width:1400px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px}
.row:last-child{border:0}.k{color:var(--mut)}.v{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;text-align:right;word-break:break-all;max-width:60%}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase}
.ok{background:rgba(34,197,94,.15);color:var(--ok)}.warn{background:rgba(245,158,11,.15);color:var(--warn)}.err{background:rgba(239,68,68,.15);color:var(--err)}
.mut{background:rgba(156,163,175,.15);color:var(--mut)}
.list{max-height:160px;overflow:auto;background:#0a1018;border:1px solid var(--border);border-radius:8px;padding:8px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#cbd5e1}
.err-box{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:10px;color:#fecaca;font-family:ui-monospace,Menlo,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word}
button{background:var(--accent);color:#000;border:0;padding:6px 12px;border-radius:8px;font-weight:600;cursor:pointer;font-size:12px}
.foot{padding:16px 20px;color:var(--mut);font-size:11px;text-align:center}
</style></head><body>
<header>
  <h1>⚙️ Estado local · SolarOps</h1>
  <div><a href="/wifi">📶 WiFi</a> &nbsp; <a href="/">← Dashboard</a> &nbsp; <button onclick="load()">Recargar</button></div>
</header>
<main id="root">Cargando…</main>
<div class="foot">Auto-refresh cada 5 s · Datos del agente local</div>
<script>
function pill(state){
  if(state==='active'||state==='enabled') return '<span class="pill ok">'+state+'</span>';
  if(state==='inactive'||state==='disabled') return '<span class="pill mut">'+state+'</span>';
  if(state==='failed') return '<span class="pill err">'+state+'</span>';
  return '<span class="pill warn">'+(state||'?')+'</span>';
}
function fmt(t){ if(!t) return '—'; const d=new Date(t); return d.toLocaleString(); }
function ago(t){ if(!t) return 'nunca'; const s=Math.floor((Date.now()-new Date(t).getTime())/1000);
  if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h';
  return Math.floor(s/86400)+'d'; }
async function load(){
  try{
    const r=await fetch('/api/status'); const d=await r.json();
    const t=d.transport, da=d.data, e=d.errors, ag=d.agent;
    const dataFresh = da.last_sample_at && (Date.now()-new Date(da.last_sample_at).getTime() < 30000);
    const tStatus = t.connected ? '<span class="pill ok">Conectado</span>' : '<span class="pill err">Sin puerto</span>';
    const dStatus = dataFresh ? '<span class="pill ok">En vivo</span>' : (da.last_sample_at? '<span class="pill warn">Sin datos recientes</span>':'<span class="pill err">Nunca recibió</span>');
    const html = `
      <section class="card">
        <h2>Conexión inversor (USB / Serie)</h2>
        <div class="row"><span class="k">Estado</span><span class="v">${tStatus}</span></div>
        <div class="row"><span class="k">Puerto detectado</span><span class="v">${t.port||'—'}</span></div>
        <div class="row"><span class="k">Tipo de transporte</span><span class="v">${t.kind||'—'}</span></div>
        <div class="row"><span class="k">Puerto preferido (config)</span><span class="v">${t.preferred||'—'}</span></div>
        <div class="row"><span class="k">Candidatos detectados</span><span class="v">${t.candidates.length}</span></div>
        ${t.candidates.length? '<div class="list">'+t.candidates.map(p=>'• '+p).join('<br>')+'</div>':''}
      </section>
      <section class="card">
        <h2>Último dato recibido</h2>
        <div class="row"><span class="k">Estado</span><span class="v">${dStatus}</span></div>
        <div class="row"><span class="k">Cuándo</span><span class="v">${fmt(da.last_sample_at)} (${ago(da.last_sample_at)})</span></div>
        <div class="row"><span class="k">Lecturas OK</span><span class="v">${da.read_count}</span></div>
        <div class="row"><span class="k">Errores totales</span><span class="v">${da.error_count}</span></div>
        <div class="row"><span class="k">Modo</span><span class="v">${da.latest.inverter_mode||'—'}</span></div>
        <div class="row"><span class="k">SOC batería</span><span class="v">${da.latest.battery_capacity??'—'} %</span></div>
        <div class="row"><span class="k">PV</span><span class="v">${da.latest.pv_input_power??'—'} W</span></div>
        <div class="row"><span class="k">Carga AC</span><span class="v">${da.latest.ac_output_active_power??'—'} W</span></div>
        <div class="row"><span class="k">Red</span><span class="v">${da.latest.grid_voltage??'—'} V</span></div>
      </section>
      <section class="card">
        <h2>Errores de lectura</h2>
        ${e.last? `<div class="row"><span class="k">Último</span><span class="v">${fmt(e.last_at)} (${ago(e.last_at)})</span></div>
                  <div class="err-box">${e.last.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>`
                : '<div class="pill ok">Sin errores recientes</div>'}
      </section>
      <section class="card">
        <h2>Servicios systemd</h2>
        ${d.systemd.map(u=>`
          <div class="row">
            <span class="k">${u.name}</span>
            <span class="v">${pill(u.active)} ${pill(u.enabled)}</span>
          </div>`).join('')}
      </section>
      <section class="card">
        <h2>Equipo</h2>
        <div class="row"><span class="k">Hardware ID</span><span class="v">${ag.hardware_id||'—'}</span></div>
        <div class="row"><span class="k">Placa</span><span class="v">${ag.board||'—'}</span></div>
        <div class="row"><span class="k">Versión agente</span><span class="v">${ag.version||'—'}</span></div>
        <div class="row"><span class="k">Iniciado</span><span class="v">${fmt(ag.started_at)} (${ago(ag.started_at)} de uptime)</span></div>
      </section>
      <section class="card">
        <h2>Dispositivos USB</h2>
        ${t.usb_devices && t.usb_devices.length
          ? '<div class="list">'+t.usb_devices.map(x=>'• '+x).join('<br>')+'</div>'
          : '<div class="pill mut">Ninguno detectado</div>'}
      </section>`;
    document.getElementById('root').innerHTML = html;
  }catch(err){
    document.getElementById('root').innerHTML='<div class="card err-box">Error: '+err.message+'</div>';
  }
}
load(); setInterval(load, 5000);
</script>
</body></html>"""




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
