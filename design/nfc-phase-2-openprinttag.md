# NFC Phase 2 — OpenPrintTag codec, import, and export

Status: design, not yet implemented. Depends on Phase 1.
Companion document: [`nfc-phase-1-tag-identity.md`](./nfc-phase-1-tag-identity.md).

---

## Why

Phase 1 answers "which spool is this tag?" using nothing but the hardware UID. Phase 2 answers the
question that requires actually understanding the tag:

> I bought a Prusament. I tapped it. Why do I still have to type in the material, colour, weight,
> density, diameter and temperatures?

That is **#776 — the highest-signal NFC issue in the tracker at 29 👍**, and it goes back further
than that: #66 asked for it in 2023, imagining "producers of the filament wanted to support Spoolman
and had premade tags on their spools." That future arrived; it is just called OpenPrintTag.

The mirror-image request is #799 and #828 — write tags *from* Spoolman, so a DIY user with 200
spools can burn a tag per spool and have their printer configure itself.

### Why OpenPrintTag specifically

Two open standards compete, and it is worth being explicit about why we back one.

| | **OpenPrintTag** | **OpenTag3D** |
|---|---|---|
| Origin | Prusa Research | Gooborg Studios / consortium |
| Licence | **MIT** | GPL-3.0 |
| Air interface | NFC-V / ISO 15693 / Type 5 | NFC-A / ISO 14443-A / Type 2 |
| Reference chip | ICODE SLIX2, 320 B | NTAG213/215/216, 144 B core |
| Encoding | CBOR, integer keys, 3 sections | fixed byte layout |
| Cheap reader | **PN5180 required** | PN532 (~$3) works |
| Shipping on retail spools | **Yes — Prusament today** | No |
| Catalog | 13,403 materials / 125 brands, MIT | — |

OpenPrintTag wins on the only criterion that ultimately matters: it is on spools people are buying
right now, with a published physical spec (2026-03) and Positron and Voron involved. As
ThatDudeDelta put it in #776, OpenTag3D has "lots of corporate backers but nobody actually shipping
products with it."

The counter-argument in that thread is real and worth recording — beikeland argues NFC-V tags are
harder and pricier to source than ubiquitous 25 mm NTAG215 stickers, and that a DIY user only needs
a UID anyway. **Phase 1 already grants him everything he wants**, which is precisely why it ships
first. Phase 2 serves the person buying a tagged retail spool, which is a different and growing
population.

### The strongest objection, and the answer

bofh69 — who has implemented more of this than anyone, across nfc2klipper and pn5180-tagomatic —
argued in #776:

> it makes little sense for spoolman to have support for any rfid tags, except by having fields for
> the data in the tags. There are already good interfaces for other programs to read/write from/to
> spoolman.

He is right that Spoolman must not own reader hardware, and Phase 1 grants his UID-only workflow in
full. But the codec is a different thing from the hardware. It is a pure, testable data
transformation that **five separate projects have now each reimplemented**: nfc2klipper,
ryanch/openprinttag_scanner, goeland86's fork, CASAI77/spoolscan and Houzvicka/FlipperPrintTag.
Every one of them re-derives CBOR field numbers and UUIDv5 namespaces by hand, and each is a
separate opportunity to get it subtly wrong. Centralizing that in Spoolman — where the filament data
model already lives — removes duplicated work from the ecosystem rather than competing with it.

The line we hold: **Spoolman owns the codec. It never owns the reader.**

---

## Codec

New package `spoolman/tags/`, with `openprinttag.py` as the first format. Pure Python, no hardware,
no I/O.

```python
def decode(payload: bytes, hw_uid: bytes) -> OpenPrintTag: ...
def encode(spool: Spool) -> bytes: ...
```

### Format shape

- Transport is an **NDEF record with MIME type `application/vnd.openprinttag`**. Parse the NDEF TLV
  inline — it is short and well-specified.
- Payload is **CBOR maps with integer keys**, in three sections:
  - **meta** — always at the start; region offsets and sizes for the other two.
  - **main** — static product data. Printers must not write here.
  - **aux** — optional, printer-writable. Notably key 0, `consumed_weight`.
