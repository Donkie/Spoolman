<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/spoolman-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/spoolman-logo-light.svg">
  <img alt="Icon of a filament spool" src="assets/spoolman-logo-light.svg">
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
[![Docs](https://img.shields.io/badge/Docs-installation%20%26%20monitoring-blue)](docs/installation.md)

### Features
* **Filament Management**: Keep comprehensive records of filament types, manufacturers, and individual spools.
* **API Integration**: The [REST API](https://sherrmann.github.io/Spoolman/) allows easy integration with other software, facilitating automated workflows and data exchange.
* **Real-Time Updates**: Stay informed with live spool updates through Websockets, providing immediate feedback during printing operations.
* **Central Filament Database**: A community-supported database of manufacturers and filaments simplify adding new spools to your inventory. Spoolman NG syncs from its own [SpoolmanDB](https://github.com/sherrmann/SpoolmanDB) (continuing the original database) — contribute filaments there, or point `EXTERNAL_DB_URL` at another instance.
* **Web-Based Client**: Spoolman includes a built-in web client that lets you manage data effortlessly:
  * View, create, edit, and delete filament data.
  * Add custom fields to tailor information to your specific needs.
  * Print labels with QR codes for easy spool identification and tracking.
  * Translated into 28 languages, inherited from upstream. The upstream [Weblate project](https://hosted.weblate.org/projects/spoolman/) feeds the original repository, not this fork — until a Spoolman NG translation project is set up, contribute translations by editing `client/public/locales/<lang>/common.json` in a pull request.
* **NFC Spool Identification**: Scan NFC tags to instantly identify and select spools. Supports three tag standards:
  * [TigerTag](https://tigertag.io/) (ISO 14443A / NTAG213) — binary format with external product database lookup.
  * [OpenPrintTag](https://openprinttag.org/) (ISO 15693 / NFC-V) — Prusa's NDEF/CBOR standard with per-spool UUIDs.
  * [Qidi](https://wiki.qidi3d.com/en/QIDIBOX/RFID) (ISO 14443A / MIFARE Classic 1K) — Qidi filament tags with material and color identification.
  * Two read paths: an **in-browser scanner** (Web NFC — Chrome on Android over **HTTPS** only) and an optional **server-side USB reader**. They don't cover the same tags: the USB reader reads TigerTag (NTAG213) and Qidi (MIFARE Classic) only, while **OpenPrintTag (ISO 15693 / NFC-V) is browser-only** — there is no USB path for it. See [docs/nfc.md](docs/nfc.md) for the full matrix, hardware, and setup.
  * Automatic spool creation from tag data when scanning unrecognized tags.
  * External integration endpoint (`POST /api/v1/nfc/lookup`) for Klipper NFC daemons and other clients.
* **Database Support**: SQLite, PostgreSQL, MySQL, and CockroachDB.
* **Multi-Printer Management**: Handles spool updates from several printers simultaneously.
* **Advanced Monitoring**: Integrate with [Prometheus](https://prometheus.io/) for detailed historical analysis of filament usage, helping you track and optimize your printing processes. See [docs/monitoring.md](docs/monitoring.md) for setup and example queries.

### Integrations

**Spoolman integrates with:**
  * [Moonraker](https://moonraker.readthedocs.io/en/latest/configuration/#spoolman) and most front-ends (Fluidd, KlipperScreen, Mainsail, ...)
  * [OctoPrint](https://github.com/mdziekon/octoprint-spoolman)
  * [OctoEverywhere](https://octoeverywhere.com/spoolman?source=github_spoolman)
  * [Home Assistant](https://github.com/Disane87/spoolman-homeassistant)
  * [MCP Server](https://github.com/Disane87/spoolman-mcp) - Manage your filament inventory through AI assistants like Claude using the Model Context Protocol

**Web client preview:**
![Spoolman web client preview](assets/spoolman-screenshot.png)

## Installation

Spoolman NG ships Docker images for `amd64`, `arm64`, and `armv7`. `amd64` and
`arm64` are the recommended targets for new installs; `armv7` (32-bit ARM) is
best-effort — see [Deployment & Hardware](#deployment--hardware) for the honest
support policy before choosing it.

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

The UI then runs on `http://<host>:7912` (configurable via `.env`). Your database lives in a separate data directory, so updates never touch it.

> The native install omits the optional **NFC** feature by default; add it on any platform with `uv sync --extra nfc`.

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

For all configuration options (databases, backups, base path, every environment variable), see the [Installation & Configuration guide](docs/installation.md).

## Deployment & Hardware

Spoolman NG is light — it happily runs next to Klipper/Moonraker on a
Raspberry Pi 3/4-class SBC. Dashboard analytics stay snappy even at 10k spools
(~43 ms aggregation), so the CPU is not a scaling concern; storage is whatever
your database needs (the default SQLite file is tiny).

**Architectures & support policy.** Images are built and published for all three
arches to both [`ghcr.io/sherrmann/spoolman`](https://github.com/sherrmann/Spoolman/pkgs/container/spoolman)
and Docker Hub `cookiemonster95/spoolman`:

| Arch | CI coverage | Notes |
|---|---|---|
| `amd64` | Full 4-database integration matrix (SQLite/Postgres/MySQL/CockroachDB) | Recommended. |
| `arm64` | QEMU boot + `/api/v1/health` smoke only | Recommended for SBCs (Pi 3/4/5 64-bit OS). |
| `armv7` | QEMU boot + `/api/v1/health` smoke only | **Best-effort.** 32-bit ARM compiles `psycopg2`/`greenlet`/`cbor2` from source (via an `LD_PRELOAD` workaround) and uses pure-Python `cbor2` 5.x. It is supported for the foreseeable future, but 32-bit ARM is a shrinking platform — **prefer arm64 for new installs** where your hardware allows a 64-bit OS. |

The ARM images get only a boot + health-check smoke test in CI (not the full
integration matrix), so treat arm64/armv7 as verified-to-start rather than
matrix-tested.

**Ways to run.** All three are covered under [Installation](#installation) above:

- **Docker / Compose** — recommended, and the only supported option on Windows/macOS.
- **Native install** (Linux) — the one-line [`scripts/install.sh`](scripts/install.sh)
  (Debian/Arch/Fedora detection; not exercised in CI) sets up `uv`, dependencies,
  and an optional `systemd` service.
- **Moonraker one-click updates** for Klipper users.

Databases: SQLite (default, zero-config), PostgreSQL, MySQL/MariaDB, and CockroachDB.

**NFC hardware.** Full guide in **[docs/nfc.md](docs/nfc.md)**. In short:

- Two read paths: an **in-browser scanner** (Web NFC) and an optional
  **server-side USB reader** (nfcpy).
- **Browser scanning needs Chrome on Android over HTTPS** — it will not work on a
  plain-HTTP LAN address like `http://pi:7912`; put Spoolman behind a TLS reverse
  proxy (Caddy/nginx recipe in the guide).
- The **USB reader reads TigerTag (NTAG213) and Qidi (MIFARE Classic 1K) only**;
  **OpenPrintTag (NFC-V) is browser-only** (no USB path).
- Reader families targeted in code — **PN532, RC522, ACR122U-class** — are
  *expected to work* via nfcpy but are **not hardware-verified**; reports welcome.
- Docker needs the reader passed through (`devices: - /dev/bus/usb:/dev/bus/usb`);
  native installs typically need a udev rule for non-root access. Enable with
  `SPOOLMAN_NFC_ENABLED=TRUE`.

**Label printing, QR codes & swatches.** Rendered entirely **client-side in the
browser** — no special hardware. Labels print to any printer your OS can reach;
QR codes are sized to be scannable at your nozzle width; and color swatches
download as 3MF files you print on your own machine.

## Security & exposure

Spoolman has **no built-in authentication** — by design, it targets trusted home/LAN networks alongside Klipper, Moonraker, and OctoPrint. Anyone who can reach the port can read and modify your inventory, including endpoints that create spools automatically from scanned tags (`POST /api/v1/nfc/lookup`) and write physical NFC tags through a connected reader (`POST /api/v1/nfc/write`).

If you expose Spoolman beyond your LAN:

* Put it behind an authenticating reverse proxy (e.g. [Authelia](https://www.authelia.com/), [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/), Caddy/nginx basic auth) or access it over a VPN such as WireGuard or Tailscale.
* Don't run with `SPOOLMAN_DEBUG_MODE=TRUE` in production — it relaxes CORS to allow all origins.

To report a security vulnerability, see [SECURITY.md](SECURITY.md).
