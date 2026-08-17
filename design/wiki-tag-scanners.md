<!--
  Source for https://github.com/Donkie/Spoolman/wiki/Tag-scanners

  Publishing this page also means copying design/diagrams/tag-scan-flow.svg into the
  wiki repository next to it: the image is referenced page-relative, which is how the
  GitHub wiki serves its own assets, and the link is dead without it. The diagram is
  generated from design/diagrams/tag-scan-flow.d2 -- edit that and re-render, never
  the SVG by hand.
-->

# Tag scanners

Spoolman can identify a spool from an NFC or RFID tag stuck to it. Tap the tag on a reader by your
printer and Spoolman knows which spool it is. Your browser can jump straight to it, and any other
software you run can ask "which spool is this?" and get an answer.

This page covers what the feature does, how to set it up, how to build a reader, and how to wire it
into other software.

> **Availability:** tag scanning is new in Spoolman `v0.27.0`.

---

## What it does

- **Link physical tags to spools.** A spool can carry several tags, and a tag identifies exactly one
  spool. Nothing is written to the tag, Spoolman only reads its UID.
- **Look a spool up by tag,** from the UI or from any program: `GET /api/v1/spool?tag=<uid>`.
- **Tap a tag anywhere, act on it anywhere else.** A reader at the printer can drive the browser on
  your desk, or a wall tablet, or nothing at all.
- **Works with tags Spoolman cannot read the contents of.** Identification keys on the tag's
  hardware UID, which every tag has. Blank NTAG stickers, Prusament tags, Bambu, Creality and Qidi
  tags all have one, even where their contents are encrypted or signed.

What it does *not* do yet is read a tag's *contents*. Tapping a new Prusament will not create the
vendor, filament and spool for you with the right material and colour. That needs a decoder for each
tag format and is planned for the future.

## How it fits together

**Spoolman never talks to reader hardware. The reader talks to Spoolman.**

This is key: Spoolman usually runs in Docker on a NAS or somewhere on your network, while the tag
gets tapped at the printer. Spoolman doesn't reach out to USB devices—instead, a reader reports
what it read by making **one HTTP POST**:

![A tag is tapped on a reader. The reader POSTs the UID to Spoolman, which answers with the matching spool id and broadcasts the scan to any paired browser.](tag-scan-flow.svg)

A "tag scanner" is anything that can make an HTTP request. No pairing handshake, no device
registration, no library to install, no inbound port on the reader. A brand new device works on
its first tap.

The dashed arrow is the reply to that POST, and it is optional: Spoolman hands the reader the
matching spool id, which is handy for lighting an LED, but a device is free to ignore it entirely.

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

`matched_spool_id` is `null` because nothing is linked to that tag yet. Link it (below), run the
same command again, and you get the spool back. Any browser you have paired will open it.

If you have the Spoolman source checked out, there's also a small interactive fake reader to avoid
retyping curl lines:

```sh
python scripts/fake_reader.py                 # interactive: type UIDs to "tap" them
python scripts/fake_reader.py 04:a2:b3:c4     # one tap, then exit
python scripts/fake_reader.py --new           # invent a blank tag's UID and tap it
```

It only uses Python's standard library and doesn't write or delete anything, so it's safe to point
at a real instance with `--url http://spoolman.local:7912`.

---

## Linking a tag to a spool

Open a spool in the library, find the **Tags** section in its inspector, and click **Add tag**. The
dialog has three ways to provide the UID. Pick whichever works for you:

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

Since identification is just the UID, a locked vendor tag works just as well as a blank sticker.

---

## Settings: pairing and auto-navigate

**Settings → Tag Scanning** holds the per-browser options. These are stored in the browser, not on
the server, so every device you open Spoolman on chooses for itself.

**Auto-navigate** — *"Automatically navigate in this web browser to a spool that gets read by a tag
reader."* Off by default. Turn it on and a tap opens that spool in this browser. It only navigates
on a match and stays quiet while you have a dialog open or are typing, so a tap in the next room
won't interrupt your work.

**Tag Reader** — which reader this browser listens to. By default it listens to all of them, which is
right if you only have one. To bind this browser to one specific reader:

- Click **Pair by tapping**, then walk over and tap any tag on the reader you want. The first scan
  that arrives is the one it latches onto. You pair with your hands; there is nothing to type.
