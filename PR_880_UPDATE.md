## Qidi NFC Tag Support

This update adds support for **Qidi RFID tags** (MIFARE Classic 1K / FM11RF08S) alongside the existing TigerTag and OpenPrintTag formats.

### What's new

**Qidi tags** are ISO 14443A MIFARE Classic 1K tags used by Qidi 3D printers and the QIDIBOX filament management system. They store a simple 3-byte payload: material code, color code, and manufacturer ID. Spoolman now reads, writes, and auto-detects these tags through the same NFC infrastructure used for TigerTag and OpenPrintTag.

### How it works

- **Auto-detection**: The server-side NFC reader automatically detects whether a scanned tag is NTAG213 (TigerTag), NFC-V (OpenPrintTag), or MIFARE Classic (Qidi) and routes to the correct decoder.
- **UID-based binding**: Since Qidi tags only store material + color (no unique spool ID), binding uses the tag's hardware UID. Scan once to bind, and all future scans of that physical tag resolve to the same spool.
- **Fuzzy matching**: If no UID binding exists, Spoolman fuzzy-matches by material type and color hex against existing spools.
- **Auto-create**: Unrecognized Qidi tags can auto-create a spool with the correct Qidi vendor, material name (e.g. "Qidi PLA Silk"), and color.
- **Writing**: Spools can be written to blank MIFARE Classic 1K tags in Qidi format from the web UI.
- **Lookup endpoint**: The `/api/v1/nfc/lookup` endpoint accepts `tag_type: "qidi"` or auto-detects from 16-byte block data, so Klipper integrations work out of the box.

### Supported Qidi materials & colors

- **35 materials**: PLA, PLA Matte, PLA Silk, PLA-CF, ABS, ABS-GF, ASA, PA-CF, PAHT-CF, PETG, PETG-CF, PPS-CF, TPU, PVA, and more
- **24 colors**: White, Black, Red, Blue, Yellow, Orange, Green, Purple, Pink, and more — each mapped to an RGB hex value

### Authentication

Qidi tags use MIFARE Classic Crypto-1 authentication with Key A. Two keys are tried in sequence:
1. Qidi custom key: `D3:F7:D3:F7:D3:F7` (factory Qidi tags)
2. Default key: `FF:FF:FF:FF:FF:FF` (blank MIFARE Classic tags)

### Files changed

| File | Description |
|------|-------------|
| `spoolman/qidi_codec.py` | **New** — Material/color lookup tables, 3-byte encode/decode, auto-detection |
| `spoolman/qidi_lookup.py` | **New** — UID-based spool binding, fuzzy matching, auto-create |
| `spoolman/nfc_service.py` | Added `read_tag_auto()` with MIFARE Classic detection, dual-key auth read/write |
| `spoolman/api/v1/nfc.py` | Added `QidiTagDataResponse`, Qidi handling in all NFC endpoints |
| `client/src/utils/nfc.ts` | Added `QidiTagData` interface, updated request/response types |
| `client/src/components/nfcScannerModal.tsx` | Shows Qidi tag summary, creates spools from Qidi data |
| `client/src/components/nfcBindModal.tsx` | Supports Qidi UID-based tag binding |
| `client/src/components/nfcWriteModal.tsx` | Tag format selector (TigerTag / Qidi) |
| `client/public/locales/en/common.json` | New translation keys for Qidi UI |
| `README.md` | Updated NFC feature list |

### API examples

**Look up a Qidi tag (auto-detect):**
```bash
curl -X POST /api/v1/nfc/lookup \
  -d '{"raw_data_b64": "ARIBAAAAAAAAAAAAAAAAAA==", "nfc_tag_uid": "A1B2C3D4"}'
```

**Auto-create spool from Qidi tag:**
```bash
curl -X POST /api/v1/nfc/lookup \
  -d '{"raw_data_b64": "ARIBAAAAAAAAAAAAAAAAAA==", "tag_type": "qidi", "nfc_tag_uid": "DEADBEEF", "auto_create": true}'
```

**Write spool as Qidi tag:**
```bash
curl -X POST /api/v1/nfc/write \
  -d '{"spool_id": 1, "tag_format": "qidi"}'
```

### Reference

- [Qidi RFID Wiki](https://wiki.qidi3d.com/en/QIDIBOX/RFID)
- Tag chip: FM11RF08S (MIFARE Classic 1K compatible)
- Data location: Sector 1, Block 0 (absolute block 4)
- Protocol: ISO/IEC 14443-A, 13.56 MHz
