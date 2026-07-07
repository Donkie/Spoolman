# NFC Spool Identification

Spoolman NG can read (and, for some standards, write) NFC filament tags to
identify a spool instantly, look it up in your inventory, and — for an
unrecognized tag — offer to create the spool from the tag's data. This guide
covers the supported tag standards, the two ways tags are read (an in-browser
scanner and an optional server-side USB reader), the hardware and configuration
each path needs, and troubleshooting.

> **Security note:** the NFC lookup/auto-create endpoint (`POST /api/v1/nfc/lookup`)
> creates spools from scanned data, and `POST /api/v1/nfc/write` writes physical
> tags through a connected reader. Spoolman has no built-in authentication — see
> [Security & exposure](../README.md#security--exposure) before exposing it beyond
> a trusted network.

## What NFC does in Spoolman NG

- **Scan to select** — tap a tag and Spoolman jumps to the matching spool.
- **Auto-create** — tap an unrecognized manufacturer tag and Spoolman offers to
  create the spool (and its filament/vendor) from the decoded tag data.
- **Bind & write** — associate a tag with an existing spool, or encode a spool
  onto a blank tag from the spool's page.
- **External lookup** — `POST /api/v1/nfc/lookup` lets Klipper NFC daemons and
  other clients POST raw tag memory and get back the matching spool.

## Supported tag standards

| Standard | Chip / transport | Read via USB reader | Read in browser (Web NFC) | Write |
|---|---|---|---|---|
| [TigerTag](https://tigertag.io/) | NTAG213 (ISO 14443A, NFC Forum Type 2) | Yes | Yes | Yes (`/api/v1/nfc/write` `tag_format=tigertag`; `/encode` returns the binary) |
| [Qidi](https://wiki.qidi3d.com/en/QIDIBOX/RFID) | MIFARE Classic 1K (ISO 14443A, Crypto-1) | Yes | No | Yes (`/api/v1/nfc/write` `tag_format=qidi`) |
| [OpenPrintTag](https://openprinttag.org/) | ISO 15693 / NFC-V (NDEF + CBOR) | **No** | Yes (only path) | No write endpoint |

Notes on the matrix (all derived from the current code):

- **OpenPrintTag is browser-only.** The server-side USB reader (nfcpy) implements
  only NTAG213 and MIFARE Classic 1K reads — there is **no ISO 15693 / NFC-V path**
  in `spoolman/nfc_service.py`, so an OpenPrintTag tag cannot be read over USB. It
  is decoded server-side only when raw NFC-V NDEF bytes are POSTed to
  `/api/v1/nfc/lookup` (e.g. read in the browser via Web NFC, or by an external
  client).
- **Qidi is USB-only in practice.** MIFARE Classic tags are not NDEF and are not
  exposed through the browser's Web NFC API, so Qidi tags are read through the USB
  reader, not the in-browser scanner.
- **Writing** is supported for TigerTag (NTAG213) and Qidi (MIFARE Classic 1K)
  only; there is no OpenPrintTag write endpoint.

## Browser scanning (Web NFC) — requirements

The in-app scanner (the floating scan button) can read tags directly in the
browser with **no server-side reader hardware**, but the Web NFC API it uses is
tightly constrained:

- **Chrome (or a Chromium browser) on Android only.** No other browser or OS
  exposes Web NFC today; on an unsupported browser the scanner's "browser" mode is
  disabled.
- **Secure context (HTTPS) required.** Web NFC is only available over HTTPS (or
  `http://localhost` on the device itself). This is the common gotcha: the default
  Spoolman deployment is plain HTTP on a LAN address such as `http://pi:7912`, and
  Web NFC will **not** work there — the scanner's browser mode stays unavailable
  until you serve Spoolman over HTTPS.

If you only ever use a server-side USB reader, you can ignore this section
entirely.

### Serving Spoolman over HTTPS (reverse-proxy TLS)

Put a TLS-terminating reverse proxy in front of Spoolman. [Caddy](https://caddyserver.com/)
obtains and renews a certificate automatically:

```caddy
# Caddyfile — replace spoolman.example.com with your (DNS-resolvable) hostname
spoolman.example.com {
    reverse_proxy localhost:7912
}
```

Or with nginx and an existing certificate:

```nginx
server {
    listen 443 ssl;
    server_name spoolman.example.com;

    ssl_certificate     /etc/ssl/certs/spoolman.crt;
    ssl_certificate_key /etc/ssl/private/spoolman.key;

    location / {
        proxy_pass http://127.0.0.1:7912;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket live updates
        proxy_set_header Connection "upgrade";
    }
}
```

Then open Spoolman at `https://spoolman.example.com` on Chrome for Android and the
browser scanner becomes available. A tunnel that provides HTTPS (e.g. Tailscale
Funnel, Cloudflare Tunnel) works too.

## Server-side USB reader

For hands-free scanning at a workstation — or to read Qidi tags — attach a USB NFC
reader to the host and enable server-side NFC. Spoolman uses the
[nfcpy](https://nfcpy.readthedocs.io/) library.

### Reader hardware

The code paths target these reader families:

- **PN532** boards (USB/UART)
- **RC522** modules (USB/UART)
- **ACR122U**-class PC/SC readers

> **Not hardware-verified.** None of these has been confirmed against real hardware
> by the maintainer. They are **expected to work via nfcpy** because that is what
> the reader abstraction is written against — reports of what works (or doesn't)
> are very welcome. See nfcpy's own
> [supported-devices list](https://nfcpy.readthedocs.io/en/latest/overview.html#supported-devices)
> for the authoritative compatibility reference.

### Enabling it

Set the environment variables below (in `.env` for a native install, or under
`environment:` in Docker):

| Variable | Default | Description |
|---|---|---|
| `SPOOLMAN_NFC_ENABLED` | `FALSE` | Enable the server-side USB NFC reader. Accepts `TRUE`/`1` or `FALSE`/`0`. |
| `SPOOLMAN_NFC_READER_TYPE` | `nfcpy` | Reader backend. Only `nfcpy` is implemented today. |
| `SPOOLMAN_NFC_DEVICE` | *(auto-detect)* | nfcpy connection string passed to `ContactlessFrontend`. Unset defaults to `usb` (first USB reader found). Examples: `usb`, `usb:04e6:5591` (VID:PID), `usb:001:005` (bus:device), `tty:USB0:pn532` (a PN532 on a serial adapter). |

The following variables are **separate** — they control TigerTag's external
product-database lookups (used to enrich a scanned TigerTag with catalog data),
not the reader hardware, and are optional:

| Variable | Default | Description |
|---|---|---|
| `SPOOLMAN_TIGERTAG_ENABLED` | `FALSE` | Enable TigerTag external product-database lookups. Accepts `TRUE`/`1` or `FALSE`/`0`. |
| `SPOOLMAN_TIGERTAG_API_URL` | `https://api.tigertag.io/api:tigertag/` | TigerTag API base URL. |
| `SPOOLMAN_TIGERTAG_SYNC_INTERVAL` | `3600` | TigerTag product-table sync interval, in seconds. |

The NFC feature also needs the optional Python **NFC extra** to be installed. The
Docker image already includes it; on a native install add it with
`uv sync --extra nfc`.

### Docker: passing the USB device through

The container can only see a USB reader if the device is passed through. The
Docker image already bundles `libusb`, and the entrypoint relaxes
`/dev/bus/usb` permissions when present. Add a `devices:` mapping to your compose
file:

```yaml
services:
  spoolman:
    image: ghcr.io/sherrmann/spoolman:latest
    # ...
    environment:
      - SPOOLMAN_NFC_ENABLED=TRUE
      # - SPOOLMAN_NFC_DEVICE=usb        # optional; auto-detects the first USB reader
    devices:
      # Pass the host USB bus through so nfcpy can reach the reader.
      # Narrow this to a specific device node if you prefer.
      - /dev/bus/usb:/dev/bus/usb
```

### Native install: udev rule for non-root access

Running Spoolman as a non-root user (the usual native setup) means the service
needs permission to open the reader's USB device. Add a udev rule granting your
Spoolman user's group access, then reload. Example for an ACR122U (ACS, VID
`072f`); substitute your reader's VID:

```udev
# /etc/udev/rules.d/99-spoolman-nfc.rules
SUBSYSTEM=="usb", ATTRS{idVendor}=="072f", GROUP="plugdev", MODE="0660"
```

```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Make sure the user running Spoolman is in the group you granted (`plugdev`
above). Find your reader's VID/PID with `lsusb`.

## Troubleshooting

- **Reader not found / status not "connected".** Confirm `SPOOLMAN_NFC_ENABLED=TRUE`
  and the NFC extra is installed. On Docker, confirm the `devices:` mapping and that
  the reader shows up on the host (`lsusb`). On a native install, confirm the udev
  rule and group membership. Try setting `SPOOLMAN_NFC_DEVICE` explicitly (e.g.
  `usb:VID:PID`) if auto-detect picks the wrong device.
- **Tag not detected.** Check the tag standard is supported over the path you're
  using (see the matrix above) — e.g. a Qidi (MIFARE Classic) tag needs the USB
  reader, not the browser. Reposition the tag over the reader's antenna.
- **The browser scan button is missing or its "browser" mode is disabled.** Web NFC
  needs **Chrome on Android over HTTPS**. If you're on plain HTTP (e.g.
  `http://pi:7912`), a desktop browser, or iOS, browser scanning is unavailable —
  set up the HTTPS reverse proxy above, or use a server-side USB reader instead.
- **OpenPrintTag won't read over USB.** This is expected: there is no ISO 15693 /
  NFC-V support in the USB reader path. Read OpenPrintTag tags in the browser (Web
  NFC), which does support NFC-V.

## See also

- [Installation & Configuration](installation.md) — full environment-variable reference.
- [README: NFC feature overview](../README.md#features)
