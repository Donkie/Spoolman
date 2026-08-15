# Tag scanners

Spoolman can identify a spool from an NFC or RFID tag stuck to it. Tap the tag on a reader by your
printer and Spoolman knows which spool it is — which means your browser can jump straight to it, and
any other software you run can ask "which spool is this?" and get an answer.

This page covers what the feature does, how to set it up, how to build a reader, and how to wire it
into other software.

> **Availability:** tag scanning is new in Spoolman `v0.27.0`.

---

## What it does

- **Link physical tags to spools.** A spool can carry several tags, and a tag identifies exactly one
  spool. Nothing is written to the tag — Spoolman only reads its UID.
- **Look a spool up by tag,** from the UI or from any program: `GET /api/v1/spool?tag=<uid>`.
- **Tap a tag anywhere, act on it anywhere else.** A reader at the printer can drive the browser on
  your desk, or a wall tablet, or nothing at all.
- **Works with tags Spoolman cannot read the contents of.** Identification keys on the tag's
  hardware UID, which every tag has. Blank NTAG stickers, Prusament tags, Bambu, Creality and Qidi
  tags all have one, even where their contents are encrypted or signed.

What it does *not* do yet is read a tag's *contents* — tapping a new Prusament will not create the
vendor, filament and spool for you with the right material and colour. That needs a decoder for each
tag format and is planned separately.

## How it fits together

**Spoolman never talks to reader hardware. The reader talks to Spoolman.**

That is the important thing to understand, and it is why setup is simple. Spoolman usually runs in
Docker on a NAS or a server in a cupboard, while the tag gets tapped at the printer. Rather than
Spoolman reaching out to USB devices it cannot see, a reader reports what it read by making **one
HTTP POST**:

```
   [ tag ] --tap--> [ reader: ESP32, phone, Pi, Node-RED ]
                             |
                             |  POST /api/v1/tag/scan  {"uid": "...", "reader_id": "..."}
                             v
                        [ Spoolman ] --- resolves the UID to a spool
                             |
                             |  broadcasts the scan over a websocket
                             v
                  [ your browser, if it is listening ]
```

So a "tag scanner" is anything that can make an HTTP request. There is no pairing handshake, no
device registration, no library to install, and no inbound port on the reader. A device that has
never talked to Spoolman before works on its first tap.

---

## Try it without any hardware

You do not need a reader to see the whole thing work. Any tool that can POST will do:

```sh
curl -X POST http://localhost:7912/api/v1/tag/scan \
  -H 'Content-Type: application/json' \
  -d '{"uid":"04A2B3C4D5E6F7","reader_id":"desk","name":"Desk reader"}'
```

Spoolman answers with the match:

```json
{"uid":"04A2B3C4D5E6F7","reader_id":"desk","name":"Desk reader","matched_spool_id":null}
```

`matched_spool_id` is `null` because nothing is linked to that tag yet. Link it (below), run the same
command again, and you get the spool back — and any browser you have paired will open it.

If you have the Spoolman source checked out, it also ships a small interactive fake reader, which
beats retyping curl lines:

```sh
python scripts/fake_reader.py                 # interactive: type UIDs to "tap" them
python scripts/fake_reader.py 04:a2:b3:c4     # one tap, then exit
python scripts/fake_reader.py --new           # invent a blank tag's UID and tap it
```

It needs only the Python standard library, and it writes nothing and deletes nothing, so it is safe
to point at a real instance with `--url http://spoolman.local:7912`.

---

## Linking a tag to a spool

Open a spool in the library, find the **Tags** section in its inspector, and click **Add tag**. The
dialog gives you three ways to provide the UID — use whichever suits where you are:

1. **Tap it on a reader.** While the dialog is open it listens for scans, so tapping the tag on your
   reader fills the field in. The dialog says which reader it is waiting for.
