# NFC Phase 1 — Tag identity, lookup, and the scan relay

Status: implemented. This document is the design as built, kept for the reasoning behind the
decisions rather than as a plan; the endpoint reference that users need lives in
[`wiki-tag-scanners.md`](./wiki-tag-scanners.md) and the generated API docs.
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
class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    target_type: Mapped[str] = mapped_column(String(16))
    spool_id: Mapped[int | None] = mapped_column(ForeignKey("spool.id"), index=True)
    spool: Mapped["Spool | None"] = relationship(back_populates="tags")
    filament_id: Mapped[int | None] = mapped_column(
        ForeignKey("filament.id", ondelete="CASCADE"), index=True
    )
    target_value: Mapped[str | None] = mapped_column(String(64))
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
- Unique index on `uid` is the point of the whole table: one physical tag identifies exactly one
  thing, enforced.

### Why the table is wider than "spool tags"

Only spools are tagged in Phase 1, and only `POST /spool/{id}/tag` exists. The *table* is general
because the expensive half of this decision is the one that cannot be revisited cheaply: renaming a
table, dropping a NOT NULL and adding a discriminator all mean altering a populated table on four
databases, whereas adding an endpoint later is additive and free. The shape was settled before
release, while the migration had shipped to nobody.

Two kinds of target, and the difference is the whole reason for the shape:

- **Targets that are rows** — a spool, later a filament — get real foreign keys, so the database
  keeps referential integrity and cascades deletes. A tag row orphaned by a deleted spool is exactly
  the class of silent rot this project cannot afford.
- **Targets that are not rows** — a *location* is a `String(64)` on `Spool`, not a table, so a tag
  meaning "show me Shelf A" can only ever carry the value. `target_value` holds it, and a new kind of
  this sort (a saved search, say) costs **no migration at all**: only a new `target_type` string.

`target_type` names which is in force rather than leaving readers to infer it from whichever column
is non-null — a kind that populates neither would otherwise be unreadable.

**No CHECK constraint** enforces "exactly one target". No migration in this tree uses one, and MySQL
below 8.0.16 parses and silently ignores them, so a CHECK here would be real on three databases out
of four. `spoolman/database/tag.py` is the single write path instead — the same argument, and the
same module, as `normalize_uid`.

**`filament_id` has no ORM relationship yet.** Nothing writes filament tags, and a `selectin`
collection on `Filament` would add a query to every filament listing for rows that cannot exist.
`ON DELETE CASCADE` holds integrity meanwhile; the relationship arrives with the feature.

On `Spool`, add the relationship following the `extra` convention at `models.py:94`:

```python
tags: Mapped[list["Tag"]] = relationship(
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
| **WebUSB / WebSerial** | desk, USB dongle | Chrome desktop → ACR122U or ESP32 | kquinsland's suggestion (#799). Secure context again, plus per-device quirks. Document as possible; do not build in-tree for now. |

### A USB reader on the Spoolman host: not now, not ruled out

There is real demand for plugging an ACR122U into the machine Spoolman runs on, and it is a
perfectly reasonable thing to want if you keep your spools next to your server. It is simply not
what Phase 1 builds, for reasons that are about sequencing rather than principle:

- Spoolman is overwhelmingly run in Docker, and a host reader means USB passthrough, udev rules and
  PUID/PGID handling — a support surface that lands on one maintainer.
- It would pull `nfcpy` and `libusb` into the default image for a feature most users cannot use.
- The reader is *not* where the spool is for most people. Solving the remote-reader case first is
  strictly more useful, and it is the case the existing ecosystem is already built around.

The important part is that **nothing in this design forecloses it**, and that is deliberate. The
reader-to-Spoolman contract is a plain public HTTP endpoint (`POST /api/v1/tag/scan`, below), not an
internal hook. A first-party host-side reader is therefore not an architectural change later — it is
one more client of the same endpoint, and it can arrive as any of:

- an **optional extra** (`pip install spoolman[nfc]` / a `-nfc` image variant) that starts a local
  reader loop, opt-in and off by default;
- a **sidecar container** with the USB device passed to it instead of to Spoolman, published
  alongside the main image;
- a small **first-party agent** users run on bare metal, sharing nothing with the server but the
  endpoint.

If any of those ship, they POST the same body from the same schema and every browser-side feature
(pairing, auto-navigate, fill-in-the-dialog) works unchanged, because to the server a local reader is
indistinguishable from one across the house. PR #880's approach — `SPOOLMAN_NFC_ENABLED` with
`nfcpy` and `libusb` baked into the default image — is the version we are not taking; the capability
it wants is not the problem.

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
should be stated plainly in the docs rather than discovered. This is consistent with the existing
threat model, where anyone on the LAN can already `DELETE` a spool.

An earlier draft of this section offered an unguessable `reader_id` as a weak shared secret for
users who care. Shipping the reader registry killed that idea and the docs should not repeat it:
`GET /api/v1/tag/reader` hands every recently-seen reader id to any caller, because that is what
the "choose a reader" picker reads. The obscurity is worth nothing, so do not offer it.

---

## What a scanner actually is

"An ESPHome device" is doing a lot of work in the sections above. This one makes it concrete: what a
scanner must do, what hardware to buy, and what the firmware looks like. The short version is that a
scanner is a **~10 EUR ESP32 that makes one HTTP POST per tap**, and that most of the code below is
boilerplate rather than logic.

### The contract, in full

Everything a device must implement:

```http
POST /api/v1/tag/scan HTTP/1.1
Host: spoolman.local:7912
Content-Type: application/json

{"uid": "04-A2-B3-C4-D5-E6-F7", "reader_id": "printer-voron", "name": "Voron spool holder"}
```

Match:

```json
{"matched_spool_id": 42, "spool": { ...standard spool object... }}
```

No match:

```json
{"matched_spool_id": null}
```

That is the entire integration. No auth, no handshake, no websocket, no inbound port on the device,
no polling, no persistent connection, no library. Anything that can do an HTTP POST with a JSON body
qualifies — which is why Node-RED, Home Assistant, a shell script and a microcontroller are all
first-class here without Spoolman shipping code for any of them.

A device may ignore the response entirely. Reading it buys two things worth having: a green/red LED
on `matched_spool_id` being non-null, and a "tag not known yet" beep that tells the user to go link
it.

### Requirements on the device

| Requirement | Why |
|---|---|
| Reads **ISO14443A** UIDs | Covers NTAG213/215/216, MIFARE Classic/Ultralight, and thus Bambu, Creality, Qidi, TigerTag and most blank stickers. This is the 90% case. |
| Optionally reads **ISO15693 / NFC-V** | Needed only for Prusa's tags. PN532 **cannot** do this; PN5180 or ST25R3911 can. Note it in docs — people buy the wrong module otherwise. |
| Sends the UID as hex | Any separator style, any case. The server normalizes (uppercase, separators stripped), which is exactly why that rule exists in the data model — ESPHome emits `04-a2-b3`, nfcpy hands you raw bytes, Web NFC gives colon-separated lowercase. |
| Sends a stable `reader_id` | Tap-to-pair binds a browser to this string. Device hostname is the obvious default. If omitted, the server derives `ip-192-168-1-50`, which works but breaks on DHCP churn. |
| Survives Spoolman being down | Fire-and-forget. A scanner that blocks, retries in a tight loop, or reboots because the server is restarting is a worse device than one that drops the scan. |
| Doesn't spam faster than ~2 Hz | Readers re-detect a tag that is sitting still. The server debounces identical `(uid, reader_id)` pairs, so correctness doesn't depend on the device, but 1 Hz polling is plenty and keeps logs readable. |
| Nothing else | No mDNS discovery, no registration step, no device-side state. A scanner that has never talked to Spoolman before works on its first tap. |

### Reference hardware

| Part | Cost | Notes |
|---|---|---|
| ESP32 dev board (or ESP8266) | ~4 EUR | Any board ESPHome supports. WiFi is the only requirement. |
| **PN532** module (Elechouse V3 and clones) | ~5 EUR | The default choice. I²C, SPI or UART. ISO14443A only — no Prusa NFC-V. Run it at 3.3 V. |
| **RC522** module | ~2 EUR | Cheaper, SPI only, ISO14443A. Fine if all you want is UIDs, which in Phase 1 is all you want. |
| **PN5180** module | ~12 EUR | Adds ISO15693/NFC-V, so Prusa tags work. This is what bofh69 uses. No ESPHome component — needs custom firmware or a Pi. |

Plus a USB power supply and, optionally, a WS2812 LED for feedback. There is no enclosure design or
custom PCB in this plan; that is community territory and the community is already there.

### Reference firmware: ESPHome, complete

This is the whole device. It is ~30 lines, none of which are Spoolman-specific except the URL.

```yaml
esphome:
  name: spool-reader-voron

esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

logger:

i2c:
  sda: GPIO21
  scl: GPIO22

http_request:
  id: http
  timeout: 5s

pn532_i2c:
  update_interval: 1s
  on_tag:
    then:
      - http_request.post:
          url: http://spoolman.local:7912/api/v1/tag/scan
          capture_response: true
          request_headers:
            Content-Type: application/json
          json: |-
            root["uid"] = x;
            root["reader_id"] = "printer-voron";
            root["name"] = "Voron spool holder";
          on_response:
            then:
              - logger.log:
                  format: "Spoolman replied %d"
                  args: ['response->status_code']
```

Notes that matter when this becomes documentation:

- `x` in `on_tag` is the UID as a dash-separated hex string. ESPHome's casing has changed across
  releases, which is precisely the normalization case the data model handles — the device does not
  need to care.
- `on_tag_removed` gives the inverse event for free. Phase 1 does nothing with it, but "spool
  removed from holder" is an obvious later feature and the hardware already reports it.
- The `json:` lambda form builds the body without string concatenation, so a UID containing anything
  unexpected cannot break the request.
- Reading `response->status_code` (and, with `capture_response: true`, the body) is what drives an
  LED. Optional, and worth showing anyway because it is the difference between a device people trust
  and a device people tap twice.

### Reference firmware: a Pi, in Python

For a PN5180 or a USB dongle on a machine that already exists — a Klipper host, say — there is no
firmware to flash. The equivalent is short enough to paste into the docs:

```python
import nfc, requests

SPOOLMAN = "http://spoolman.local:7912/api/v1/tag/scan"
READER_ID = "printer-voron"

def on_connect(tag):
    uid = tag.identifier.hex()
    try:
        r = requests.post(SPOOLMAN, json={"uid": uid, "reader_id": READER_ID}, timeout=5)
        print(uid, r.json().get("matched_spool_id"))
    except requests.RequestException as e:
        print("spoolman unreachable:", e)   # drop the scan, never crash
    return True   # keep polling

with nfc.ContactlessFrontend("usb") as clf:
    while True:
        clf.connect(rdwr={"on-connect": on_connect})
