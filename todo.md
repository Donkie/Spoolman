# Backend security TODO

Findings from the backend security audit of v0.24.0 (`spoolman/`). Items marked
**[confirmed]** were reproduced against a live instance; the rest are code-reading findings.

Spoolman has no authentication by design, so the boundary that actually protects a user's
data is the network. The high-priority items below are the ones that let a *remote website*
cross that boundary through the victim's browser.

Recommended order: task 0 first (it is the shared building block for tasks 1-3), then the
rest roughly top to bottom.

---

## 0. Add a shared origin-trust helper, driven by the existing `SPOOLMAN_CORS_ORIGIN`

Tasks 1-3 all need "is this browser origin someone we trust". Build it once.

**Do not add a new origin env var.** `SPOOLMAN_CORS_ORIGIN` (`spoolman/env.py:227`) is already
an operator-declared origin allowlist, and it answers exactly this question: an operator who
allowlists `https://foo` for CORS has already declared foo trusted to make credentialed
cross-origin requests. Having the CSRF guard or the WS check refuse that same origin would
break the deployment CORS was configured for (a separate frontend dev server, a Fluidd/Mainsail
instance on another origin). Two vars answering one question would also drift apart — CORS
permits an origin the CSRF guard blocks, or the reverse.

- [x] Add `spoolman/security.py` with
      `is_trusted_origin(origin: str | None, host: str) -> bool` — true when `origin` is absent
      (same-origin navigation or a non-browser client such as Moonraker/OctoPrint), when it
      matches the request's own `Host`, or when it is in the `SPOOLMAN_CORS_ORIGIN` list.
      Unset `SPOOLMAN_CORS_ORIGIN` therefore means "same-origin only", which is the right
      default for every existing deployment.
- [x] Normalize before comparing. `get_cors_origin()` is a bare `cors.split(",")` — no
      trimming, no case folding, no trailing-slash handling. `"https://a, https://b"` yields
      `" https://b"`, which will never match an `Origin` header. Fix it in
      `get_cors_origin()` so CORS and the new guard both benefit, and keep the raw value in the
      startup log so a typo is visible.