2. **Read it with your phone,** if you are on an Android phone over HTTPS. See
   [Using your phone as a reader](#using-your-phone-as-a-reader).
3. **Type the UID.** Separators and capitalisation make no difference — `04:a2:b3:c4`, `04-A2-B3-C4`
   and `04a2b3c4` are all the same tag. Spoolman normalises everything to uppercase hex with no
   separators, so it does not matter which shape your reader reports.

If the tag already belongs to another spool, the dialog says so and offers **Move it here**. A tag
identifies one spool at a time; this is how you retag a reused spool.

To remove a link, use **Unlink** in the Tags section. Nothing is written to the tag itself, so you
can link it again — to this spool or a different one — whenever you like. Deleting a spool unlinks
its tags automatically.

### Which tags can I use?

Any tag with a UID, which in practice is all of them:

| Tag | Works | Notes |
|---|---|---|
| Blank NTAG213/215/216 stickers | Yes | The cheapest option. A roll of stickers costs very little. |
| MIFARE Classic / Ultralight | Yes | Common in cheap keyfobs and cards. |
| Bambu, Creality, Qidi spool tags | Yes, by UID | Their contents are encrypted or signed and Spoolman does not read them. The UID is enough to identify the spool. |
| Prusament / OpenPrintTag | Yes, by UID | These are ISO15693 (NFC-V) tags and need a reader that supports it — see the hardware table. |
| TigerTag | Yes, by UID | |

Because identification is by UID, a vendor tag you cannot write to works exactly as well as a blank
sticker you can.

---

## Settings: pairing and auto-navigate

**Settings → Tag Scanning** holds the per-browser options. These are stored in the browser, not on
the server, so every device you open Spoolman on chooses for itself.

**Auto-navigate** — *"Automatically navigate in this web browser to a spool that gets read by a tag
reader."* Off by default. Turn it on and a tap opens that spool in this browser. It only ever
navigates on a match, and it holds off while you have a dialog open or are typing in a field, so a
tap in the next room cannot throw away what you were doing.

**Tag Reader** — which reader this browser listens to. By default it listens to all of them, which is
right if you only have one. To bind this browser to one specific reader:

- Click **Pair by tapping**, then walk over and tap any tag on the reader you want. The first scan
  that arrives is the one it latches onto. You pair with your hands; there is nothing to type.
- Or pick one from **Recent readers** and click **Use this one**.

**Use any reader** undoes the pairing.

The reader you are paired with is also the reader the *Add tag* dialog listens to.

> **Recent readers is empty after a restart.** The list of readers is kept in memory only — nothing
> about your readers is stored in the database. A reader reappears in the list the moment it scans
> something. This is not an error; it is why pairing by tapping is the primary route.

Typical setups this gives you:

- **One reader, one browser.** Leave everything on "any reader", turn on auto-navigate. Tap a spool,
  it opens.
- **A tablet at each printer.** Pair each tablet with the reader beside it. Each one follows its own
  printer and ignores the others.
- **Reader at the printer, browser at the desk.** Click *Add tag* on the desktop, walk to the
  printer, tap, and the dialog is filled in when you get back.

---

## Using your phone as a reader

Spoolman can read tags directly with an Android phone using Web NFC, with no app and no extra
hardware. In the *Add tag* dialog, tap **Read a tag with this phone** and hold the tag to the back
of the phone.

This only appears when the browser can actually do it. The requirements are strict and come from the
browser, not from Spoolman:

- **Chrome on Android.** Web NFC does not exist on iOS, on desktop, or in Firefox.
- **A secure context — HTTPS, or `localhost`.** Reaching Spoolman at `http://192.168.1.50:7912`
  will not work, and there is no exemption for private addresses. If you already reach Spoolman
  through a reverse proxy with a certificate, you have this for free.
- **NFC switched on** in the phone's system settings.

If the button is not there, one of those is not satisfied. Everything else on the page still works —
you can always type a UID, or tap on a reader.

---

## Building a reader

The reference reader is an ESP32 with an NFC module, running ESPHome. It costs about ten euros and
the firmware is about thirty lines, only one of which is Spoolman-specific.

### Hardware

| Part | Approx. cost | Notes |
|---|---|---|
| ESP32 dev board | 4 EUR | Any board ESPHome supports. WiFi is the only requirement. An ESP8266 also works. |
| **PN532** module (Elechouse V3 and clones) | 5 EUR | The default choice. I²C, SPI or UART, and supported by ESPHome out of the box. Run it at 3.3 V. |
| **RC522** module | 2 EUR | Cheaper and also supported by ESPHome. Fine if all you want is UIDs, which here is all you want. |
| **PN5180** module | 12 EUR | The only one of the three that reads ISO15693 (NFC-V), so the only one that reads Prusament/OpenPrintTag tags. **No official ESPHome component** — needs an external component or custom firmware. |
| USB power supply | | |
| An LED (optional) | | Feedback that the tap registered. |

The important buying decision is **ISO15693**. PN532 and RC522 read ISO14443A, which covers NTAG,
MIFARE, Bambu, Creality, Qidi and TigerTag — the large majority of what people tag spools with. They
**cannot** read the NFC-V tags on new Prusament spools, no matter what firmware you run. If Prusa
tags matter to you, buy a PN5180 and expect to do more work.

### ESPHome

This is the whole device. Substitute your own reader name and Spoolman address.

```yaml
esphome:
  name: spool-reader-voron

esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

logger:
api:
ota:
  - platform: esphome

i2c:
  sda: GPIO21
  scl: GPIO22

http_request:
  timeout: 5s

pn532_i2c:
  update_interval: 1s
  on_tag:
    then:
      - http_request.post:
          url: http://spoolman.local:7912/api/v1/tag/scan
          request_headers:
            Content-Type: application/json
          json: |-
            root["uid"] = x;
            root["reader_id"] = "printer-voron";
            root["name"] = "Voron spool holder";
```

Notes:

- `x` is the tag UID as a dash-separated hex string, like `04-a2-b3-c4`. Spoolman normalises it, so
  you do not need to reformat it and it does not matter that ESPHome's capitalisation has changed
  between releases.
- `reader_id` is what a browser pairs with. Pick something stable and readable — the device name is
  a good default. It may contain letters, digits, dot, underscore, colon and dash, up to 64
  characters. If you leave it out entirely, Spoolman derives one from the device's IP address
  (`ip-192-168-1-50`), which works but changes if DHCP moves the device.
- `name` is optional and only cosmetic: it is what the UI shows instead of the raw `reader_id`.
- For an **RC522** instead, replace the `i2c:` and `pn532_i2c:` blocks with `spi:` and `rc522_spi:`.
  The `on_tag` trigger and `x` are identical.
- Nothing here needs Home Assistant. Delete the `api:` line if you do not use it.

#### Adding a status LED

Reading the reply tells you whether the tag is known, which is the difference between a device people
trust and one people tap twice. Spoolman always answers with `matched_spool_id` — a number if the tag
is linked to a spool, `null` if it is not — so a substring test on the body is enough:

```yaml
output:
  - platform: gpio
    pin: GPIO2
    id: led_out

light:
  - platform: binary
    name: "Scan result"
    id: led
    output: led_out

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
          on_response:
            then:
              - lambda: |-
                  bool known = body.find("\"matched_spool_id\":null") == std::string::npos;
                  ESP_LOGD("spoolman", "status=%d known=%d", response->status_code, known);
                  if (known) {
                    id(led).turn_on().perform();
                  } else {
                    id(led).turn_off().perform();
                  }
```

### Home Assistant

If your reader is already in Home Assistant, you do not need a second device. An ESPHome reader can
report tags to Home Assistant with `homeassistant.tag_scanned`, and an automation can forward them
to Spoolman.

On the ESPHome device:

```yaml
pn532_i2c:
  update_interval: 1s
  on_tag:
    then:
      - homeassistant.tag_scanned: !lambda 'return x;'
```

In `configuration.yaml`:

```yaml
rest_command:
  spoolman_tag_scan:
    url: http://spoolman.local:7912/api/v1/tag/scan
    method: POST
    content_type: 'application/json'
    payload: '{"uid": "{{ uid }}", "reader_id": "{{ reader_id }}"}'
```

And the automation:

```yaml
automation:
  - alias: "Forward tag scans to Spoolman"
    triggers:
      - trigger: event
        event_type: tag_scanned
    actions:
      - action: rest_command.spoolman_tag_scan
        data:
          uid: "{{ trigger.event.data.tag_id }}"
          reader_id: "ha-{{ trigger.event.data.device_id }}"
```

> **A caveat worth knowing.** `tag_id` is the hardware UID when the scan comes from an ESPHome reader
> using `homeassistant.tag_scanned`. It is **not** the hardware UID when the scan comes from the Home
> Assistant companion app — there, Home Assistant writes its own identifier into the tag and reports
> that instead. Both are hexadecimal, so Spoolman will happily accept either, but they are different
> values for the same physical tag. Link tags from the same source you intend to scan them with, or
> the lookup will not match.

### Raspberry Pi, or any machine with a USB reader

If you already have a Pi at the printer, there is no firmware to flash. With
[nfcpy](https://nfcpy.readthedocs.io/) and a supported reader:

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

### Anything else

A reader is one HTTP POST, so a Node-RED flow of three nodes, a shell script in a loop, a Tasker
task on a phone, or an ESP32 running hand-written Arduino code are all equally valid. There is
nothing to implement beyond the request.

### What makes a well-behaved reader

| | |
|---|---|
| **Send a stable `reader_id`** | It is what a browser pairs with. The hostname is a good default. |
| **Survive Spoolman being down** | Fire and forget. A reader that blocks, retries in a tight loop, or reboots because the server is restarting is worse than one that quietly drops the scan. |
| **Don't poll faster than about 1 Hz** | Readers re-detect a tag that is sitting still. Spoolman de-duplicates repeats, so nothing breaks, but slower polling keeps the logs readable. |
| **Nothing else** | No discovery, no registration, no device-side state. |

---

## Integrating with other software

### Set the active spool in Klipper when a tag is tapped

This is the most-asked-for use of the feature: tap a spool's tag at the printer and have Moonraker
set it as the active spool, so usage is tracked against the right one.

Spoolman resolves the tag; Moonraker gets told the id. On the machine with the reader:

```python
import nfc, requests

SPOOLMAN  = "http://spoolman.local:7912/api/v1/tag/scan"
MOONRAKER = "http://localhost:7125/server/spoolman/spool_id"
READER_ID = "printer-voron"

def on_connect(tag):
    uid = tag.identifier.hex()
    try:
        scan = requests.post(
            SPOOLMAN, json={"uid": uid, "reader_id": READER_ID}, timeout=5
        ).json()
    except requests.RequestException as e:
        print("spoolman unreachable:", e)
        return True

    spool_id = scan.get("matched_spool_id")
    if spool_id is None:
        print(f"{uid} is not linked to a spool yet")
        return True

    try:
        requests.post(MOONRAKER, json={"spool_id": spool_id}, timeout=5)
        print(f"active spool is now {spool_id}")
    except requests.RequestException as e:
        print("moonraker unreachable:", e)
    return True

with nfc.ContactlessFrontend("usb") as clf:
    while True:
        clf.connect(rdwr={"on-connect": on_connect})
```

The same two steps work from a Home Assistant automation, a Node-RED flow, or anything else: POST the
UID to Spoolman, read `matched_spool_id`, POST that to Moonraker's
`/server/spoolman/spool_id`. Because Spoolman does the lookup, the tag itself never has to contain a
spool id — which is what makes this work with vendor tags you cannot write to.

### Existing projects

Several community projects already read tags and talk to Spoolman. All of them predate this feature
and worked around the missing lookup by writing a Spoolman id *into* the tag, or by storing the UID
in an extra field and filtering on it. They keep working exactly as they did; the tag endpoints give
them a shorter path if their authors want it.

| Project | What it is | How it relates |
|---|---|---|
| [nfc2klipper](https://github.com/bofh69/nfc2klipper) | PN532 on a Pi, sets the active spool and filament in Klipper, and can write tags | Stores the UID in a spool's `extra.nfc_id` and filters on it. `?tag=` is an exact, indexed lookup for the same job. |
| [FilaMan](https://github.com/ManuelW77/Filaman) | ESP32 + PN532 + load cell | Writes `sm_id` into the tag, then filters the full spool list client-side. Keying on the UID removes the need to write to the tag. |
| [OpenSpool](https://github.com/spuder/OpenSpool) | ESP32 + PN532, ESPHome, talks to Bambu printers over MQTT | One extra `http_request.post` alongside the MQTT publish is enough to tell Spoolman too. |
| [SpoolCompanion](https://github.com/V-aruu/SpoolCompanion) | Android app | Picks a spool and writes its identifiers to a tag, for use with nfc2klipper. |

If you maintain one of these, the contract you want is
[`POST /api/v1/tag/scan`](#the-device-contract) — it does the lookup and drives the browser in one
request.

### Extra fields still work

Nothing here replaces spool extra fields. If you keep a UID in one today, filtering on it keeps
working:

```http
GET /api/v1/spool?extra.nfc_id=04A2B3C4
```

Two differences are worth knowing if you are choosing between them. A linked tag is **unique and
indexed** — two spools cannot claim the same tag, and the lookup is an exact match on an index
rather than a case-insensitive substring search. And an extra-field filter is only applied if that
extra field has actually been defined in Settings; filtering on a key that does not exist is
silently ignored and returns *every* spool, which is an easy way to think a lookup succeeded when it
did not.

---

## The device contract

Everything a reader needs, in full.

### Report a scan

```http
POST /api/v1/tag/scan
Content-Type: application/json

{"uid": "04-A2-B3-C4-D5-E6-F7", "reader_id": "printer-voron", "name": "Voron spool holder"}
```

Only `uid` is required. `format` (`ntag`, `bambu`, `prusa`, …) and `payload_b64` are accepted and
carried through untouched; Spoolman does not decode tag contents.

A match returns the whole spool, so nothing needs a follow-up request:

```json
{"uid":"04A2B3C4D5E6F7","reader_id":"printer-voron","matched_spool_id":1,"spool":{"id":1, "...": "..."}}
```

No match:

```json
{"uid":"DEADBEEF","reader_id":"printer-voron","matched_spool_id":null}
```

`matched_spool_id` is always present in this response — `null` means "no spool has this tag", which is
an answer, not a failure. A device is free to ignore the body entirely.

### Look up a spool by tag

```http
GET /api/v1/spool?tag=04-a2-b3-c4-d5-e6-f7
```

Returns the standard spool list — zero or one result, never more. Composes with the other filters,
including `allow_archived`, so an archived spool's tag is not found unless you ask for archived
spools. A UID that is not hexadecimal is a `400`, not an empty list.

### Link and unlink

```http
POST   /api/v1/spool/{id}/tag     {"uid": "...", "format": "ntag"}   → 201
DELETE /api/v1/spool/{id}/tag/{uid}                                  → 204
```

Linking a UID that another spool already holds returns `409` with that spool's id in the body, so a
client can offer to move it:

```json
{"message":"Tag 04A2B3C4D5E6F7 is already linked to spool 1.","spool_id":1}
```

Re-linking a tag to the spool that already has it succeeds and changes nothing.

Both emit the normal spool `updated` event, so open browsers refresh on their own.

### Listen for scans

```
WS /api/v1/tag/scan               every reader
WS /api/v1/tag/scan/{reader_id}   one reader
```

Events look like this — the same payload as the POST response, wrapped:

```json
{
  "type": "scanned",
  "resource": "tag_scan",
  "date": "2026-08-15T09:02:43Z",
  "payload": {"uid": "04A2B3C4D5E6F7", "reader_id": "printer-voron", "matched_spool_id": 1, "spool": {"...": "..."}}
}
```

Note one difference from the POST response: in the websocket event, `matched_spool_id` is *omitted*
when the tag is unknown rather than being sent as `null`. Test for its presence, not for `null`.

Send any text frame as a keepalive and you get `{"status":"healthy"}` back, same as Spoolman's other
websockets. Scan events travel on their own socket and never appear on the entity streams
(`/api/v1/`, `/api/v1/spool`, …), so nothing that consumes those is affected.

### List recently seen readers

```http
GET /api/v1/tag/reader
→ [{"reader_id": "printer-voron", "name": "Voron spool holder", "last_seen": "2026-08-15T09:02:22Z"}]
```

In memory only, most recent first, empty after a restart.

---

## Things to know

**Scans are never stored.** A scan is broadcast to whoever is listening and then it is gone. There is
no scan history, and no record of which reader saw which tag when. Only the tag-to-spool link is
stored.

**Repeated scans are de-duplicated.** Readers re-read a tag that is left sitting on them, so the same
UID from the same reader within 3 seconds is broadcast once. The HTTP response is unaffected — every
POST gets its answer, so a de-duplicated scan never looks to the device like a failed lookup.

**There is no authentication.** Spoolman has none anywhere, and the tag endpoints are the same:
anything on your network can report a scan and make a paired browser navigate. The worst that does is
move someone's page — a scan writes nothing. Keep Spoolman off the open internet, as
[the security page](https://github.com/Donkie/Spoolman/wiki/Security) already advises. An
unguessable `reader_id` makes it slightly harder to target a specific browser; it is not a password
and should not be treated as one.

**Reader state is per server process.** The recently-seen list and the de-duplication window live in
memory in one process. If you have deliberately run Spoolman with multiple workers, each has its own,
and you will see readers come and go. The stock configuration runs a single process and is fine.

**Tag contents are not read.** Spoolman uses the UID and nothing else. A tag's payload can be sent
along in `payload_b64` and is passed through to listeners untouched, but Spoolman does not decode it,
and it does not write to tags at all.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| **"Read a tag with this phone" is missing** | Not Chrome on Android, or Spoolman is not being served over HTTPS. Both are required and neither can be worked around. |
| **The button is there but reading fails** | NFC is off in system settings, the site was denied NFC permission, or another app is holding the reader. |
| **Nothing appears in Recent readers** | The list is in memory and empties on restart. Tap a tag; the reader appears immediately. If it does not, the reader is not reaching Spoolman — check its logs for the POST. |
| **A tap does nothing in the browser** | Auto-navigate is off by default (Settings → Tag Scanning). It also only fires on a *known* tag, and stays quiet while a dialog is open or you are typing. |
| **The wrong browser jumps to the spool** | Every browser listens to all readers until you pair it. Use **Pair by tapping** on the ones that should be selective. |
| **`400` "not a valid tag UID"** | The UID has non-hexadecimal characters in it. Some readers report a decimal number or an NDEF text record rather than the UID — send the hardware UID. |
| **The reader gets `200` but the tag is never found** | The UID being sent is not the one that was linked. This is the usual sign of two sources reporting different identifiers for one tag, such as a Home Assistant companion-app tag id versus a hardware UID. Look the tag up with `GET /api/v1/spool?tag=<uid>` to see which one Spoolman knows. |
| **Prusament tags are not detected at all** | A PN532 or RC522 cannot read ISO15693/NFC-V tags. You need a PN5180. |
| **Tags read on the bench but not in the printer** | Metal detunes the antenna. Move the reader away from the frame and any motors. |
