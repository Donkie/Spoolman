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

**Reverse proxies — handled, no configuration needed.** (Narrowed by task 4, which added a host
check that a proxy on a public domain name *does* have to be told about; see there.) The guard
compares `Origin` against
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

## 4. MEDIUM — No `Host` validation → DNS rebinding — **shipped opt-in**

`Host: attacker.example.com` returns 200 **[confirmed]**. For an unauthenticated LAN service,
rebinding gives a malicious page genuine same-origin access — full read *and* write, including
`DELETE` — which bypasses tasks 1-3 entirely.

**Built, but off unless `SPOOLMAN_ALLOWED_HOSTS` is set (Donkie's call).** The default was
originally on; that was wrong. The only hostname the guard can refuse is a registrable public
domain, so switching it on by default would have broken every reverse-proxy-on-a-real-domain
deployment — people who configure *nothing* today — with a 400 on every request until they found
a new environment variable. Meanwhile the deployments rebinding can actually reach are addressed
by an IP, a single-label name or `.local`, none of which the guard ever refuses. **The group that
breaks and the group that gains barely overlap**, which is the tell that the default was wrong:
it bought little and cost a lot of setup friction, against a payoff for the attacker of reading
or trashing a filament inventory. Spoolman's priority is that a new user who does not care about
any of this has nothing to configure.

So rebinding remains an accepted risk in the default configuration. Tasks 1-3 are unaffected and
stay on by default — those close CSRF and websocket hijacking, which need no setup to guard.

- [x] Add `TrustedHostMiddleware` in `spoolman/main.py`. Written in `spoolman/security.py`
      rather than reusing Starlette's, which matches only literal and `*.`-prefixed patterns and
      so cannot express "any IP literal" or "any single-label name" — the two rules that keep
      ordinary deployments working.
- [x] Default must not break existing deployments. The rule turned out to be sharper than
      "localhost, `*.local`, private ranges": what an attacker needs is a **registrable public
      domain name**, so everything that cannot be one is allowed —
      **any** IP literal (the browser then connected to that address directly, with no name in
      between to rebind, so a public literal is as safe as a LAN one), **any** single-label name
      (`spoolman`, a Docker service name — not registrable), and the non-registrable suffixes
      `.local`, `.localhost`, `.lan`, `.home`, `.home.arpa`, `.internal`. Startup logs the policy.
- [x] `SPOOLMAN_ALLOWED_HOSTS` added, and it doubles as the on switch: naming a host is the only
      way to enable the guard, so there is never a state where the operator has to think about it
      without having asked for it. `SPOOLMAN_CORS_ORIGIN` deliberately does **not** turn it on —
      otherwise setting CORS for a Fluidd instance would silently start refusing your own
      hostname — but once it is on, the hostnames inside the CORS origins are folded in, so
      nobody has to write their domain in two variables. Hostnames, not origins; `*.example.com`
      covers the apex too.
- [x] ~~README:~~ **Wiki** — see the reversal on task 5's README item. Owed there: what
      `SPOOLMAN_ALLOWED_HOSTS` is for, and that turning it on means a reverse proxy on a public
      hostname must list that hostname, or requests get a 400 whose body names the variable.

**Task 0's "reverse proxies — handled, no configuration needed" still stands**, because the guard
is off by default. It stops being true only for an operator who opts in and serves a public domain
name — their `Host` (or `X-Forwarded-Host`) is that domain and must be declared. That is inherent:
an instance cannot know its own public name. It is now a cost only the people who asked for it pay.

`X-Forwarded-Host` is checked alongside `Host`, because `is_trusted_request` accepts it as this
instance's identity; leaving it unchecked would hand back the hole. An absent `Host` is allowed:
browsers always send one, so its absence means a non-browser client, which is not the threat.

Applied to reads as well as writes, unlike the origin guard: a rebound name is same-origin as far
as the browser is concerned, so the attacker can read the responses too.

Verified against a real uvicorn (`tests/test_host_validation.py`, 55 unit tests, plus raw ASGI
requests and raw websocket handshakes), in both configurations:

| Request | Default (unset) | `SPOOLMAN_ALLOWED_HOSTS` set |
| --- | --- | --- |
| `GET /spool`, `Host: spoolman.mydomain.com` (proxy user) | 200 | 200 once declared |
| `GET /spool`, `Host: evil.example` | 200 | 400 |
| `POST /setting/currency`, `Host` + `Origin` both evil | 200 | 400, value unchanged |
| `DELETE /spool/1`, `Host` + `Origin` both evil | 200 | 400 |
| `GET /spool`, `X-Forwarded-Host: evil.example` | 200 | 400 |
| websocket handshake, `Host: evil.example` | 101 | 403 |
| `Host:` own IP / `spoolman` / `spoolman.local` | 200 | 200 |
| `POST /setting/currency`, no `Origin` (Moonraker-shaped) | 200 | 200 |
| cross-origin `POST` (task 1, unrelated guard) | 403 | 403 |

The default column is byte-for-byte what the branch did before this task, including no extra
startup log line — confirmed against a server started with no host configuration at all.

The integration compose files set `SPOOLMAN_ALLOWED_HOSTS` so the suite exercises the guard; the
default-off path is covered by the unit tests and by `tests_frontend_v2`, which drives a real
browser against a Spoolman started with no host configuration.

Note the websocket row: uvicorn renders any close sent before the handshake is accepted as HTTP
403 regardless of the close code, so `WS_CLOSE_BAD_HOST` (4400) is only visible to a client that
inspects the close frame.

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
- [ ] ~~README: new `## Security` section documenting the no-auth property, `SPOOLMAN_CORS_ORIGIN`,
      the `*` warning, and the reverse-proxy `Host` requirement.~~ **Reversed (Donkie's call).**
      Reverted; the README is back to master's. Config and deployment guidance belongs in the
      Wiki, and duplicating it here gives it two homes that drift apart.
      **Still owed, in the Wiki:** the no-auth property, `SPOOLMAN_CORS_ORIGIN` (including that
      `*` and `SPOOLMAN_DEBUG_MODE` disable origin checks entirely), and the reverse-proxy
      requirement to forward the original host (`proxy_set_header Host $host`,
      `ProxyPreserveHost On`, or `X-Forwarded-Host`). The reverted section's text is in the
      branch history if it is worth reusing.

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

- [x] `parse_sort` in `spoolman/database/utils.py`, used by all four call sites (`spool.py` has
      two — list and group). Tolerates whitespace, rejects a missing colon, an empty field name
      and an unknown direction.
- [x] Restrict `parse_nested_field` to mapped columns via `sqlalchemy.inspect(...).columns`
      instead of `hasattr`. Relationship traversal (`filament.`/`vendor.`) still works.
- [x] Test: `tests/test_sort_parsing.py`, plus verified end-to-end on all three endpoints.

**Found while testing:** `database/vendor.py` was not using `parse_nested_field` at all — a bare
`getattr(models.Vendor, fieldstr)` — so `/vendor` kept returning 500 after the helper was fixed.
Now uses the shared helper like `filament.py` does. Worth noting that the audit only listed the
three failing rows generically; the vendor path needed a separate fix.

All three endpoints now 400 on `sort=name`, `sort=name:sideways`, `sort=metadata:asc`,
`sort=registry:asc` and `sort=nonsense:asc`, while `sort=id:asc` and multi-field sorts still
return 200. No unhandled exceptions in the server log.

## 9. LOW — Information disclosure

- [x] `/api/v1/info` paths — **decided: keep them, no code change.** The audit asked whether the
      client needs them. It does: both clients render them (`client/src/components/version.tsx`,
      `client_v2/src/lib/api/info.ts`), so dropping or debug-gating them is a visible regression
      in two UIs *and* removes response fields from a v1 endpoint, which N1 forbids outright.
      Weighed against that, the disclosure buys an attacker almost nothing here — anyone who can
      read `/info` can already read the whole inventory, since nothing is authenticated, and the
      audit separately confirmed there is no path traversal to chain the paths into. Recorded so
      this is not re-raised as an oversight.
- [x] `/metrics` — **decided: no token or bind-address option; warn instead.** It is already
      opt-in (`SPOOLMAN_METRICS_ENABLED` defaults to FALSE), so nobody is exposed without asking.
      An auth token would be the only authentication anywhere in the product, on its least
      important endpoint, and a second bind address means a second server to run and support;
      both are a poor trade for a project whose stated position is "no auth, protect it at the
      network". What was missing is that an operator enabling it has no idea *what* it publishes,
      so `database.py` now logs a warning naming the data (vendor and filament names, colors,
      per-spool prices) when metrics are switched on. Same pattern as the `CORS_ORIGIN=*` warning.
- [ ] **Wiki**, owed: that `/metrics` is unauthenticated and what it exposes.

## 10. Minor

- [x] `config.js` base path is now `json.dumps`'d instead of hand-quoted, so the backslash case
      the `"` check missed cannot escape the JS string literal. The old check also *refused to
      serve* on a quote; encoding correctly means a legal base path containing one now works.
      Test: `tests/test_configjs.py`, driving the real endpoint.
- [x] `search.py` now escapes LIKE wildcards via the shared `escape_like`/`LIKE_ESCAPE`, which
      moved from `extra_field_query.py` into `database/utils.py` so both use one implementation
      rather than two that can drift. Two call sites, not the one the audit listed: `_term_clause`
      *and* the extra-field EXISTS clause at `search.py:163`. Test: `tests/test_like_escaping.py`.
- [ ] **Not done, needs your call — `add_where_clause_str` / `add_where_clause_str_opt`
      (`database/utils.py:125,148`) have the same unescaped `ilike`.** These back the v1 list
      filters (`?filament.name=...`), so escaping them changes what an existing endpoint returns:
      today `_` is a single-character wildcard, so `?filament.name=PLA_Basic` also matches
      `PLAxBasic`. Escaping makes it literal — strictly more correct, and it would still find the
      row the user meant — but it is a behavior change on API v1, which per change-control needs
      your sign-off rather than a quiet fix. Left alone deliberately; `search.py` was the audit's
      item and is a newer endpoint with no such expectations.

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