- **UUIDv5 derivation** against four fixed namespaces (brand / material / package / instance).
  `instance_uuid` derives from `brand_uuid` plus the tag's hardware UID — which is why `decode()`
  takes `hw_uid` and not just the payload.

> **Re-derive every field number, type code and namespace UUID from the spec repo at implementation
> time.** Source of truth is `OpenPrintTag/openprinttag-specification`, files `data/main_fields.yaml`
> and `data/aux_fields.yaml`. The spec has already deprecated keys once (12, 25, 26). Do not code
> from any summary, including this document.

### Dependencies

One new dependency: **`cbor2`**.

Explicitly not added: `ndeflib` (the TLV parse is small enough to own), `nfcpy`, `libusb`, or
anything else that implies hardware. The container gains no new system packages.

---

## API

```
POST /api/v1/tag/decode   {payload_b64, uid}
  → {format, fields, matched_spool_id?, suggested_filament{...}, suggested_spool{...}}

POST /api/v1/tag/encode   {spool_id, format}
  → {payload_b64}
```

`decode` auto-detects the format from the payload so additional formats slot in behind the same
endpoint later without a new route. It is a **pure read** — it never writes to the database. The
caller decides whether to act on the suggestion, which keeps a mis-scan from silently creating
records.

`encode` returns bytes for an external writer to burn. This alone satisfies #828's "just give me the
data and I'll write it with my own tool", and it is what makes #799's DIY tag-writing workflow
possible without Spoolman touching a reader.

Creation stays on the existing endpoints: the client takes `suggested_*` and POSTs to `/filament`
and `/spool` as it would for any other source. No new "create from tag" endpoint — that would
duplicate validation that already exists.

---

## Field mapping

Tag → Spoolman. Names on the left are OpenPrintTag main-section fields.

| Tag field | Spoolman |
|---|---|
| `brand_name` / `brand_uuid` | vendor (get-or-create) |
| `material_name`, `material_type`, `material_class` | `filament.material`, `filament.name` |
| `primary_color` | `filament.color_hex` |
| `secondary_color_0..4` | `filament.multi_color_hexes` |
| `nominal_netto_full_weight` | `filament.weight` |
| `empty_container_weight` | `filament.spool_weight` |
| `density` | `filament.density` |
| `filament_diameter` | `filament.diameter` |
| print / bed temp fields | `filament.extruder_temp`, `filament.bed_temp` |
| `nominal_full_length` | informational |
| `gtin`, `manufactured_date`, drying fields, `country_of_origin` | extra fields, if the user has defined them |
| `instance_uuid` | `spool_tag` row (Phase 1) |
| aux `consumed_weight` | see below |

Reuse the get-or-create and de-dupe logic already proven in
`client_v2/src/lib/api/spoolSource.ts:227` — but implement it **server-side** this time, so every
client and every external tool benefits rather than just the web UI.

### De-duplication on import

A tag will be scanned many times. Import must be idempotent:

1. **`instance_uuid` or hardware UID matches a `spool_tag` row** → this spool already exists. Update
   nothing by default; just report the match.
2. **No tag match, but `external_id` matches a filament** → reuse that filament, create a new spool.
3. **Neither** → create vendor (if new), filament, and spool, then write the `spool_tag` row so step
   1 catches the next scan.

### `consumed_weight` — deliberately not synced

The aux section carries a printer-written `consumed_weight`. **Spoolman must not treat it as
authoritative.** Spoolman is the system of record for consumption, with its own `use`/`measure`
endpoints and a considerably more careful model. Two writers to one number, with no ordering
guarantee between a printer and Spoolman, is a data-corruption bug waiting to happen — and this
project has a standing non-negotiable about not losing user data.

Decode it, surface it, do not act on it. bofh69 reached the same conclusion independently in #776:
"Nothing I'd want to do anyway as Spoolman keeps track of the usage."

---

## Writing tags

