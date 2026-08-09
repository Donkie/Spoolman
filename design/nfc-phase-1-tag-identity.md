# NFC Phase 1 — Tag identity, lookup, and the scan relay

Status: design, not yet implemented.
Companion document: [`nfc-phase-2-openprinttag.md`](./nfc-phase-2-openprinttag.md).

---

## Why

NFC/RFID is the longest-running unanswered feature request in the tracker — 9 open issues and 3
discussions going back to 2024-01 (#260), with no maintainer reply on any of them. In the absence of
a first-party answer an entire external ecosystem grew up around Spoolman's API, and every one of
those projects independently worked around the same gap: **there is no way to ask Spoolman "which
spool is this physical tag?"**

The workarounds are the evidence:

- **beikeland** relocated his `lot_nr` data into `comment` purely so he could stash the tag UID in
  `lot_nr` and filter on it (#776).
- **kevinrmccoy** built a parallel Node-RED database mapping UID → spool id, and opened #716 asking
  for exactly this (`/api/v1/spool?extra.tag_uid=<uid>`).
- **ryanch** gave up on UID lookup entirely and wrote `spoolman_id` *into* the tag instead (#799).
- **FilaMan** writes `sm_id` into the tag for the same reason, then does a full-list `GET /spool/`
  and filters client-side.

`extra.<key>` filtering did ship in v0.26.0 (`spoolman/api/v1/spool.py:41`) and none of these
projects know it exists — worth announcing on its own. But it is an unindexed, non-unique,
case-insensitive substring match. It is a *filter*, not an *identity lookup*, and it cannot stop two
spools claiming the same tag.

### What Phase 1 unlocks

Phase 1 is deliberately **format-agnostic**: it keys only on the tag's hardware UID. That means it
works with blank NTAG215 stickers, Prusa NFC-V tags, TigerTag, and — importantly — Bambu, Creality
and Qidi MIFARE tags whose *contents* Spoolman can never decrypt or write. Every physical tag has a
UID; that is the one thing we can always rely on.

It is also a hard prerequisite for Phase 2, which needs somewhere to record a tag's UID and
`instance_uuid` so a rescan updates the existing spool instead of creating a duplicate.

What it does **not** cover is onboarding — buying a Prusament, tapping it, and having the vendor,
filament and spool created with correct material, color, weight, density and temperatures. That is
Phase 2 and needs the OpenPrintTag codec.

### Issues addressed

| Issue | Ask |
|---|---|
| #260 (2024-01) | RFID per-spool quick ID |
| #723 (9 👍) | Create NFC tags; read a tag to select the active spool |
| #716 (3 👍) | Look up a spool by UID through the API |
| #799 | Native RFID/NFC support, `nfc_id` matching |
| #884 | Put the NFC tag ID into the printed label's QR code |
| #783 | Per-spool action links so external tools live in Spoolman's UI |
| discussion #748 | ESP32 by the spool holder telling Spoolman what is loaded |

---

## Data model

One new table. Additive only — no existing column changes, so lossless by construction.

**Many tags per spool**, which is a real case, not a hypothetical: bofh69 described copying a Prusa
NFC-V tag's payload onto an NTAG215 so his PN532 could read it (#776), leaving one spool carrying
two physical tags with two different UIDs.

In `spoolman/database/models.py`, alongside `SpoolField` (`models.py:125`):

```python
class SpoolTag(Base):
    __tablename__ = "spool_tag"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    spool_id: Mapped[int] = mapped_column(ForeignKey("spool.id"), index=True)
    spool: Mapped["Spool"] = relationship(back_populates="tags")
    uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    format: Mapped[str | None] = mapped_column(String(32))
    added: Mapped[datetime] = mapped_column()
```

- `uid` — **normalized on write**: uppercase hex, separators stripped. Readers report UIDs in wildly
  different shapes (`04:A2:B3`, `04-a2-b3`, `04A2B3`). Normalize at the API boundary so lookups are
  exact and the unique constraint actually means something. Web NFC's `serialNumber` is
  colon-separated lowercase; nfcpy gives raw bytes.
- `format` — nullable free-ish string (`openprinttag`, `opentag3d`, `ntag`, `bambu`, `tigertag`,
  `qidi`). Informational in Phase 1; Phase 2 uses it. Not an enum in the DB — new tag types appear
  faster than migrations should.
- Unique index on `uid` is the point of the whole table: one tag, one spool, enforced.

On `Spool`, add the relationship following the `extra` convention at `models.py:94`:

```python
tags: Mapped[list["SpoolTag"]] = relationship(
    back_populates="spool",
    cascade="save-update, merge, delete, delete-orphan",
    lazy="selectin",
)
```

`lazy="selectin"` is not optional — see the comment at `models.py:10-21` about joined loading
wrecking the spool list query.

### Migration

New revision in `migrations/versions/`. CREATE TABLE plus indexes only.

CockroachDB needs index creation split out of the table-creation transaction; follow the pattern
already established in the repo's earlier migrations. Must be proven on all four supported databases
(SQLite, PostgreSQL, MySQL/MariaDB, CockroachDB) against a populated database, not an empty one.

---

## API

All additive, so API v1 compatible.

### Lookup

```
GET /api/v1/spool?tag=<uid>
```

New filter param on the existing `find` handler (`spoolman/api/v1/spool.py:158`). Exact match on the
normalized UID, hitting the unique index. Returns the standard spool list shape so existing clients
need no special handling.

### Link / unlink

```
POST   /api/v1/spool/{id}/tag        {uid, format?}   → 201
DELETE /api/v1/spool/{id}/tag/{uid}                   → 204
```

`POST` returns **409** if the UID is already linked to a different spool, with the conflicting spool
id in the body so a client can offer "move it to this spool instead". Re-posting the same UID to the
same spool is idempotent.

### Response model

Add `tags: list[SpoolTag]` to the `Spool` response model (`spoolman/api/v1/models.py:285`). Safe for
existing consumers: responses use `response_model_exclude_none=True`, and this is a new key rather
than a changed one.

### Events

Link and unlink emit the existing `SpoolEvent` through `spool_changed`
(`spoolman/database/spool.py:752`), after commit — the ordering there is deliberate. No new
websocket resource is needed for this part.

---

## How the reader connects to Spoolman

**Spoolman never talks to reader hardware. The reader talks to Spoolman.**

The reader is almost never on the Spoolman host. Spoolman typically runs in Docker on a NAS or a
Proxmox box, while the tag gets tapped at the printer, at a dryer, or at a desk. Three supported
topologies, none of which require Spoolman to know anything about NFC hardware:

| Topology | Reader location | Path to Spoolman | Reality check |
|---|---|---|---|
| **Phone** | in your hand | client_v2 Web NFC → REST | Android Chrome only, and requires a **secure context** — HTTPS or `localhost`. `http://192.168.x.x` will not work. Good for desk work; never the primary path. |
| **Reader-side agent** | printer / dryer / shelf | nfc2klipper, FilaMan, ESPHome, Node-RED, HA → REST | The dominant real topology. Already works today; it just needs `?tag=<uid>`. |
| **WebUSB / WebSerial** | desk, USB dongle | Chrome desktop → ACR122U or ESP32 | kquinsland's suggestion (#799). Secure context again, plus per-device quirks. Document as possible; do not build in-tree. |

**Explicitly rejected: a USB reader on the Spoolman host.** This is what PR #880 does
(`SPOOLMAN_NFC_ENABLED` + `nfcpy` + `libusb` in the image). It serves only bare-metal users who
handle spools at their server, and it buys that with USB passthrough, udev rules, and PUID/PGID
problems in a containerized app. bofh69's PN5180 work, nfc2klipper, FilaMan and ESPHome already own
this layer and do it better.

The HTTPS requirement on the phone path is not something we can engineer around — Web NFC grants no
private-IP exemption. Document it. Users behind a reverse proxy get it for free.

---

## The scan relay

This is the one genuinely new capability in the plan. Everything else exposes data that external
tools already want; this does something none of them can do alone.

**The idea.** A reader-side agent POSTs a scan. Spoolman broadcasts it over a websocket. A browser
that has been *paired* with that reader reacts — if the tag maps to a known spool, it navigates
straight to that spool.

**Why it matters.** It decouples *where the reader is* from *where the user is looking*. Click "Link
a tag" on your desktop, walk to the printer, tap the tag on the PN532 there, and the dialog fills
in. Or: a wall tablet by the printer sits on the spool list, and tapping any spool's tag pulls it up
instantly.

### Endpoint

```
POST /api/v1/tag/scan
  { uid, reader_id?, name?, format?, payload_b64? }
→ { matched_spool_id?, spool? }
```

It broadcasts **and** returns the match, so a dumb agent can use it as a one-shot lookup and ignore
websockets entirely. `payload_b64` is accepted here in Phase 1 but only carried in the broadcast
event; Phase 2 is what decodes it.

Scans are **ephemeral** — broadcast only, never persisted. No new table, no history.

### Separate websocket pool (important)

Scans must **not** go through the shared `websocket_manager`. `SubscriptionTree.send()`
(`spoolman/ws.py:46`) broadcasts to subscribers at *every level along the path*, and the root
endpoint `/api/v1/` subscribes with pool `()` — "listen to any changes" (`router.py:90`). Putting
scans in the shared tree would inject a novel `resource` into every existing root consumer's stream.
That is an API v1 compatibility problem for no benefit.

Instead: a **second `WebsocketManager` instance** dedicated to scans, reusing `SubscriptionTree`
as-is. Entity streams stay exactly as they are.

```
WS /api/v1/tag/scan             → pool ()            — every reader
WS /api/v1/tag/scan/{reader_id} → pool (reader_id,)  — one reader
```

The tree's propagate-along-the-path behaviour gives "follow all readers" for free at the root, which
is exactly the semantics we want.

Event model: add `SCANNED = "scanned"` to `EventType` and a `TagScanEvent(Event)` with
`resource: Literal["tag_scan"]` (`spoolman/api/v1/models.py:604`). Because it only ever travels on
the scan manager, no existing consumer can see it.

### Pairing: binding a scanner to one browser

The requirement is that a scan drives *one* browser, not every open tab.

**Chosen approach: reader identity, browser-side subscription.** The reader declares who it is; the
browser chooses which reader to follow. The server holds no pairing state at all.

- Every agent sends a `reader_id` — an operator-chosen string like `printer-voron` or `shelf-a`.
- A browser subscribes to `/api/v1/tag/scan/{reader_id}` for the reader it cares about, and stores
  that choice in `localStorage` (a per-device UI preference, which is what localStorage is for in
  this codebase).
- A browser that wants everything subscribes to `/api/v1/tag/scan` explicitly.

Why this one: the decision lives in the browser, so there is no server-side session registry to
build, expire, or keep consistent across restarts. It needs no auth. A wall tablet by printer A
follows reader A forever; your laptop follows nothing until you tell it to.

**Pairing UX — pair by tapping, not by typing.** Nobody should have to type `printer-voron` into a
settings box. The flow:

1. User clicks "Pair a scanner" in the browser.
2. That browser *temporarily* subscribes to the root scan pool — all readers.
3. User walks over and taps any tag on the reader they want to pair with.
4. The first scan that arrives carries its `reader_id`. The browser pins it, drops the root
   subscription, and resubscribes to just that reader.

Physical pairing, zero configuration, and it is self-evidently correct to the user because they
performed the binding with their hands.

**Reader discovery.** The server keeps an in-memory registry of readers seen recently — `reader_id`,
optional friendly `name`, `last_seen` — exposed as `GET /api/v1/tag/reader`. Ephemeral, no
persistence; a reader reappears the moment it scans again. This backs a "choose a reader" dropdown
for people who prefer it to tap-to-pair.

**Agents that cannot send a `reader_id`.** Some setups are a dozen lines of ESPHome YAML (see
discussion #748) and will not be rewritten. If `reader_id` is absent, derive a stable one from the
client address — `ip-192-168-1-50`. Ugly but stable, and it makes tap-to-pair work with a completely
unmodified agent.

**Alternatives considered.** A server-issued pairing code (browser displays a 6-character code, the
operator configures it into the agent) — more work for the user and adds server state, with no
benefit over tap-to-pair. A browser-generated session token shown as a QR for the agent to scan —
solves a problem we do not have. A dedicated physical "pairing tag" — cute, too clever, another
thing to lose.

### Auto-navigate behaviour

On receiving a scan whose UID matches a spool, an enrolled browser navigates to that spool. Reuse
exactly what `QrScannerModal.svelte:26-30` already does:

```ts
goto(resolve(`/?sel=spool:${id}`));
```

Guard rails, all of which matter:

- **Off by default**, toggled per browser. A page that navigates itself without being asked is
  hostile.
- **Only on a match.** An unknown UID must never navigate; it should offer "link this tag to a
  spool" instead (and in Phase 2, "create a spool from this tag").
- **Never hijack.** Suppress navigation when a modal is open or an editor has unsaved changes.
  Losing a half-typed spool because someone tapped a tag in the next room is unacceptable.
- **Debounce.** Readers poll continuously — nfc2klipper re-reads a tag for as long as it sits on the
  reader, so the same UID will fire repeatedly. Ignore an identical `(uid, reader_id)` within a few
  seconds. Cheapest correct place is server-side, before broadcast, so every subscriber benefits.

### Security note

Spoolman ships with no authentication. Any device on the LAN can POST a scan and make paired
browsers navigate. The blast radius is navigation only — no data is written by a scan — but it
should be stated plainly in the docs rather than discovered. An unguessable `reader_id` acts as a
weak shared secret for users who care; do not present it as a real one. This is consistent with the
existing threat model, where anyone on the LAN can already `DELETE` a spool.

---

## Client work (`client_v2`, SvelteKit / Svelte 5)

- **Spool inspector**: list linked tags, unlink, and add a tag.
- **Link a tag via Web NFC** where available. `NDEFReader` exposes `serialNumber` on read, which is
  all Phase 1 needs — no NDEF parsing required. Progressive enhancement: hide the control entirely
  when `'NDEFReader' in window` is false, which covers desktop, iOS, Firefox, and any plain-HTTP
  install. Model it on `QrScannerModal.svelte`; put parsing and normalization in
  `client_v2/src/lib/utils/spoolCode.ts`, which already owns the `WEB+SPOOLMAN:` scheme.
- **Link a tag via the relay**: the "add a tag" dialog subscribes to the paired reader and fills in
  the next UID scanned. This is the flow that makes the relay worth building.
- **Scanner pairing UI**: pair-by-tap, current pairing, unpair, and the auto-navigate toggle.
- **Live connection**: `client_v2/src/lib/api/live.ts:10` hardcodes
  `Resource = 'spool' | 'filament' | 'vendor'` and one socket per resource. The scan socket has a
  different URL shape (`/tag/scan/{reader_id}`) and a different payload, so it is cleaner as a small
  separate module reusing the reconnect/backoff approach than as a fourth `Resource`.

---

## Two cheap wins to land alongside

**#884 — QR code carrying the tag id.** `client_v2/src/lib/labels/qr.ts:20` substitutes only `{id}`
in a custom template. Route it through the resolver in `client_v2/src/lib/labels/template.ts:35`,
which already handles `{spool.id}`, `{spool.extra.<key>}`, `{filament.name}` and friends, so a label
QR can carry a tag UID. Small and self-contained.

**#783 — per-spool action links.** A settings-driven list of `{name, url_template}` rendered in the
spool overflow menu. bofh69 asked for exactly this so nfc2klipper's "write tag" button can live
inside Spoolman instead of on a second web page. New setting via the one-line `register_setting`
pattern (`spoolman/settings.py:64`). This is the cheapest possible unblock for the entire external
ecosystem and should probably ship regardless of the rest.

---

## Out of scope

- **Reader hardware in the container** — permanently. See above.
- **Decoding tag contents** — Phase 2.
- **Vendor tag contents** (Bambu / Creality / Qidi / Elegoo). UID identity already covers them for
  identification. Decoding adds MIFARE key derivation for no writable benefit: Bambu tags are
  RSA-signed and the printer rejects anything unsigned, so third parties can read but never forge.

---

## Verification

- **Migration** — 4-DB integration suite. Prove the upgrade on a *populated* database and confirm
  the CockroachDB index split behaves.
- **API** — integration tests in `tests_integration/tests/spool/`: link, duplicate-UID 409, unlink,
  idempotent re-link, `?tag=` exact match, UID normalization across input shapes, cascade on spool
  delete, and that `tags` appearing in the spool response breaks no existing assertion. Precedent:
  `tests_integration/tests/spool/test_related_extra_filter.py`.
- **Relay** — two websocket clients on different reader pools; assert a scan reaches only the right
  one, that root subscribers get both, and that the **existing** `/api/v1/` root entity stream sees
  no scan events at all. That last assertion is the API-compat guard.
- **Debounce** — repeated identical scans produce one broadcast.
- **Client** — Playwright in `client_v2/e2e/`. Manually confirm the Web NFC control is hidden on
  desktop and over plain HTTP, and works on Android Chrome over HTTPS.
- **Lint/i18n** — repo lint, typecheck, i18n checks. `npm run build` rewrites every
  `locales/*/common.json`; revert before staging.

---

## Communications

- Comment on #776, #723, #799 and #716 that `extra.<key>` filtering landed in v0.26.0. That alone
  unblocks several downstream projects today and none of them know.
- **PR #880** (goeland86, TigerTag + OpenPrintTag + Qidi, +6512/−901, 36 files): decline as-is. It
  targets the legacy React client, vendors `nfcpy` and `libusb` into the Docker image, ships
  `.claude/settings.local.json` and session logs, and the author states the OpenPrintTag path is
  untested for lack of NFC-V hardware. Reply explaining the direction, credit the work, and invite
  the codec back on top of this tag model.
- bofh69 (nfc2klipper), beikeland, ryanch and the FilaMan successor maintainers are the natural
  design reviewers. They have all built this twice already.
