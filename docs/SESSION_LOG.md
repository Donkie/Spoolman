# Session Log

## 2026-04-10 — Diagnose missing NFC scan button & add hot-plug support

### Problem
The "Scan NFC" floating button was not visible in the Spoolman web UI.

### Investigation
1. Confirmed the running container (`spoolman-custom:latest`) is built from the
   fork's `master` branch with `pr/nfc-support` merged — all NFC code is present.
2. Checked `GET /api/v1/nfc/status` — returned `{"enabled": true, "status": "error"}`.
3. The frontend (`nfcScannerModal.tsx:209`) hides the button when both
   `serverEnabled` and `webNfcAvailable` are false.
4. Container logs showed: `nfc.clf ERROR no reader available on path usb` /
   `OSError: [Errno 19] No such device`.
5. Root cause: the ACR122U was re-enumerated as device `013` after a replug,
   but the Docker `devices:` bind captured the old device node at container
   start. The container only saw the bus hub (`001`), not the reader.

### Fix applied
1. **docker-compose.yml** — switched from `devices:` to a `volumes:` bind mount
   of `/dev/bus/usb` (live view of host device nodes).
2. **spoolman/nfc_service.py** — added `_try_connect()`, `_ensure_connected()`
   with 10 s cooldown for auto-reconnect on status poll, read, and write.
   `OSError` during I/O now marks the reader for reconnect.
3. Rebuilt and deployed — NFC status returned to `"connected"`.
