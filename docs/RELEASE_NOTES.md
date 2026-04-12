# Release Notes

## 2026-04-10 — NFC USB hot-plug support

### Changes

- **NFC reader auto-reconnect** (`spoolman/nfc_service.py`):
  - NFC service now automatically detects when the USB reader is disconnected
    and attempts to reconnect on the next status poll or read/write operation.
  - Reconnect attempts are rate-limited (10 s cooldown) to avoid hammering USB.
  - `OSError` during read/write marks the reader as disconnected so the next
    call triggers a reconnect instead of failing permanently.

- **Docker USB bind mount** (`docker-compose.yml`):
  - Replaced `devices:` directive with a `volumes:` bind mount of
    `/dev/bus/usb` so that hot-plugged USB devices are visible inside the
    container without a restart.

### Why

Previously, if the ACR122U NFC reader was unplugged and re-plugged, the
container's `devices:` snapshot became stale and the NFC button disappeared
from the UI. The only fix was a full `docker compose restart`. Now both the
Docker mount and the backend handle reconnection automatically.
