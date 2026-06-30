# Changelog

**Spoolman NG** is a community-maintained continuation of [Spoolman](https://github.com/Donkie/Spoolman) by Donkie. Full per-release notes (auto-generated from merged pull requests) are published on the [GitHub Releases](https://github.com/sherrmann/Spoolman/releases) page; this file summarizes notable changes.

## [2026.6.0] — 2026-06-30

First release of the Spoolman NG fork, built on upstream Spoolman 0.23.1.

- **NFC spool identification** — TigerTag, OpenPrintTag, and QIDI tags. Included in the `amd64`/`arm64` Docker images; not available on `armv7`.
- **Filament label printing** with separate presets, QR codes, and filament QR scanning support.
- **Redesigned home dashboard** with KPI cards and inventory analytics.
- Merged upstream community PRs: extra-field filter/sort, 3D Filament Profiles import, weight-delta events, and calibration.
- **Fork infrastructure**: multi-arch images published to GHCR (`ghcr.io/sherrmann/spoolman`) and Docker Hub (`cookiemonster95/spoolman`); CalVer releases with `:latest`, `:edge`, and `:sha-*` tags; and one-click updates via Moonraker's `update_manager`.

[2026.6.0]: https://github.com/sherrmann/Spoolman/releases/tag/v2026.6.0
