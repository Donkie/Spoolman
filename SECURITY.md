# Security Policy

## Supported versions

Only the latest release of Spoolman NG receives security fixes. The original
upstream project (Donkie/Spoolman ≤ 0.23.1) is no longer maintained; upgrade to
a current Spoolman NG release to receive fixes.

## Threat model

Spoolman has no built-in authentication or authorization. It is designed to run
on a trusted home/LAN network next to Klipper/Moonraker/OctoPrint, and the
entire REST API — including endpoints that create data and write physical NFC
tags — is open to anyone who can reach the port. Exposing an instance directly
to the internet is not a supported configuration; see the
[Security & exposure](README.md#security--exposure) section of the README for
recommended reverse-proxy/VPN setups.

Reports that assume an attacker who can already reach the API (e.g. "an
unauthenticated user can create spools") therefore describe intended behavior,
not a vulnerability. In scope are, for example: bugs that let a crafted request
escape the API's data model (SQL injection, path traversal, SSRF via
`EXTERNAL_DB_URL`/3DFP fetching), cross-site attacks against the web client
(XSS, CSRF that a reverse proxy would not stop), denial of service through
malformed input (e.g. crafted NFC tag payloads), and vulnerabilities in the
published Docker images.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Instead, report
privately via
[GitHub Security Advisories](https://github.com/sherrmann/Spoolman/security/advisories/new).

Include the version (or image tag), reproduction steps, and impact. You should
receive an initial response within 14 days. Fixes are published as a regular
release, credited to the reporter unless anonymity is requested.
