# NFC Phase 1 — frontend handoff

The backend half of [`nfc-phase-1-tag-identity.md`](./nfc-phase-1-tag-identity.md) is implemented,
tested and on `worktree-nfc-design-docs`. This is what the next session needs in order to build the
client_v2 half without re-deriving any of it.

Read the phase 1 design doc for the *why*. This document is the *state*: what the server now
actually does, where the design doc has drifted from the tree, and what is still open.

---

## Where things stand

| | |
|---|---|
| Branch | `worktree-nfc-design-docs`, pushed |
| Commits | `f261dee` websocket broadcast fix, `de533bc` NFC phase 1 backend |
| Verified | 506 integration tests on sqlite / postgres / mariadb / cockroachdb; 264 unit tests; ruff clean; migration proven byte-lossless on a populated database, upgrade and downgrade |
| Client | Built. 274 client unit tests, `npm run check` clean, lint clean, and 48/48 Playwright against a production build served same-origin on a fresh database |
| Not started | The docs page, the reference firmware, and the #783 action links |

The migration is `migrations/versions/2026_08_13_1000-fe4970567bb3_spool_tags.py`. It runs on server
startup like every other one; there is nothing to do by hand.

---

## The API you are building against

All of it is live and covered by integration tests. Shapes below are dumped from the running
OpenAPI schema, not from memory.

### Reading tags

`tags` is now on every spool response, **always present**, empty when the spool has none. It is a
new key on an existing object, so nothing else changed shape.

```jsonc
// GET /api/v1/spool/{id}
{
  "id": 42,
  // ...everything that was already here...
  "tags": [
    { "uid": "04A2B3C4D5E6F7", "format": "ntag", "added": "2026-08-13T10:00:00Z" }
  ]
}
```

