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

- [ ] Add `spoolman/security.py` with
      `is_trusted_origin(origin: str | None, host: str) -> bool` — true when `origin` is absent
      (same-origin navigation or a non-browser client such as Moonraker/OctoPrint), when it
      matches the request's own `Host`, or when it is in the `SPOOLMAN_CORS_ORIGIN` list.
      Unset `SPOOLMAN_CORS_ORIGIN` therefore means "same-origin only", which is the right
      default for every existing deployment.
- [ ] Normalize before comparing. `get_cors_origin()` is a bare `cors.split(",")` — no
      trimming, no case folding, no trailing-slash handling. `"https://a, https://b"` yields
      `" https://b"`, which will never match an `Origin` header. Fix it in
      `get_cors_origin()` so CORS and the new guard both benefit, and keep the raw value in the
      startup log so a typo is visible.
- [ ] Decide `*` explicitly: it conveys no trust information, so the origin guard should treat
      it as "same-origin only" and log a warning, **not** as "trust everyone". Note that CORS
      never protected writes in the first place (a cross-origin form post needs no preflight),
      so letting `*` disable the guard would silently un-fix tasks 1-3 for exactly the
      operators most at risk. See task 5.
- [ ] Unit-test: no Origin; Origin matching Host; allowlisted; foreign; near-miss
      (`https://evil-spoolman.local` vs `https://spoolman.local`); whitespace-padded list entry;
      `*`.

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

- [ ] Reject non-JSON content types on this endpoint. Preferred: keep the `str` body but pin
      the media type (`Body(media_type="application/json")`) so a `text/plain` post 415s.
      Must stay wire-compatible for existing JSON clients (API v1 compat is a non-negotiable).
- [ ] Add a `Depends` guard (or middleware) rejecting `POST`/`PUT`/`PATCH`/`DELETE` whose
      `Origin` fails `is_trusted_origin`, returning 403. Applies app-wide, not just here.
- [ ] Validate the array shape when `extra_fields_*` is written through the settings endpoint —
      run it through `ExtraField.model_validate` and 400 on failure, so a bad write can never
      wedge `/field/{entity}` again.
- [ ] Invalidate `extra_field_cache` when `extra_fields_*` is written via `/setting/{key}`
      (`spoolman/extra_field_registry.py:145`); today the cache only refreshes via the
      `/field` endpoints, so the two paths disagree until restart.
- [ ] Integration test: `text/plain` post → 415; `application/json` post → 200; cross-origin
      JSON post → 403; malformed `extra_fields_spool` → 400 and `/field/spool` still 200.

## 2. HIGH — CSRF-triggerable backup rotation destroys restore points **[confirmed]**

`POST /api/v1/backup` takes no parameters, so a bodyless cross-origin form post reaches it.
`backup_and_rotate` (`spoolman/database/database.py:112`) deletes `.5`, shifts the rest down
and writes a fresh snapshot. Six cross-origin posts left all six backup files created inside
the attack window — the real history was gone. Chained after task 1, an attacker corrupts
state *and* burns the rollback path.

- [ ] Cover `/backup` with the task-1 origin guard.
- [ ] Skip rotation when the live DB is byte-identical to the newest backup, so repeated
      calls cannot churn through the history.
- [ ] Rate-limit `/backup` (e.g. one rotation per N minutes; return the existing path
      otherwise).
- [ ] Integration test: N rapid backup calls preserve at least the oldest restore point.

## 3. MEDIUM-HIGH — Cross-site WebSocket hijacking **[confirmed]**

No WS endpoint validates `Origin` (`spoolman/api/v1/router.py:90`, plus `spool.py`,
`filament.py`, `vendor.py`, `setting.py`). WebSockets are exempt from CORS, so this is the one
channel that bypasses the same-origin policy protecting REST reads. A client sending
`Origin: https://evil.example` connected to `/api/v1/spool` and received a full spool payload
— location, price, filament and vendor names — as soon as the inventory changed. A malicious
tab left open passively exfiltrates the inventory.

- [ ] Add a shared WS dependency/helper that calls `is_trusted_origin` and closes with code
      4403 before `websocket.accept()`.
- [ ] Apply it to all nine WS endpoints — root, plus a collection-level and an item-level one
      each for spool, filament, vendor and setting. `grep -rn "@router.websocket\|@app.websocket"
      spoolman/` lists them; confirm none are missed.
- [ ] Integration test: WS with a foreign `Origin` is refused; WS with no `Origin` (Moonraker,
      OctoPrint and other non-browser consumers) still connects.

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

- [ ] Set `allow_credentials=False` whenever the resolved origin list contains `*`.
- [ ] Keep this separate from the task-0 trust decision: `*` must still mean "same-origin only"
      for the CSRF and WebSocket guards, otherwise setting it silently un-fixes tasks 1-3.
- [ ] Log a prominent startup warning when debug mode is on, or when `CORS_ORIGIN=*`, spelling
      out that any website can then read and write the API.
- [ ] README: document `SPOOLMAN_CORS_ORIGIN` with an explicit "do not use `*` on a shared
      network" warning, plus a short "Spoolman has no authentication — put it behind a reverse
      proxy with auth if it is reachable beyond your LAN" section.

## 6. LOW-MEDIUM — CSV formula injection in `/api/v1/export/*?fmt=csv` **[confirmed]**

A vendor named `=cmd|' /C calc'!A0` is written verbatim into the export (CWE-1236); opening it
in Excel/LibreOffice executes. No `Content-Disposition` header either.

- [ ] In `spoolman/export.py:dump_as_csv`, prefix any cell whose first character is
      `=`, `+`, `-`, `@`, tab or CR with a single quote.
- [ ] Add `Content-Disposition: attachment; filename="spools.csv"` (and filaments/vendors) in
      `spoolman/api/v1/export.py:_export`.
- [ ] Test: a vendor named `=1+1` exports as `'=1+1`; a normal name is untouched; JSON export
      is unaffected.

## 7. LOW-MEDIUM — Unbounded extra-field values **[confirmed]**

`extra: dict[str, str]` has no `max_length` and the columns are `Text()`. A 2 MB value on one
spool was accepted — unbounded DB growth from a single request. Side effect observed while
testing: the resulting websocket event exceeded the 1 MiB default frame limit and killed the
live-update connection, so one oversized field degrades live updates for every client.

- [ ] Enforce a per-value cap in `validate_extra_field_value`
      (`spoolman/extra_field_registry.py:59`) — 64 KB matches the settings cap — and a cap on
      the number of keys per entity.
- [ ] Return 400, not 500, when a setting exceeds the 65535-char limit: catch the `ValueError`
      raised in `spoolman/database/setting.py` at `spoolman/api/v1/setting.py:update`.
- [ ] Test: oversized extra value → 400; oversized setting → 400; both leave the DB unchanged.

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