- Or pick one from **Recent readers** and click **Use this one**.

**Use any reader** undoes the pairing.

The reader you're paired with is also the one the *Add tag* dialog listens to.

> **Recent readers is empty after a restart.** The list of readers lives in memory only. Nothing
> about your readers is stored in the database. A reader reappears the moment it scans something.
> This is why pairing by tapping works even after a restart.

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
the firmware is around thirty lines, with just one line specific to Spoolman.

### Hardware

| Part | Approx. cost | Notes |
|---|---|---|
| ESP32 dev board | 4 EUR | Any board ESPHome supports. WiFi is the only requirement. An ESP8266 also works. |
| **PN532** module (Elechouse V3 and clones) | 5 EUR | The default choice. I²C, SPI or UART, and supported by ESPHome out of the box. Run it at 3.3 V. |
| **RC522** module | 2 EUR | Cheaper and also supported by ESPHome. Fine if all you want is UIDs, which here is all you want. |
| **PN5180** module | 12 EUR | The only one of the three that reads ISO15693 (NFC-V), so the only one that reads Prusament/OpenPrintTag tags. **No official ESPHome component** — needs an external component or custom firmware. |
| USB power supply | | |
| An LED (optional) | | Feedback that the tap registered. |

The key choice is **ISO15693** support. PN532 and RC522 read ISO14443A, which handles NTAG,
MIFARE, Bambu, Creality, Qidi and TigerTag—most of what people tag spools with. They **cannot**
read the NFC-V tags on new Prusament spools, no matter what firmware you use. If you need Prusament
tags, get a PN5180 and be prepared to put in more work.

### ESPHome

Here's the complete device config. Substitute your own reader name and Spoolman address.

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

Reading the response tells you if a tag is known. That's the difference between a device people
trust and one people tap repeatedly. Spoolman always returns `matched_spool_id`: a number if the
tag is linked, or `null` if not. A simple substring check on the response body is enough:

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

If your reader is already in Home Assistant, you don't need a second device. An ESPHome reader can
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

> **Watch out.** `tag_id` is the hardware UID when the scan comes from an ESPHome reader using
> `homeassistant.tag_scanned`. It's **not** the hardware UID when the scan comes from the Home
> Assistant companion app. The companion app uses an identifier Home Assistant wrote to the tag
> instead. Both are hex, so Spoolman accepts both, but they're different values for the same physical
> tag. Link tags from the same source you'll scan them with, or the lookup won't match.

### Raspberry Pi, or any machine with a USB reader

If you already have a Pi at the printer, you don't need firmware. With
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

A reader is just one HTTP POST. A Node-RED flow, a shell script, a Tasker task on a phone, or
custom Arduino code all work. There's nothing else to implement.

### What makes a well-behaved reader

| | |
|---|---|
| **Send a stable `reader_id`** | This is what a browser pairs with. The hostname works well. |
| **Survive Spoolman being down** | Fire and forget. Don't block or retry in a tight loop if the server is down. |
| **Don't poll faster than about 1 Hz** | Readers re-read a tag sitting on them. Spoolman deduplicates, but slower polling keeps logs cleaner. |
| **Nothing else** | No discovery, no registration, no device state. |

---

## Integrating with other software

### Set the active spool in Klipper when a tag is tapped

This is a common use case: tap a spool's tag at the printer and have Moonraker set it as active
so usage gets tracked correctly.

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

The same two steps work from a Home Assistant automation, a Node-RED flow, or anything else: POST
the UID to Spoolman, read `matched_spool_id`, POST that to Moonraker's `/server/spoolman/spool_id`.
Since Spoolman does the lookup, the tag doesn't need to store a spool id. This is why it works
with vendor tags you can't write to.

### Existing projects

Several community projects already read tags and talk to Spoolman. Most of them predate this feature
and worked around it by writing a Spoolman id to the tag or storing the UID in an extra field. They
still work the same way. The tag endpoints just give them a shorter path if they want to use it.