```

The same shape is a Node-RED flow of three nodes, or a Home Assistant automation on the
`tag_scanned` event.

### Does this already exist?

Mostly yes, which is the point — the missing piece is the endpoint, not the devices.

| Project | Hardware | Talks to | What changes |
|---|---|---|---|
| **nfc2klipper** (bofh69) | PN532 or PN5180 on a Pi, UART | Moonraker `SET_ACTIVE_SPOOL`, and Spoolman for lookup via `extra.nfc_id` | Swap the `extra` filter for `?tag=` / the scan endpoint. It already does everything else, including writing tags. |
| **FilaMan** (Fire-Devils) | ESP32 + PN532 + load cell | Spoolman REST, writes `sm_id` into the tag | Could drop the write-into-tag workaround entirely and key on UID. |
| **SpoolmanScale** | ESP32-S3 + PN532 + scale | Spoolman REST | Same. |
| **OpenSpool** (spuder) | Wemos S3 + PN532, ESPHome | Bambu printer over MQTT | Add one `http_request.post` alongside the MQTT publish. |
| **discussion #748** | ESP32 + PN532 over I²C, ESPHome | Moonraker `/server/spoolman/spool_id`, after digging `sm_id` out of the NDEF records | Change the URL and send `x` instead of parsing NDEF. It gets *shorter*. |

Every one of these already POSTs somewhere on a tag read. None of them can ask "whose tag is this?",
so each invented a way to smuggle a Spoolman id into the tag's contents — which fails the moment the
tag is a vendor tag you cannot write to. That is the gap `?tag=` closes, and the reason the scan
endpoint is worth publishing as a stable contract rather than an implementation detail.

**What Spoolman ships here: documentation, not firmware.** A docs page with the contract, the YAML
above, the Python above, and a `curl` line for testing without any hardware at all:

```sh
curl -X POST http://localhost:7912/api/v1/tag/scan \
  -H 'Content-Type: application/json' \
  -d '{"uid":"04A2B3C4D5E6F7","reader_id":"desk"}'
