# TigerTag Integration - Implementation Log

**Date:** 2026-02-13
**Branch:** master

---

## Status: All 4 Phases Implemented and Verified

- All code written and committed.
- Frontend build passes (TypeScript clean).
- All 223 integration tests pass (SQLite).
- Manual and NFC hardware testing still pending.

---

## Bugs Fixed During Verification

| File | Issue | Fix |
|------|-------|-----|
| `client/src/components/header/index.tsx` | Used non-existent `RefineThemedLayoutV2HeaderProps` export | Reverted to `RefineThemedLayoutHeaderProps` |
| `client/src/pages/spools/show.tsx` | Used `queryResult` instead of `query` from `useShow()` | Changed to `const { query } = useShow()` |
| `client/src/pages/spools/show.tsx` | Added unnecessary `IResourceComponentsProps` and `React` import | Removed; matches upstream component signature |

---

## Files Changed

### New Files Created (8)

| File | Phase | Description |
|------|-------|-------------|
| `spoolman/tigertagdb.py` | 1 | TigerTag API client, Pydantic models, sync scheduler, cache |
| `spoolman/tigertag_codec.py` | 3 | NTAG213 binary encoder/decoder (144 bytes, struct-based) |
| `spoolman/nfc_service.py` | 3 | NFC reader singleton wrapping nfcpy |
| `spoolman/tigertag_lookup.py` | 3 | Spool-to-TigerTag matching and reverse mapping |
| `spoolman/api/v1/nfc.py` | 3 | NFC API endpoints (status/read/write) |
| `client/src/utils/nfc.ts` | 4 | TS types, React Query hooks, Web NFC declarations |
| `client/src/components/nfcScannerModal.tsx` | 4 | NFC tag scanner modal (Browser + Server modes) |
| `client/src/components/nfcWriteModal.tsx` | 4 | NFC tag writer modal with data preview |

### Modified Files (11)

| File | Phase | What Changed |
|------|-------|-------------|
| `spoolman/env.py` | 1,3 | Added 6 env config functions (tigertag + nfc) |
| `spoolman/externaldb.py` | 1 | Added `source` field to `ExternalFilament` model |
| `spoolman/api/v1/externaldb.py` | 1 | Changed to JSONResponse merging SpoolmanDB + TigerTag |
| `spoolman/main.py` | 1,3 | Added tigertagdb sync + NFC service init on startup |
| `spoolman/api/v1/router.py` | 3 | Registered nfc router |
| `pyproject.toml` | 3 | Added optional `nfc = ["nfcpy>=1.0"]` dependency |
| `client/src/utils/queryExternalDB.ts` | 2 | Added `source` field to ExternalFilament interface |
| `client/src/components/filamentImportModal.tsx` | 2 | Added colored source Tag badges, searchText filtering |
| `client/public/locales/en/common.json` | 2,4 | Added `external.*` and `nfc.*` translation keys |
| `client/src/components/header/index.tsx` | 4 | Added NfcScannerModal alongside QRCodeScannerModal |
| `client/src/pages/spools/show.tsx` | 4 | Added "Encode to NFC" button + NfcWriteModal |

---

## Environment Variables Added

| Variable | Default | Description |
|----------|---------|-------------|
| `SPOOLMAN_TIGERTAG_ENABLED` | `FALSE` | Enable TigerTag external DB |
| `SPOOLMAN_TIGERTAG_API_URL` | `https://api.tigertag.io/` | TigerTag API base URL |
| `SPOOLMAN_TIGERTAG_SYNC_INTERVAL` | `3600` | Sync interval in seconds |
| `SPOOLMAN_NFC_ENABLED` | `FALSE` | Enable server-side NFC reader |
| `SPOOLMAN_NFC_READER_TYPE` | `nfcpy` | NFC reader library |
| `SPOOLMAN_NFC_DEVICE` | `None` (auto) | NFC device path |

---

## API Endpoints Added

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/nfc/status` | Reader status + enabled flag |
| `POST` | `/api/v1/nfc/read` | Read tag, decode TigerTag, match spool |
| `POST` | `/api/v1/nfc/write` | Encode spool as TigerTag, write to tag |

---

## Remaining TODO

1. **Manual testing with `SPOOLMAN_TIGERTAG_ENABLED=TRUE`**:
   - Check logs for "Syncing TigerTag DB"
   - `GET /api/v1/external/filament` should return entries with both sources
   - Filament import modal should show colored source badges
2. **NFC testing** (requires hardware):
   - `SPOOLMAN_NFC_ENABLED=TRUE` with PN532/ACR122U reader
   - `GET /api/v1/nfc/status` returns `connected`
   - Write/read cycle via spool detail page
   - Browser Web NFC on Chrome Android
3. **Edge cases to verify**:
   - TigerTag disabled: no tigertag entries in `/external/filament`, no errors
   - NFC disabled: NFC button hidden in UI, `/nfc/status` returns `disabled`
   - TigerTag API unreachable: graceful fallback, SpoolmanDB still works
   - nfcpy not installed: startup logs warning, NFC endpoints return error

---

## Architecture Notes

- TigerTag filaments get `id` prefixed as `"tigertag_{id_product}"` to avoid collisions with SpoolmanDB IDs
- TigerTag codec uses Python `struct` module (big-endian) - no external dependencies
- NFC service is a singleton initialized once at startup, thread-safe with lock
- Frontend NFC scanner FloatButton only renders if server NFC or Web NFC is available
- Web NFC (browser) mode writes NDEF URI records (`web+spoolman:s-{id}`)
- Server mode writes raw TigerTag Maker format (144 bytes to NTAG213 pages 4-39)