`SpoolTag`: `uid` and `added` always present, `format` optional and omitted when null (the API uses
`exclude_none`, so absent means null everywhere — don't test for `=== null`).

There is deliberately no tag row id on the wire. `uid` is globally unique and is the key you
link, unlink and look up by.

### Lookup

```
GET /api/v1/spool?tag=<uid>
```

Exact match on the normalized UID, returns the standard spool list plus `x-total-count`. Zero or one
result, never more. Composes with every other filter, including `allow_archived` — an archived
spool's tag will *not* be found unless you pass it, same as every other filter.

**A non-hexadecimal UID is a 400, not an empty list.** If you build this query from user input,
handle the 400.

### Link / unlink

```
POST   /api/v1/spool/{id}/tag     { uid, format? }   → 201 SpoolTag
DELETE /api/v1/spool/{id}/tag/{uid}                  → 204 (no body)
```

- `uid` accepts any spelling; the server normalizes and the response echoes the canonical form.
  **Render the returned `uid`, not the one you sent.**
- Re-posting the same uid to the same spool is idempotent → 201, no duplicate. Sending a `format`
  on a re-post refines the stored one.
- **409** when another spool holds that tag, body `{ "message": string, "spool_id": number }`. That
  id is there so you can offer "move it to this spool instead" without a lookup. This is the one
  error the UI genuinely has to handle well.
- 404 for an unknown spool, an unknown tag, or a tag that belongs to a different spool.
- 400 (bad uid) and 422 (empty uid, fails `min_length`) are both possible — treat them the same.

Both emit the **existing `spool` `updated` event**. `inventory.ingest` will update the cached spool
and open inspectors re-render with the new tag list, so there is no client wiring to add for this.
Do not hand-patch local state after a link; let the event do it, the way everything else does.

### The scan relay

```
POST /api/v1/tag/scan   { uid, reader_id?, name?, format?, payload_b64? }
GET  /api/v1/tag/reader
WS   /api/v1/tag/scan               — every reader
WS   /api/v1/tag/scan/{reader_id}   — one reader
```

`POST /tag/scan` returns the `TagScan` object and broadcasts it. `matched_spool_id` is **always
present** in the HTTP response, null when the tag is unknown — that is the published device
contract, so don't "clean it up".

```jsonc
// the broadcast event, and the POST response body minus the envelope
{
  "type": "scanned",
  "resource": "tag_scan",
  "date": "2026-08-13T10:00:00Z",
  "payload": {
    "uid": "04A2B3C4D5E6F7",
    "reader_id": "printer-voron",
    "name": "Voron spool holder",   // optional
    "format": "ntag",               // optional
    "payload_b64": "...",           // optional, phase 2 decodes it
    "matched_spool_id": 42,         // omitted from the WS event when null
    "spool": { /* full standard spool object */ }
  }
}
```

The embedded `spool` is the whole reason auto-navigate needs no follow-up request.

`GET /tag/reader` → `[{ reader_id, name?, last_seen }]`, most recently seen first. In-memory only:
**empty after a server restart** until something scans again. Your "choose a reader" UI must not
treat an empty list as an error — tap-to-pair is the primary path and the dropdown is the fallback.

---

## Things that will bite you

**The scan socket is a different socket.** It is a second `WebsocketManager` on the server with its
own subscription tree, and an integration test pins that scans never reach `/api/v1/` or
`/api/v1/spool`. Do not add `'tag_scan'` to `Resource` in `live.ts:10` — that module is one socket
per entity resource feeding `inventory.ingest`, and a scan is not an entity and must never enter the
inventory cache. Copy its reconnect shape (exponential backoff with jitter, `online` and
`visibilitychange` listeners, the 401 path through `auth.ts`) into a separate `scanRelay.ts`.

**Pool semantics come from the path.** `/tag/scan` receives every reader; `/tag/scan/{reader_id}`
receives one. That is the whole of tap-to-pair: subscribe to the root, wait for the first event,
read its `reader_id`, drop the root subscription and resubscribe to that reader. No server state is
involved, and nothing needs to be told you paired.

**Keepalive is the same as the entity sockets.** Send any text frame, get `{"status":"healthy"}`
back. Reuse whatever `live.ts` does.

**Debounce is already handled server-side** — identical `(uid, reader_id)` within 3 seconds is
broadcast once. Don't add client-side dedupe on top; you will only make the second genuine tap feel
broken.

**`reader_id` is constrained** to `^[A-Za-z0-9._:-]{1,64}$` because it travels in a websocket path.
An agent that sends none gets `ip-192-168-1-50` derived from its address. Those derived ids are ugly
but they are what makes tap-to-pair work with an unmodified ESPHome device, so show `name` when
there is one and fall back to `reader_id`.

**The websocket origin check applies to the scan socket too.** It is app-level middleware, so a
cross-origin vite dev server gets a 403 handshake unless the backend runs with
`SPOOLMAN_DEBUG_MODE=TRUE`. This reads as "the backend is down" — see the dev-startup notes.

**Web NFC is progressive enhancement.** `'NDEFReader' in window` is false on desktop, iOS, Firefox
and every plain-HTTP install; the control should be **absent, not disabled**. `NDEFReader` exposes
`serialNumber` on read, so phase 1 needs no NDEF parsing at all. There is currently no `NDEFReader`
reference anywhere in `client_v2/` — this is all new. Model the permission and error handling on
`QrScannerModal.svelte`, which already turns opaque browser failures into specific reasons.

**Auto-navigate reuses the existing pattern**, `QrScannerModal.svelte:29`:
`goto(resolve(\`/?sel=spool:${id}\`))`. Off by default, only on a match, suppressed when a modal is
open or an input is focused, and exactly **one** relay subscriber started in the root layout next to
`startLiveSync()` — two mounted components reacting to one scan is how you get a double navigation.

---

## Corrections to the design doc's frontend plan

The file table in the phase 1 doc was written before the code was read. Two paths are wrong:

| Design doc says | Actually |
|---|---|
| `src/lib/components/library/TagsSection.svelte`, modeled on `library/ExtraFieldsSection.svelte` | `ExtraFieldsSection.svelte` lives at `src/lib/components/`, not `components/library/`. Put `TagsSection.svelte` next to it. |
| `QrScannerModal.svelte` (no path given) | `src/lib/components/QrScannerModal.svelte` |

Verified and still correct: `types.ts:58` is the `Spool` interface (its `extra` is at :94, add `tags`
alongside), `map.ts:77` is `mapSpool`, `live.ts:10` is the `Resource` union, and
`stores/theme.svelte.ts` is the localStorage-backed store pattern to follow for `scanner.svelte.ts`.

---

## Dev setup in this worktree

- `client_v2/node_modules` is not shared with the main checkout. Symlink it rather than `npm ci`:
  `ln -s /home/daniel/Documents/GitHub/Spoolman/client_v2/node_modules client_v2/node_modules`.
- The backend refuses to import until `client_v2/build` exists. Either `npm run build` once, or
  symlink the main checkout's build if you are going to use a vite dev server anyway.
- `npm run build` rewrites every `locales/*/common.json`. **Only `locales/en/common.json` is yours**
  — revert the rest before staging. Everything else is Weblate's.
- Backend, with the alembic-on-PATH gotcha handled:
  `PATH="$PWD/.venv/bin:$PATH" SPOOLMAN_DEBUG_MODE=TRUE .venv/bin/uvicorn spoolman.main:app --port 8001`

**You can build and demo the entire relay experience with no NFC hardware.** That is what the scan
endpoint being a plain POST buys:

```sh
curl -X POST http://localhost:8001/api/v1/tag/scan \
  -H 'Content-Type: application/json' \
  -d '{"uid":"04A2B3C4D5E6F7","reader_id":"desk","name":"Desk reader"}'
```

Pairing, auto-navigate and fill-the-dialog are all reachable from that one line, and it is what the
Playwright tests should drive.

---

## Was open, now decided

The frontend is built. These are the answers it went with, and why.

- **The "link a tag" entry point is a section action, not a header button.** `TagsSection` puts
  *Add tag* in its `SectionLabel`'s right slot, the same quiet-link shape the Filament section
  already uses for *Change* / *Open filament*. The inspector header keeps its one accent CTA.
- **An unknown scanned UID is reported, not routed.** It raises a toast naming the UID and saying to
  open the spool and use *Add tag* — no picker, no navigation. The dialog subscribes to the relay
  while it is open, so the follow-up tap fills the field: the instruction in the toast is the whole
  flow. A picker would be a second way to choose a spool when the app already has one.
- **The reader picker ships**, under the pairing row in Settings, listing what `GET /tag/reader`
  knows and offering *Use this one*. It cost about thirty lines and it is the only answer for a
  reader in another room. Its empty state explains the registry is per-process rather than reporting
  an error.
- **Playwright covers everything except Web NFC**, in `tests_frontend_v2/tests/tags.spec.ts` — six
  specs: link by typed UID, tap-to-fill, the move-a-taken-tag path, auto-navigate, the unknown-tag
  toast, and pairing. Web NFC gets no automated cover and cannot: there is no way to present a
  physical tag to headless Chromium. What *is* asserted is that the control is absent there, which
  is the failure mode that would otherwise reach a desktop user.

## Two things the next session should not rediscover

**Playwright for client_v2 lives in `tests_frontend_v2/`, not `client_v2/e2e/`.** The design doc says
the latter; that directory holds only the a11y audit (`npm run audit:a11y`). The real suite is a
separate package with its own config, run against a deployed instance on `SPOOLMAN_BASE_URL`.

**Do not increment a `$state` counter from inside an `$effect`.** `scanner.suppress()` originally did,
and `this.#suppressions++` reads the rune as well as writing it — so the dialog's open-effect
depended on its own write and re-ran until Svelte killed it with `effect_update_depth_exceeded`,
opening and closing a websocket on every pass. The counter is deliberately a plain field now; nothing
renders from it. The symptom to recognise is a flood of `WebSocket ... Insufficient resources`.

---

## One backend note worth carrying forward

`f261dee` fixes a pre-existing bug in `spoolman/ws.py` that is not about NFC: one subscriber that
could not be written to aborted the whole broadcast, so every other subscriber in that pool silently
got nothing. It is committed separately from the feature in case it wants to ship on its own. If
live updates behave oddly on this branch, that fix is the recent change to `ws.py`, not the relay.