```

That last one matters more than it looks: it means the entire browser-side experience — pairing,
auto-navigate, fill-the-dialog — is testable, demoable and debuggable with no NFC hardware in the
room, and it is what the Playwright tests will drive.

---

## Implementation architecture

Where the code goes, and why there rather than somewhere else. No full implementations here — the
data model, endpoints and protocol above are the spec; this is the file layout and the seams.

### Backend — new modules

| Path | Contents | Why its own module |
|---|---|---|
| `spoolman/tags.py` | `normalize_uid()`, the known-format constants | Pure, no DB and no FastAPI, so it unit-tests in `tests/` with no fixtures. Same shape as the existing `colors.py` and `math.py`. |
| `spoolman/database/tag.py` | `link()`, `unlink()`, `find_spool_by_uid()` | Follows `database/spool.py` conventions: `AsyncSession` first, raising `ItemNotFoundError` / `ItemCreateError` from `exceptions.py`. Kept out of `spool.py`, which is already ~800 lines and the largest module in the tree. |
| `spoolman/scanrelay.py` | Debounce cache and reader registry, as a class | Relay state is not database state and not HTTP state. Isolating it means the debounce window and registry eviction are testable without a socket or a session. |
| `spoolman/api/v1/tag.py` | `/tag/scan` POST, `/tag/reader` GET, the two scan websockets | Mirrors the one-router-per-resource layout of `spool.py` / `vendor.py` / `field.py`. Thin: it validates, delegates, and broadcasts. |
| `migrations/versions/<rev>_tags.py` | CREATE TABLE + indexes | — |

`database/tag.py` imports `spool.spool_changed` to emit the update event. One direction only, so no
import cycle; the reverse (spool.py knowing about tags) is not needed because the relationship is
declared on the ORM model.

### Backend — modified

| File | Change |
|---|---|
| `spoolman/database/models.py` | `Tag` ORM class next to `SpoolField` (`models.py:125`); `Spool.tags` relationship with `lazy="selectin"`. |
| `spoolman/api/v1/models.py` | `SpoolTag` response model; `tags` field on `Spool` (`models.py:285`); `SCANNED` on `EventType` (`models.py:604`); `TagScanEvent(Event)` with `resource: Literal["tag_scan"]`. |
| `spoolman/database/spool.py` | `find()` gains a `tag: str \| None` kwarg, applied inside `_apply_spool_filters` (`spool.py:259`). |
| `spoolman/api/v1/spool.py` | `tag` query param wired into the `find` handler; `POST /spool/{id}/tag` and `DELETE /spool/{id}/tag/{uid}` on the existing router. |
| `spoolman/ws.py` | One added module-level `scan_websocket_manager = WebsocketManager()`. `SubscriptionTree` and `WebsocketManager` themselves are untouched. |
| `spoolman/api/v1/router.py` | `app.include_router(tag.router)` alongside the others. |

### Backend — decisions worth recording

**Normalization happens once, at the database layer.** `database/tag.py` normalizes on the way in and
on every lookup; the API layer passes strings straight through. Putting it in a Pydantic validator
would read better but only covers callers that arrive over HTTP — the unique constraint is worthless
if any other path (a future importer, a migration backfill, Phase 2's codec) can write a
differently-shaped UID.

**`?tag=` is a join, not a subquery.** Added in `_apply_spool_filters` so the list query and the
count query stay in sync automatically — they share that builder. Because `uid` is unique, at most
one `tag` row can match, so a plain join cannot multiply result rows and the existing
`contains_eager` chain for filament/vendor is unaffected.

**Link and unlink emit `SpoolEvent`, not a new event type.** They mutate a spool as far as any client
is concerned, and the existing `spool_changed` (`spool.py:752`) already fires after commit. The
practical payoff is on the client: `inventory.ingest` updates the cached spool, and every open
inspector re-renders with the new tag list without a single line of client-side wiring.

**Relay state is per-process, and that is a documented limit.** `entrypoint.sh:52` runs one uvicorn
process with no `--workers`, so a module-level registry and debounce cache are correct as deployed. A
user who appends `--workers 4` gets a partitioned registry and a per-worker debounce window. Say so
in the docs; do not add Redis or a database table to fix a configuration nobody ships.

**Debounce suppresses the broadcast, not the response.** A device that re-reads a resting tag still
gets its `matched_spool_id` back on every POST — a de-duplicated scan must not look to the device
like a failed lookup. Only the websocket fan-out is skipped.

**Reader registry eviction happens on read.** `GET /tag/reader` prunes entries past their TTL as it
builds the response. No background task, no lifecycle hook, nothing to shut down cleanly.

### Frontend — new files

| Path | Contents |
|---|---|
| `client_v2/src/lib/api/tags.ts` | REST calls: link, unlink, look up by UID. Sits with the other per-resource API modules (`spoolSource.ts`, `labelDesigns.ts`). |
| `client_v2/src/lib/api/scanRelay.ts` | The scan websocket client: connect, resubscribe, reconnect. |
| `client_v2/src/lib/stores/scanner.svelte.ts` | Paired `reader_id`, auto-navigate toggle, most recent scan. localStorage-backed, following `theme.svelte.ts`. |
| `client_v2/src/lib/utils/nfc.ts` | Web NFC wrapper plus the `'NDEFReader' in window` capability check, so no component touches the API directly. |
| `client_v2/src/lib/components/TagsSection.svelte` | The inspector's tag list and unlink control, modeled on `ExtraFieldsSection.svelte`. |
| `client_v2/src/lib/components/AddTagModal.svelte` | Link a tag by relay scan, by Web NFC, or by typing a UID. |
| `client_v2/src/lib/components/settings/ScannerSettings.svelte` | Pair by tap, show current pairing, unpair, auto-navigate toggle. |

### Frontend — modified

| File | Change |
|---|---|
| `client_v2/src/lib/types.ts` | `tags: SpoolTag[]` on `Spool` (`types.ts:58`). |
| `client_v2/src/lib/api/map.ts` | `mapSpool` maps the new array (`map.ts:77`). |
| `client_v2/src/lib/components/library/SpoolInspector.svelte` | Render `TagsSection`. |
| `client_v2/src/routes/settings/+page.svelte` | Mount `ScannerSettings`. |
| `client_v2/src/routes/+layout.svelte` | Start the relay subscription alongside `startLiveSync()`. |
| `client_v2/locales/en/common.json` | New message keys. English only — every other locale is Weblate's job, and `npm run build` rewrites all of them, so revert before staging. |

### Frontend — decisions worth recording

**`scanRelay.ts` stays separate from `live.ts`.** `live.ts:10` is built around
`Resource = 'spool' | 'filament' | 'vendor'`, one socket per resource, each feeding
`inventory.ingest` through `liveSync.ts`. A scan is not an entity, must never enter the inventory
cache, and its URL carries a reader id rather than a resource name. Adding it as a fourth `Resource`
would break that module's one clear contract. Copy the reconnect/backoff shape — the exponential
backoff with jitter, the `online` and `visibilitychange` listeners, the 401-detection path through
`auth.ts` — rather than generalizing the module to hold both.

**Exactly one relay subscriber, started in the root layout.** Next to `startLiveSync()`, not inside
whichever component happens to care. Two mounted components each reacting to the same scan is how you
get a double navigation. Components read the last scan from the store instead.

**Auto-navigate guards read existing state.** "A modal is open" comes from `ui.svelte.ts`. There is no
global dirty-state registry to consult — inline inspector fields write through on change via
`trackSave` (`utils/autosave.ts`), so there is rarely unsaved work to lose — which leaves a focused
input as the case worth suppressing on. If the guard list grows past that, add a small
`suppressNavigation` registry to the scanner store rather than threading props.

**Web NFC is progressive enhancement, not a code path with a fallback.** The control is absent, not
disabled, when `'NDEFReader' in window` is false — which is desktop, iOS, Firefox, and every
plain-HTTP install. `NDEFReader` exposes `serialNumber` on read, so Phase 1 needs no NDEF parsing at
all. Model the permission and error handling on `QrScannerModal.svelte`, which already does the work
of turning an opaque browser failure into a specific reason.

**UID parsing does not belong in `spoolCode.ts`.** That module owns the `WEB+SPOOLMAN:` label scheme
and maps a scanned code to an entity reference (`spoolCode.ts:26`). A tag UID is neither — it is an
opaque identifier resolved by the server. Keeping them apart avoids a parser that returns two
unrelated kinds of thing.

---

## A cheap win to land alongside

**#783 — per-spool action links.** A settings-driven list of `{name, url_template}` rendered in the
spool overflow menu. bofh69 asked for exactly this so nfc2klipper's "write tag" button can live
inside Spoolman instead of on a second web page. New setting via the one-line `register_setting`
pattern (`spoolman/settings.py:64`). This is the cheapest possible unblock for the entire external
ecosystem and should probably ship regardless of the rest.

---

## Out of scope

- **Reader hardware driven by the Spoolman process** — not in Phase 1. Revisit later as an opt-in
  extra or sidecar speaking the same scan endpoint; see above.
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
- **Client** — Playwright in `client_v2/e2e/`, driving the relay with plain POSTs to
  `/api/v1/tag/scan` so pairing and auto-navigate are covered without NFC hardware. Manually confirm
  the Web NFC control is hidden on desktop and over plain HTTP, and works on Android Chrome over
  HTTPS.
- **Reference firmware** — the documented ESPHome YAML must be compiled and tapped against real
  hardware once before the docs page ships. Untested example code in documentation is worse than no
  example code.
- **Lint/i18n** — repo lint, typecheck, i18n checks. `npm run build` rewrites every
  `locales/*/common.json`; revert before staging.

---

## Communications

- Comment on #776, #723, #799 and #716 that `extra.<key>` filtering landed in v0.26.0. That alone
  unblocks several downstream projects today and none of them know.
- **PR #880** (goeland86, TigerTag + OpenPrintTag + Qidi, +6512/−901, 36 files): decline as-is. It
  targets the legacy React client, vendors `nfcpy` and `libusb` into the default Docker image, ships
  `.claude/settings.local.json` and session logs, and the author states the OpenPrintTag path is
  untested for lack of NFC-V hardware. Reply explaining the direction, credit the work, and invite
  both the codec back on top of this tag model and the host-reader loop back as an opt-in client of
  `POST /api/v1/tag/scan`. The disagreement is about packaging and sequencing, not about the goal —
  say that explicitly.
- bofh69 (nfc2klipper), beikeland, ryanch and the FilaMan successor maintainers are the natural
  design reviewers. They have all built this twice already.