Producing the bytes is `encode`. Getting them onto a tag is someone else's job, and the options are
uneven:

- **Web NFC** can write plain NDEF records, which covers OpenTag3D and the JSON formats — but it is
  a poor fit for OpenPrintTag, which needs region offsets aligned to physical tag blocks and SLIX2
  `PROTECT PAGE` for write protection. Web NFC exposes no block-level control. Treat OpenPrintTag
  writing from the browser as **unproven**, not merely unsupported.
- **External writers** (nfc2klipper with a PN5180, SimplyPrint's NFC Agent, a Prusa app) are the
  realistic path. `encode` serves them.

Consequence: ship `encode` and let the ecosystem write. Do not build a browser tag-writer for
OpenPrintTag until someone has demonstrated it works on real NFC-V hardware.

---

## Validation constraint — read this before starting

**PR #880 stalled at exactly this point.** Its author shipped a complete-looking OpenPrintTag
implementation and then wrote: *"I unfortunately don't have OpenPrintTag tested because I lack the
physical hardware at present."* The spec is not simple enough to implement blind.

Phase 2 requires, before it ships:

- A physical Prusament tag or Prusa NFC sticker.
- A PN5180 reader, or an Android phone — **a PN532 cannot read these tags.** This is the single most
  common failure in the community threads. Flipper Zero and iOS "NFC21 Tools" both *misreport*
  OpenPrintTag as NTAG213; only "NFC Tools" on iOS identifies it correctly as Type 5. bofh69 burned
  real time on this before ordering a PN5180.
- At least one real tag decoded end to end, not just fixtures.

Unit tests against spec fixtures are necessary but nowhere near sufficient. Do not ship this
claiming it works on the strength of a green test suite.

---

## Deferred, with reasons

**OpenTag3D** — fixed 144-byte layout, genuinely straightforward, and it slots in behind the same
`/tag/decode` dispatch. Not first only because nothing retail ships it. This is a good second format
and a natural first outside contribution.

**openprinttag-database as a catalog source** — 13,403 materials and 125 brands under MIT, raised by
anyasabo in #776 (2026-08-02), who already wrote an importer for their own fork and would rather not
maintain it. Arguably higher user value than tag reading itself. But it belongs in **SpoolmanDB**,
not in this repo, and should be tracked there.

**Vendor tag contents** (Bambu / Creality / Qidi / Elegoo) — Phase 1's UID identity already covers
these for identification, which is the part users actually need. Decoding contents means MIFARE key
derivation for no writable benefit: Bambu tags are RSA-signed and the printer rejects anything
unsigned, so third parties can read and clone but never forge. Elegoo's NTAG-based EPC-256 format is
open and would be easy, but is low-demand today.

**TigerTag** — implemented in PR #880 and in goeland86's fork. Reconsider if demand materializes;
discussion #710 is the only real signal so far.

---

## Files

New: `spoolman/tags/__init__.py`, `spoolman/tags/openprinttag.py`, `spoolman/api/v1/tag.py`.

Modified: `spoolman/api/v1/router.py` (mount the router), `pyproject.toml` (`cbor2`), and the
client_v2 spool-creation flow to offer a decoded tag as a spool source alongside the existing
external-database path.

---

## Verification

- **Codec unit tests** — fixtures built from the spec repo; round-trip `encode` → `decode`; every
  field type exercised (uuid, enum, enum_array, colour, timestamp, half-float); malformed and
  truncated payloads rejected cleanly rather than raising.
- **UUIDv5** — derived values checked against the spec's own examples. Getting a namespace wrong
  produces confident, entirely wrong output, so this needs explicit coverage.
- **Real hardware** — at least one physical Prusament tag decoded end to end. Non-negotiable, see
  above.
- **Import idempotency** — integration test in `tests_integration/`: decode-then-create, rescan,
  assert no duplicate spool, filament or vendor.
- **No consumption writes** — assert that importing a tag carrying `consumed_weight` leaves
  `used_weight` untouched.
- **API compat** — new endpoints only; confirm no existing response shape changed.