- [x] ~~Decide `*` explicitly: it conveys no trust information, so the origin guard should treat
      it as "same-origin only" and log a warning, **not** as "trust everyone".~~
      **Reversed (Donkie's call).** `*` is honoured as "trust every origin", and debug mode
      implies the same. An operator who writes `*` is opting out of origin checks; there is no
      other way for them to say that, so reinterpreting it as something narrower would just
      leave them with no escape hatch and force a second env var to reintroduce one. Logged
      loudly at startup instead. See task 5.
- [x] Unit-test: no Origin; Origin matching Host; allowlisted; foreign; near-miss
      (`https://evil-spoolman.local` vs `https://spoolman.local`); whitespace-padded list entry;
      `*`.

Done in `spoolman/security.py` + `tests/` (new backend unit-test suite, `poe test`, wired into
the lefthook `ci` backend group). Notes for the tasks that build on it:

- **Use `is_trusted_request(connection)` from tasks 1-3, not `is_trusted_origin` directly.** It
  takes a Starlette `HTTPConnection`, so the same call works for a `Request` (CSRF guard) and a
  `WebSocket` (task 3), and it reads all three headers for you. `is_trusted_origin` stays public
  for unit tests and anything holding raw header values.
- `is_trusted_origin` also rejects `Origin: null` (sandboxed iframe, `file://`, `data:` URL) —
  it identifies nobody — and rejects an origin with no scheme.
- Default ports are folded, so `https://host:443` and `https://host` both match `Host: host`.
  A *non*-default port mismatch is untrusted: a different port is a different origin.
- `trusts_all_origins()` is the opt-out check (`*` or debug mode). Its warning fires once per
  process (`_warn_all_origins_trusted` is `@cache`d); tests clear it.

**Reverse proxies — handled, no configuration needed.** The guard compares `Origin` against
`Host`, and a proxy that rewrites `Host` (nginx without `proxy_set_header Host $host`, Apache
without `ProxyPreserveHost On`) makes the two disagree, which would have 403'd the genuine web
UI. Those operators typically set no origin config at all, so the `*` opt-out would not have
rescued them — they would have hit a broken instance first. Fixed by also accepting
`X-Forwarded-Host`, which those same proxies set to the host the browser asked for. Only the
first entry of a proxy chain is used.

This does not weaken the guard against the attacks it exists to stop: a malicious page cannot
set that header on any of them — an HTML form cannot set request headers at all, the browser
WebSocket API cannot either, and a `fetch` that adds one stops being a simple request and needs
a CORS preflight an untrusted origin will not get. A non-browser client can forge it, but it can
equally forge `Origin` and `Host`, and the guard never defended against those (an absent
`Origin` is trusted by design so Moonraker and OctoPrint keep working).

Verified end-to-end through real ASGI requests and websocket handshakes, not just unit tests:
Host-preserving proxy, Host-rewriting proxy, direct LAN, and a foreign origin under each — the
foreign origin is refused in every configuration, including on the websocket handshake.

The preflight argument above assumes CORS is not wide open, so **task 5 should land before
enforcement is switched on** in tasks 1-3.

Task 4 (`TrustedHostMiddleware`) is a **different axis** — it needs bare hostnames, and it must
keep working for the common deployment that never set `SPOOLMAN_CORS_ORIGIN` at all. Give it
its own default plus, if a var proves necessary, `SPOOLMAN_ALLOWED_HOSTS` (hosts, not origins).
That is not a duplicate of the above.

---

## 1. HIGH — CSRF write on `POST /api/v1/setting/{key}` **[confirmed]**

`spoolman/api/v1/setting.py:160` declares `body: Annotated[str, Body()]`. FastAPI only
JSON-parses `application/*json`; anything else reaches Pydantic as raw bytes, which lax-mode
`str` coerces. So a `text/plain` body is accepted — exactly what `<form enctype="text/plain">`
sends. No preflight, no CORS, no auth. The `name=value\r\n` shape a form produces is
craftable into valid JSON (`name='"US'`, `value='D"'` → body `"US=D"`).

Reproduced: `Content-Type: text/plain;charset=UTF-8` + `Origin: https://evil.example` → 200,
`currency` became `"SE=K"`. Entity endpoints are not affected (`POST /spool` with `text/plain`
→ 422), because a `BaseModel` field will not coerce from bytes. This endpoint is the outlier.

Impact: any site the user visits can silently rewrite `base_url` (printed QR labels then
resolve to an attacker domain), `label_designs`, `print_presets`, `locations`,
`locations_spoolorders`, and `extra_fields_*` — the last one bypasses `validate_extra_field`
and puts `GET /api/v1/field/{entity}` into a **persistent 500** (`ValidationError: 4
validation errors for ExtraField`).

- [x] Reject non-JSON content types on this endpoint. ~~Preferred: `Body(media_type=...)`.~~
      **That does not work** — `media_type` is OpenAPI metadata only and is not enforced at
      runtime; verified with a `text/plain` post to a pinned endpoint, which still returned 200.
      Done instead with a `require_json_content_type` dependency. Wire-compatible: both clients
      already send `application/json`, and a `charset` parameter is accepted.
- [x] Add a `Depends` guard (or middleware) rejecting `POST`/`PUT`/`PATCH`/`DELETE` whose
      `Origin` fails `is_trusted_origin`, returning 403. Applies app-wide, not just here.
      Done as `security.TrustedOriginMiddleware`, wired in `main.py`.
- [x] Validate the array shape when `extra_fields_*` is written through the settings endpoint —
      `validate_extra_field_setting` in the registry, 400 on failure.
- [x] Invalidate `extra_field_cache` when `extra_fields_*` is written via `/setting/{key}` —
      `invalidate_extra_field_cache`.
- [x] Integration test: `tests_integration/tests/setting/test_set.py` (content types, malformed
      extra fields, cache refresh) and `tests_integration/tests/test_security.py` (origins).

Both attack shapes are now closed independently, which matters because they fail differently: a
non-browser attacker who can forge `Origin` still hits the 415, and a browser attacker who could
somehow send JSON still hits the 403.

Verified against a real uvicorn server, replaying the exploit from the audit:

| Request | Before | After |
| --- | --- | --- |
| `text/plain` + `Origin: evil` (the exploit) | 200 | 403 |
| `text/plain`, no `Origin` (non-browser) | 200 | 415 |
| `application/x-www-form-urlencoded`, empty body (resets the setting) | 200 | 403 |
| `multipart/form-data` | 200 | 415 |
| `application/json`, same origin | 200 | 200 |
| `application/json;charset=utf-8`, same origin | 200 | 200 |

An HTML form can only send those three encodings, so requiring JSON removes the whole class of
form-driven writes regardless of origin.

## 2. HIGH — CSRF-triggerable backup rotation destroys restore points **[confirmed]**

`POST /api/v1/backup` takes no parameters, so a bodyless cross-origin form post reaches it.
`backup_and_rotate` (`spoolman/database/database.py:112`) deletes `.5`, shifts the rest down
and writes a fresh snapshot. Six cross-origin posts left all six backup files created inside
the attack window — the real history was gone. Chained after task 1, an attacker corrupts
state *and* burns the rollback path.

- [x] Cover `/backup` with the task-1 origin guard — covered app-wide by
      `TrustedOriginMiddleware`; a cross-origin `POST /backup` now 403s.
- [x] Skip rotation when the DB is unchanged. **Not** by comparing the live DB file, as
      originally written: under WAL the live file does not yet contain recent commits, so
      comparing it would skip backups that were genuinely needed. Instead the new snapshot is
      written to `spoolman.db.pending` first and compared against the newest backup — sqlite's
      backup API reads through the connection, so it sees WAL content. If they match, the
      pending file is discarded and the history is left untouched.
- [x] Rate-limit `/backup`: `MIN_SECONDS_BETWEEN_ROTATIONS` (5 min), returning the existing
      path. Monotonic clock, process-local state, and never applied when no backup exists yet.
- [x] Integration test in `tests_integration/tests/test_backup.py`, plus
      `tests/test_backup_rotation.py` for the rotation semantics (9 tests, no Docker needed).

`BackupResponse` gained a `created` field. Additive, so v1-compatible, but it is load-bearing:
silently returning a stale path when a user asked for a backup would tell them they have a fresh
restore point when they do not, which is precisely the wrong failure mode for this project.

Verified end-to-end against a real server — six rapid calls left exactly one backup and never
rotated, where the audit saw six rotations destroy the entire history:

| Call | Before | After |
| --- | --- | --- |
| 1 | rotates | `created: true` |
| 2-6 | rotates each time | `created: false`, history untouched |

## 3. MEDIUM-HIGH — Cross-site WebSocket hijacking **[confirmed]**

No WS endpoint validates `Origin` (`spoolman/api/v1/router.py:90`, plus `spool.py`,
`filament.py`, `vendor.py`, `setting.py`). WebSockets are exempt from CORS, so this is the one
channel that bypasses the same-origin policy protecting REST reads. A client sending
`Origin: https://evil.example` connected to `/api/v1/spool` and received a full spool payload
— location, price, filament and vendor names — as soon as the inventory changed. A malicious
tab left open passively exfiltrates the inventory.

- [x] ~~Add a shared WS dependency/helper~~ — done in the same `TrustedOriginMiddleware` as
      task 1, which closes with 4403 before the handshake is accepted. A real uvicorn turns that
      into an HTTP 403 on the handshake, which is what the integration test asserts.
- [x] Apply it to all nine WS endpoints. A middleware rather than a per-endpoint dependency
      precisely because of the "confirm none are missed" worry: it sits above routing, so all
      nine are covered by construction, and a websocket endpoint added later cannot forget to
      opt in. (Count confirmed: 2 each in `spool.py`, `filament.py`, `vendor.py`, `setting.py`,
      plus the root one in `router.py`.)
- [x] Integration test: `tests_integration/tests/test_security.py` — foreign `Origin` refused,
      no `Origin` still connects, same origin still connects.

Note that *every* websocket handshake is guarded, not just state-changing ones: websockets are
exempt from CORS entirely, so an unguarded one leaks reads to any origin. That is the opposite
of the HTTP rule, where reads are left alone because the same-origin policy already covers them.

## 4. MEDIUM — No `Host` validation → DNS rebinding

`Host: attacker.example.com` returns 200 **[confirmed]**. For an unauthenticated LAN service,
rebinding gives a malicious page genuine same-origin access — full read *and* write, including
`DELETE` — which bypasses tasks 1-3 entirely.

- [ ] Add `TrustedHostMiddleware` in `spoolman/main.py`.
- [ ] Default must not break existing deployments — most never set any origin config: allow
      localhost, `*.local`, private-range literals, plus the hostnames parsed out of
      `SPOOLMAN_CORS_ORIGIN` where it is set. Log once at startup listing what is allowed.
- [ ] Only add `SPOOLMAN_ALLOWED_HOSTS` if that default proves too narrow — hostnames are a
      different axis from origins, so this would not duplicate `SPOOLMAN_CORS_ORIGIN`.
- [ ] README: note that operators behind a reverse proxy on a public hostname must set the var.

## 5. MEDIUM — Debug mode / `CORS_ORIGIN=*` grants any site full API access **[confirmed]**

`spoolman/main.py:130` sets `origins=["*"]` together with `allow_credentials=True`; Starlette
resolves that by echoing the caller's origin. Against a debug instance:
`access-control-allow-origin: https://evil.example`, `access-control-allow-credentials: true`,
and the `DELETE /api/v1/spool/1` preflight returned
`access-control-allow-methods: DELETE, GET, …`. Any website gets unrestricted read/write. An
operator setting `SPOOLMAN_CORS_ORIGIN=*` hits the identical path, and the README currently
says nothing about `CORS_ORIGIN`, authentication, or reverse-proxy hardening.

- [x] Set `allow_credentials=False` whenever the resolved origin list contains `*`.
      Worth keeping even though Spoolman has no cookies of its own: plenty of instances sit
      behind a reverse proxy that authenticates with one, and there this combination let any
      website the user visited make authenticated requests as them.
- [ ] ~~Keep this separate from the task-0 trust decision: `*` must still mean "same-origin only"
      for the CSRF and WebSocket guards.~~ **Reversed** — `*` and debug mode now disable the
      origin guards outright (see task 0). Check `allow_credentials=False` does not defeat the
      point for someone who set `*` to make a cross-origin client work.
- [x] Log a prominent startup warning when debug mode is on, or when `CORS_ORIGIN=*` — done in
      task 0 via `trusts_all_origins()`, which both guards fire through.
- [x] README: new `## Security` section. The README has no config reference at all (that lives
      in the Wiki), so this documents the no-auth property as the headline fact it is, plus
      `SPOOLMAN_CORS_ORIGIN`, the `*` warning, and the reverse-proxy `Host` requirement.

Verified against a real server with `SPOOLMAN_CORS_ORIGIN=*`:

| Header | Before | After |
| --- | --- | --- |
| `access-control-allow-origin` | `https://evil.example` (echoed) | `*` |
| `access-control-allow-credentials` | `true` | absent |

Cross-origin *writes* are still allowed under `*` — that is the opt-out working as intended,
not a gap. Startup logs both the origin-checks-disabled warning and the credentials one.

## 6. LOW-MEDIUM — CSV formula injection in `/api/v1/export/*?fmt=csv` **[confirmed]**

A vendor named `=cmd|' /C calc'!A0` is written verbatim into the export (CWE-1236); opening it
in Excel/LibreOffice executes. No `Content-Disposition` header either.

- [x] Prefix formula-like cells with a single quote — `escape_csv_value` in `spoolman/export.py`.
      Only *strings* are escaped: numbers reach the writer as numeric types, so a negative
      number cannot be read as a formula and must not grow a stray quote. Header names need no
      escaping (fixed attribute names, or extra-field keys constrained to `^[a-z0-9_]+$`).
- [x] Add `Content-Disposition: attachment` in `_export`, named per endpoint and per format.
- [x] Test: `tests/test_export.py`, plus verified end-to-end — a vendor named
      `=cmd|' /C calc'!A0` exports as `'=cmd|' /C calc'!A0`, `Prusament` is untouched, and the
      JSON export still carries the raw name (correct: JSON is not a spreadsheet).

## 7. LOW-MEDIUM — Unbounded extra-field values **[confirmed]**

`extra: dict[str, str]` has no `max_length` and the columns are `Text()`. A 2 MB value on one
spool was accepted — unbounded DB growth from a single request. Side effect observed while
testing: the resulting websocket event exceeded the 1 MiB default frame limit and killed the
live-update connection, so one oversized field degrades live updates for every client.

- [x] `EXTRA_FIELD_VALUE_MAX_LENGTH` (65535, matching the settings cap) in
      `validate_extra_field_value`. The spool/filament/vendor endpoints already turn `ValueError`
      into a 400, so no endpoint changes were needed.
- [x] Cap the field *count* too: `MAX_EXTRA_FIELDS_PER_ENTITY` (128), enforced both in
      `add_or_update_extra_field` and in the settings write path. Note the per-entity *key* count
      was already bounded — `validate_extra_field_dict` rejects unknown keys — so the unbounded
      thing was the registry itself, which is cached in memory and embedded in every response.
- [x] Return 400, not 500, when a setting exceeds the limit — `setting.update`'s `ValueError` is
      now caught in `api/v1/setting.py:update`.
- [x] Test: `tests/test_extra_field_registry.py`, plus verified end-to-end.

| Request | Before | After |
| --- | --- | --- |
| 2 MB extra value, spool create | 200, stored | 400 |
| 2 MB extra value, spool update | 200, stored | 400 |
| 100 000-char setting | 500 | 400 |
| normal extra value / setting | 200 | 200 |

The setting is left unset after the oversized write, and the server log has no 500s.

## 8. LOW — Unhandled exceptions → 500 on malformed query params **[confirmed]**

All three reproduced in the server log:

| Request | Exception |
| --- | --- |
| `?sort=name` | `ValueError: not enough values to unpack (expected 2, got 1)` |
| `?sort=name:sideways` | `KeyError` from `SortOrder[...]` |
| `?sort=metadata:asc` | `AttributeError: 'MetaData' object has no attribute 'asc'` |

`parse_nested_field` (`spoolman/database/utils.py:19`) gates on `hasattr`, so any non-column
attribute (`metadata`, `registry`, relationships) passes through to `order_by`.

- [ ] Parse `sort` in one shared helper that 400s on a missing colon, an unknown direction, or
      an unknown field, instead of the ad-hoc `split(":")` in `spool.py`, `filament.py` and
      `vendor.py`.
- [ ] Restrict `parse_nested_field` to mapped columns (check the SQLAlchemy mapper's
      `columns`/`attrs`, not `hasattr`).
- [ ] Test the three rows above → 400 with a useful message.

## 9. LOW — Information disclosure

- [ ] `/api/v1/info` (`spoolman/api/v1/router.py:48`) returns absolute host filesystem paths
      (`data_dir`, `logs_dir`, `backups_dir`) to anyone. Decide whether the client actually
      needs them; if it only needs "are backups on", drop the paths or gate them behind debug
      mode.
- [ ] `/metrics` is unauthenticated and, when `SPOOLMAN_METRICS_ENABLED`, exposes vendor and
      filament names, colors and per-spool prices
      (`spoolman/prometheus/metrics.py`). Document that it must not be exposed publicly;
      consider a bind-address or token option.

## 10. Minor

- [ ] `spoolman/main.py:91` guards the `config.js` base-path interpolation against `"` but not
      `\` — a backslash-terminated base path escapes the JS string literal. Operator-controlled
      so not attacker-reachable, but tighten it (JSON-encode the value instead of hand-quoting).
- [ ] `spoolman/database/search.py:123` (`_term_clause`) does not escape LIKE wildcards, unlike
      `extra_field_query.py` which does — `%` in a search query matches everything. Consistency,
      not a vulnerability.

---

## Verified as sound (no action)

Recorded so these are not re-audited from scratch next time:

- **No SQL injection.** Every filter goes through SQLAlchemy bind parameters, including the
  dialect-specific `@compiles` JSON helpers in `extra_field_query.py`, which interpolate only
  compiler-produced SQL and never user text. LIKE wildcards are escaped in extra-field filters.
- **No path traversal** in the SPA static handler — `/%2e%2e/%2e%2e/etc/passwd` returns the SPA
  fallback document, not the file; `spoolman/client.py:lookup_path` delegates to Starlette's
  checked implementation.
- **No `eval`/`exec`/`pickle`/shell-string execution.** The `subprocess` calls in `main.py` and
  `env.py` use argument lists with fixed arguments.
- **Dependencies current** as of the audit and past the relevant CVEs (h11 0.16.0,
  setuptools 78.1.1, starlette 1.3.1, fastapi 0.139.0).
- **No source maps** shipped in `client/dist` or `client_v2/build`.
- **Container drops root** via `gosu` in `entrypoint.sh`.