| Project | What it is | How it relates |
|---|---|---|
| [nfc2klipper](https://github.com/bofh69/nfc2klipper) | PN532 on a Pi, sets the active spool and filament in Klipper, and can write tags | Stores the UID in a spool's `extra.nfc_id` and filters on it. `?tag=` is an exact, indexed lookup for the same job. |
| [FilaMan](https://github.com/ManuelW77/Filaman) | ESP32 + PN532 + load cell | Writes `sm_id` into the tag, then filters the full spool list client-side. Keying on the UID removes the need to write to the tag. |
| [OpenSpool](https://github.com/spuder/OpenSpool) | ESP32 + PN532, ESPHome, talks to Bambu printers over MQTT | One extra `http_request.post` alongside the MQTT publish is enough to tell Spoolman too. |
| [SpoolCompanion](https://github.com/V-aruu/SpoolCompanion) | Android app | Picks a spool and writes its identifiers to a tag, for use with nfc2klipper. |

If you maintain one of these, the endpoint to use is [`POST /api/v1/tag/scan`](#the-device-contract).
It does the lookup and drives the browser in a single request.

### Extra fields still work

Nothing here replaces spool extra fields. If you store a UID in one, filtering still works:

```http
GET /api/v1/spool?extra.nfc_id=04A2B3C4
```

A few differences if you're deciding between them. A linked tag is **unique and indexed**. Two
spools can't claim the same tag, and the lookup is exact rather than a case-insensitive substring
search. Extra-field filters only work if that field is defined in Settings. Filtering on a key
that doesn't exist silently returns every spool, which looks like a match but isn't.

---

## The device contract

See the [tag API documentation](https://donkie.github.io/Spoolman/#tag/tag) for the complete
endpoint reference including request/response formats, status codes, and all parameters.

---

## Things to know

**Scans are never stored.** A scan is broadcast and then gone. No scan history, no record of which
reader saw which tag when. Only the tag-to-spool link is stored.

**Repeated scans are de-duplicated.** Readers re-read a tag sitting on them, so the same UID from
the same reader within 3 seconds is broadcast once. Every POST still gets an answer, so the device
never sees a de-duplicated scan as a failed lookup.

**There is no authentication.** Spoolman has none, and the tag endpoints are the same. Anything on
your network can report a scan and navigate a paired browser. Worst case, it moves someone's page.
Scans don't write. Keep Spoolman off the open internet, as the [security page](https://github.com/Donkie/Spoolman/wiki/Security) advises.

Do not treat a hard-to-guess `reader_id` as any kind of secret. `GET /api/v1/tag/reader` lists every
reader that has scanned recently, by id and name, to anyone who can reach the API, which is what
makes the "choose a reader" picker work. Guessing is not required.

**Reader state is per server process.** The recently-seen list and de-duplication window live in
memory. If you run Spoolman with multiple workers, each has its own, and readers come and go. The
default config is a single process and works fine.

**Tag contents are not read.** Spoolman uses the UID only. Payloads can be sent in `payload_b64`
and passed to listeners unchanged, but Spoolman doesn't decode them or write to tags.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| **"Read a tag with this phone" is missing** | Not Chrome on Android, or Spoolman isn't being served over HTTPS. Both are required. |
| **The button is there but reading fails** | NFC is off, the site was denied permission, or another app is using the reader. |
| **Nothing appears in Recent readers** | The list is in memory and clears on restart. Tap a tag and it appears immediately. If not, the reader isn't reaching Spoolman. Check its logs for the POST. |
| **A tap does nothing in the browser** | Auto-navigate is off by default (Settings → Tag Scanning). It also only works on known tags and stays quiet while a dialog is open or you're typing. |
| **The wrong browser jumps to the spool** | Every browser listens to all readers until you pair it. Use **Pair by tapping** for selective ones. |
| **`400` "not a valid tag UID"** | The UID has non-hex characters. Some readers send decimal or an NDEF text record instead of the UID. Send the hardware UID. |
| **The reader gets `200` but the tag is never found** | The UID sent isn't the one that was linked. Usually means two sources report different identifiers for the same tag (Home Assistant companion app ID vs. hardware UID). Look it up with `GET /api/v1/spool?tag=<uid>` to see which one Spoolman knows. |
| **Prusament tags are not detected at all** | A PN532 or RC522 can't read ISO15693/NFC-V tags. You need a PN5180. |
| **Tags read on the bench but not in the printer** | Metal detunes the antenna. Move the reader away from the frame and motors. |
