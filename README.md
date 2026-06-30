<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Donkie/Spoolman/assets/2332094/4e6e80ac-c7be-4ad2-9a33-dedc1b5ba30e">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/Donkie/Spoolman/assets/2332094/3c120b3a-1422-42f6-a16b-8d5a07c33000">
  <img alt="Icon of a filament spool" src="https://github.com/Donkie/Spoolman/assets/2332094/3c120b3a-1422-42f6-a16b-8d5a07c33000">
</picture>

<br/>

_Keep track of your inventory of 3D-printer filament spools._

> ### 🚀 Spoolman NG
> **Spoolman NG** is a community-maintained continuation of the original [Spoolman](https://github.com/Donkie/Spoolman) by Donkie, which is no longer actively maintained. It stays drop-in compatible while adding new features (NFC spool identification, QR-code label printing, a redesigned dashboard, and merged community PRs) and ships under its own Docker images and releases:
>
> | | |
> |---|---|
> | **GHCR** | `ghcr.io/sherrmann/spoolman` |
> | **Docker Hub** | `cookiemonster95/spoolman` |

Spoolman NG is a self-hosted web service designed to help you efficiently manage your 3D printer filament spools and monitor their usage. It acts as a centralized database that seamlessly integrates with popular 3D printing software like [OctoPrint](https://octoprint.org/) and [Klipper](https://www.klipper3d.org/)/[Moonraker](https://moonraker.readthedocs.io/en/latest/). When connected, it automatically updates spool weights as printing progresses, giving you real-time insights into filament usage.

[![GitHub Release](https://img.shields.io/github/v/release/sherrmann/Spoolman)](https://github.com/sherrmann/Spoolman/releases)
[![API Docs](https://img.shields.io/badge/API-docs-blue)](https://sherrmann.github.io/Spoolman/)
[![Fork of Donkie/Spoolman](https://img.shields.io/badge/fork%20of-Donkie%2FSpoolman-lightgrey)](https://github.com/Donkie/Spoolman)
[![Spoolman Wiki](https://img.shields.io/badge/Spoolman-Wiki-blue)](https://github.com/Donkie/Spoolman/wiki)

### Features
* **Filament Management**: Keep comprehensive records of filament types, manufacturers, and individual spools.
* **API Integration**: The [REST API](https://sherrmann.github.io/Spoolman/) allows easy integration with other software, facilitating automated workflows and data exchange.
* **Real-Time Updates**: Stay informed with live spool updates through Websockets, providing immediate feedback during printing operations.
* **Central Filament Database**: A community-supported database of manufacturers and filaments simplify adding new spools to your inventory. Contribute by heading to [SpoolmanDB](https://github.com/Donkie/SpoolmanDB).
* **Web-Based Client**: Spoolman includes a built-in web client that lets you manage data effortlessly:
  * View, create, edit, and delete filament data.
  * Add custom fields to tailor information to your specific needs.
  * Print labels with QR codes for easy spool identification and tracking.
  * Contribute to its translation into 18 languages via [Weblate](https://hosted.weblate.org/projects/spoolman/).
* **NFC Spool Identification**: Scan NFC tags to instantly identify and select spools. Supports three tag standards:
  * [TigerTag](https://tigertag.io/) (ISO 14443A / NTAG213) — binary format with external product database lookup.
  * [OpenPrintTag](https://openprinttag.org/) (ISO 15693 / NFC-V) — Prusa's NDEF/CBOR standard with per-spool UUIDs.
  * [Qidi](https://wiki.qidi3d.com/en/QIDIBOX/RFID) (ISO 14443A / MIFARE Classic 1K) — Qidi filament tags with material and color identification.
  * Browser-based NFC scanning via the Web NFC API, or server-side with a USB reader.
  * Automatic spool creation from tag data when scanning unrecognized tags.
  * External integration endpoint (`POST /api/v1/nfc/lookup`) for Klipper NFC daemons and other clients.
* **Database Support**: SQLite, PostgreSQL, MySQL, and CockroachDB.
* **Multi-Printer Management**: Handles spool updates from several printers simultaneously.
* **Advanced Monitoring**: Integrate with [Prometheus](https://prometheus.io/) for detailed historical analysis of filament usage, helping you track and optimize your printing processes. See the [Wiki](https://github.com/Donkie/Spoolman/wiki/Filament-Usage-History) for instructions on how to set it up.

**Spoolman integrates with:**
  * [Moonraker](https://moonraker.readthedocs.io/en/latest/configuration/#spoolman) and most front-ends (Fluidd, KlipperScreen, Mainsail, ...)
  * [OctoPrint](https://github.com/mdziekon/octoprint-spoolman)
  * [OctoEverywhere](https://octoeverywhere.com/spoolman?source=github_spoolman)
  * [Home Assistant](https://github.com/Disane87/spoolman-homeassistant)
  * [MCP Server](https://github.com/Disane87/spoolman-mcp) - Manage your filament inventory through AI assistants like Claude using the Model Context Protocol

**Web client preview:**
![image](https://github.com/Donkie/Spoolman/assets/2332094/33928d5e-440f-4445-aca9-456c4370ad0d)

## Installation

Spoolman NG runs the same on `amd64`, `arm64`, and `armv7`. Pick whichever fits you.

### Docker (recommended — and the only supported option on Windows/macOS)

A minimal `docker-compose.yml`:

```yaml
services:
  spoolman:
    image: ghcr.io/sherrmann/spoolman:latest # or cookiemonster95/spoolman:latest on Docker Hub
    restart: unless-stopped
    volumes:
      - ./data:/home/app/.local/share/spoolman
    ports:
      - "7912:8000"
    environment:
      - TZ=Europe/Stockholm
```

Then open `http://localhost:7912`. Image tags:

* `:latest` — the newest release
* `:YYYY.M.PATCH` — a pinned release (e.g. `:2026.6.0`)
* `:edge` — the latest `master` build
* `:sha-<commit>` — a specific commit

> **Windows & macOS:** use Docker. The native install below is Linux-only (it relies on `bash` + `systemd`).

### Native install (Linux, no Docker)

Best for running Spoolman directly on a host — e.g. on a Raspberry Pi next to Klipper/Moonraker. One line fetches the latest release and runs the installer (it sets up `uv`, the Python dependencies, and an optional `systemd` service):

```bash
curl -fsSL https://github.com/sherrmann/Spoolman/releases/latest/download/spoolman.zip -o spoolman.zip \
  && unzip spoolman.zip -d ~/Spoolman && cd ~/Spoolman && ./scripts/install.sh
```

The UI then runs on `http://<host>:8000` (configurable via `.env`). Your database lives in a separate data directory, so updates never touch it.

> The native install omits the optional **NFC** feature. On `amd64`/`arm64` you can add it with `uv sync --extra nfc`; it is not available on 32-bit ARM (`armv7`).

### One-click updates from Moonraker (Klipper users)

If you run Klipper, you can update Spoolman NG straight from Mainsail/Fluidd. Add this to your `moonraker.conf` (adjust `path` to your install directory):

```ini
[update_manager spoolman]
type: web
channel: stable
repo: sherrmann/Spoolman
path: ~/Spoolman
```

Spoolman NG then shows up in your printer UI's update list and tracks new releases automatically. (The releases ship the `release_info.json` that Moonraker's `web` update type expects.)

For other configuration options, the original [Spoolman Installation Wiki](https://github.com/Donkie/Spoolman/wiki/Installation) also applies.
