# SolarOps Local Agent

Runs on Raspberry Pi, Orange Pi, or any Debian/Ubuntu Linux board connected
by USB to a Voltronic / Axpert / MPP-Solar / similar inverter.

## Quick install

```bash
# Option A — install and activate later via the LAN UI:
curl -fsSL https://YOUR_DOMAIN/install.sh | sudo bash

# Option B — pre-seed the device token from the SolarOps web app:
curl -fsSL https://YOUR_DOMAIN/install.sh | sudo bash -s -- --token <DEVICE_TOKEN>
```

After install, open `http://<device-ip>/` from any computer on the same LAN.
No login is required on the local UI.

## How it works

- Auto-scans `/dev/hidraw*` looking for an inverter that answers `QPIRI`.
- Polls `QPIGS` and `QMOD` every 5 s.
- Caches samples in `/var/lib/solarops/state.db` so the local UI works offline.
- Pushes batched samples to `https://YOUR_DOMAIN/api/public/ingest` every 30 s
  using the device token (`Authorization: Bearer …`).
- If unactivated, the LAN UI shows an activation form: paste the license code
  the superadmin generated and pick a site name. The agent calls
  `/api/public/activate` to bind the license to a new site and stores the
  returned device token.

## Files

| Path | Purpose |
|---|---|
| `/opt/solarops/agent.py` | The daemon |
| `/opt/solarops/venv/`    | Python virtualenv (Flask + requests) |
| `/etc/solarops/config.json` | Cloud URL + device token |
| `/var/lib/solarops/state.db` | Local cache |
| `/etc/systemd/system/solarops.service` | systemd unit |
| `/etc/udev/rules.d/99-solarops.rules` | udev permissions for hidraw |

## Building a flashable image

You can pre-bake the agent into a Raspberry Pi OS Lite image with `pi-gen`:

```bash
git clone https://github.com/RPi-Distro/pi-gen
cp -r agent pi-gen/stage4-solarops/
# Add a custom-stage script that copies agent/ into /opt/solarops and runs install.sh.
sudo ./build.sh
```

The output `*.img` can be flashed with Raspberry Pi Imager. On first boot the
device shows up on the LAN, autodetects the inverter, and waits for license
activation through its local UI.

## Manual control

```bash
sudo systemctl status solarops
sudo journalctl -u solarops -f
sudo systemctl restart solarops
```
