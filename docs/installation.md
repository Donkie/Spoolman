# Installation & Configuration

This is the fork-maintained installation guide for **Spoolman NG**. It covers the
Docker and native installs, every supported environment variable, database
options, backups, and Moonraker-managed updates.

> Migrating from original Spoolman (Donkie/Spoolman ≤ 0.23.1)? Spoolman NG is a
> drop-in replacement: point it at your existing database (or data directory)
> and it will migrate the schema automatically on startup. **Back up your
> database first.**

## Docker (recommended; the only supported option on Windows/macOS)

```yaml
services:
  spoolman:
    image: ghcr.io/sherrmann/spoolman:latest # or cookiemonster95/spoolman:latest on Docker Hub
    restart: unless-stopped
    volumes:
      # Mount the host directory "./data" into the container, keeping your
      # database outside the container lifecycle:
      - ./data:/home/app/.local/share/spoolman
    ports:
      - "7912:8000"
    environment:
      - TZ=Europe/Stockholm # timezone, used for timestamps in the UI/API
      # - PUID=1000         # user id that owns the data volume
      # - PGID=1000         # group id that owns the data volume
```

Start it with `docker compose up -d` and open `http://localhost:7912`.

Image tags: `:latest` (newest release), `:YYYY.M.PATCH` (pinned release,
e.g. `:2026.6.1`), `:edge` (latest master build), `:sha-<commit>`. Architectures:
`amd64`, `arm64`, `armv7` — all with NFC support included.

## Native install (Linux)

One line fetches the latest release and runs the installer (sets up
[uv](https://docs.astral.sh/uv/), the Python environment, and an optional
systemd service):

```bash
curl -fsSL https://github.com/sherrmann/Spoolman/releases/latest/download/spoolman.zip -o spoolman.zip \
  && unzip spoolman.zip -d ~/Spoolman && cd ~/Spoolman && ./scripts/install.sh
```

The installer creates `.env` from `.env.example`, which sets the port to
**7912** — the UI then runs on `http://<host>:7912`. All configuration lives in
that `.env` file (see the reference below). The database is stored in a
separate data directory, so updates never touch it.

The native install omits the optional **NFC** (USB reader) feature by default;
add it with `uv sync --extra nfc`.

### One-click updates from Moonraker (Klipper users)

Add this to `moonraker.conf` (adjust `path` to your install directory):

```ini
[update_manager spoolman]
type: web
channel: stable
repo: sherrmann/Spoolman
path: ~/Spoolman
```

Spoolman NG then appears in Mainsail/Fluidd's update list and tracks new
releases automatically.

## Environment variable reference

Every variable is optional unless noted. In Docker, set them under
`environment:`; in a native install, put them in `.env`.

### Database

| Variable | Default | Description |
|---|---|---|
| `SPOOLMAN_DB_TYPE` | `sqlite` | One of `sqlite`, `postgres`, `mysql`, `cockroachdb`. |
| `SPOOLMAN_DB_HOST` | — | Database host (non-SQLite). |
| `SPOOLMAN_DB_PORT` | — | Database port (non-SQLite). |
| `SPOOLMAN_DB_NAME` | — | Database name (non-SQLite; must NOT be set for SQLite). |
| `SPOOLMAN_DB_USERNAME` | — | Database username. |
| `SPOOLMAN_DB_PASSWORD` | — | Database password. |
| `SPOOLMAN_DB_PASSWORD_FILE` | — | Path to a file containing the password (e.g. a Docker secret); alternative to `SPOOLMAN_DB_PASSWORD`. |
| `SPOOLMAN_DB_QUERY` | — | Extra connection query parameters, e.g. `unix_socket=/path/to/mysql.sock`. |

With SQLite (the default), the database file is `spoolman.db` inside the data
directory. Schema migrations run automatically on every startup, for all
database types.

### Server & paths

| Variable | Default | Description |
|---|---|---|
| `SPOOLMAN_HOST` | `0.0.0.0` | Interface to listen on. |
| `SPOOLMAN_PORT` | `8000` | Port to listen on. Note: the Docker image listens on 8000 (map it with `ports:`), while the native installer's generated `.env` sets 7912. |
| `SPOOLMAN_BASE_PATH` | — | Serve Spoolman under a sub-path, e.g. `/spoolman` for `myhost.com/spoolman`. The web client, PWA manifest, and service worker are all base-path aware. |
| `SPOOLMAN_DIR_DATA` | `~/.local/share/spoolman` | Data directory (SQLite DB lives here). |
| `SPOOLMAN_DIR_BACKUPS` | `<data dir>/backups` | Where SQLite backups are written. |
| `SPOOLMAN_DIR_LOGS` | `<data dir>` | Log directory. |
| `SPOOLMAN_LOGGING_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`. |
| `PUID` / `PGID` | `1000` | Docker only: uid/gid of the in-container user that owns the data volume. |

### Features

| Variable | Default | Description |
|---|---|---|
| `SPOOLMAN_METRICS_ENABLED` | `FALSE` | Expose Prometheus metrics at `/metrics` — see [monitoring.md](monitoring.md). |
| `SPOOLMAN_AUTOMATIC_BACKUP` | `TRUE` | Nightly SQLite backup at midnight; the 5 most recent backups are kept in the backups directory. |
| `EXTERNAL_DB_URL` | `https://sherrmann.github.io/SpoolmanDB/` | Source of the community filament catalog ([SpoolmanDB](https://github.com/sherrmann/SpoolmanDB)). Set to an empty string to disable syncing. |
| `EXTERNAL_DB_SYNC_INTERVAL` | `3600` | Catalog sync interval in seconds; `0` syncs only at startup. |

### Security-relevant

| Variable | Default | Description |
|---|---|---|
| `SPOOLMAN_DEBUG_MODE` | `FALSE` | Relaxes CORS to all origins. Never enable in production. |
| `SPOOLMAN_CORS_ORIGIN` | — | Comma-separated allowed CORS origins (or `*`). |

Spoolman has **no built-in authentication** — see the
[Security & exposure](../README.md#security--exposure) section of the README
before exposing it beyond a trusted network.

## Backups & upgrades

- SQLite: automatic nightly backups (see `SPOOLMAN_AUTOMATIC_BACKUP` above);
  for external databases use your database's own backup tooling.
- Upgrades apply database migrations automatically on startup. Take a backup
  before upgrading so you can roll back.
- To restore a SQLite backup, stop Spoolman, replace `spoolman.db` in the data
  directory with the backup file, and start again.
