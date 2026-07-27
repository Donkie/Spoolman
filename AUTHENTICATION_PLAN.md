# Spoolman authentication & authorization

> **Status: design proposal — nothing here is implemented yet.**
> Targets the `feature/v2-client` branch (Svelte `client_v2`). Written 2026-07-27.

## Context

Spoolman today has **zero** authentication. Every endpoint under `/api/v1` — including
`POST /setting/{key}`, `DELETE /spool/{id}` and the full-database `GET /export/*` dumps —
is open to anyone who can reach the port. That is acceptable for a LAN-only homelab
instance and unacceptable for anything else, and it blocks the multi-tenant work planned
for the near future.

This project adds an **opt-in** auth system: off by default (`SPOOLMAN_AUTH_ENABLED=FALSE`),
so zero-config boot and every existing integration keep working untouched. When enabled it
provides local username/password login, generic OIDC (Pocket ID, Authentik, Keycloak,
Zitadel — no provider-specific code), API keys for machine consumers, optional TOTP 2FA,
and optional mTLS-as-identity behind a reverse proxy. Three permission levels gate reads,
edits, and creates/deletes. The first user to register becomes the owner and administers
everyone else. Password recovery works without any email setup: admins reset from the UI,
and a new `spoolman.cli` module rescues a locked-out owner from the host shell.

Decisions already made with the maintainer: server-side CLI + owner-driven password reset
(no per-user recovery codes); mTLS terminated at the reverse proxy and usable as an
identity source; **no tenant concept in this project** (design for it, don't build it);
brute-force protection, session management UI, audit log and TOTP 2FA all in scope;
`pyjwt[crypto]` as the only new Python dependency; open first-run owner claim; `/health`,
the SPA bundle, and an opt-in anonymous-read mode stay reachable without credentials.

---

## Ground rules this must not break

- **API v1 is additive-only.** Everything new lives at new paths (`/api/v1/auth/*`,
  `/user/*`, `/apikey/*`, `/audit/*`). No existing path, param, field, or status code
  changes shape. Adding a 401/403 possibility to existing routes only happens when the
  operator opts in.
- **Zero-config boot.** `SPOOLMAN_AUTH_ENABLED` defaults to `FALSE`; with it unset the
  request path is byte-identical to today.
- **Single migration, no data backfill** → CockroachDB-safe in one revision.
- **`select = ["ALL"]` ruff** (incl. bandit `S` rules) applies to all new backend code.
- **armv7 Docker builds** rule out `argon2-cffi` / `bcrypt` (C/Rust wheels). Password
  hashing uses stdlib `hashlib.scrypt`. `pyjwt` is pure Python and `cryptography` is
  already resolved transitively via `aiomysql[rsa]`.

---

## Backend

### New dependency

`pyproject.toml` → `pyjwt[crypto]~=2.10`, then `uv lock` (CI gate `uv lock --check`,
`lefthook.yml:14,54`). Nothing else. TOTP is ~20 lines of stdlib `hmac`/`hashlib`/`struct`;
secret encryption uses `cryptography.fernet`; OIDC HTTP uses the existing `httpx`.

### Data model — `spoolman/database/models.py`

Five new tables. **All prefixed `auth_`** — `user` and `session` are reserved words in
PostgreSQL/MySQL and quoting them everywhere is a footgun not worth taking.

| Table | Key columns |
|---|---|
| `auth_user` | `id` PK, `username` String(64) unique (stored lowercased), `display_name`, `email` (nullable, OIDC matching only), `password_hash` Text nullable (null = OIDC/cert-only), `level` String(16) enum, `is_admin` bool, `is_owner` bool, `is_active` bool, `must_change_password` bool, `totp_secret` Text nullable (Fernet-encrypted), `totp_enabled` bool, `oidc_issuer`/`oidc_subject` (nullable, unique together), `failed_logins` int, `locked_until` datetime nullable, `registered`, `last_login` |
| `auth_api_key` | `id` PK, `user_id` FK, `name` String(64), `level`, `prefix` String(16) unique indexed, `key_hash` Text, `created`, `expires` nullable, `last_used` nullable, `revoked` bool |
| `auth_session` | `id` PK, `user_id` FK, `token_hash` String(64) unique indexed, `created`, `expires`, `last_seen`, `remember` bool, `user_agent` String(256), `ip` String(64) |
| `auth_audit_log` | `id` PK, `date` indexed, `event` String(64), `actor_user_id` nullable FK, `actor_kind`, `target` String(128) nullable, `ip`, `user_agent`, `detail` Text (JSON) |
| `auth_certificate` | `id` PK, `user_id` FK, `name`, `fingerprint_sha256` String(95) unique indexed, `subject_dn` String(512), `created`, `last_used` |

Relationships use `lazy="selectin"`, never `joined` — follow the comment at
`spoolman/database/models.py:10-21`.

**Migration**: one revision in `migrations/versions/`, `down_revision = "415a8f855e14"`
(current head, `2024_05_28_1846-415a8f855e14_multi_colors.py`). Pure `op.create_table` +
`op.create_index(op.f("ix_..."))` — copy the shape of
`migrations/versions/2024_01_04_2209-b8881bdb716c_added_extra_fields.py`. No backfill, so
no second revision needed. `downgrade()` drops the five tables in reverse order.

### Permission model

Two orthogonal axes, deliberately:

**Level** (`spoolman/auth/levels.py`, a `StrEnum` ordered `read < edit < manage`):

| Level | Grants |
|---|---|
| `read` | Every `GET` and every WebSocket subscription |
| `edit` | `read` + modify existing: `PATCH /spool\|filament\|vendor/{id}`, `PUT /spool/{id}/use`, `PUT /spool/{id}/measure`, `PATCH /location/{location}` |
| `manage` | `edit` + create/delete: `POST`/`DELETE` on spool, filament, vendor; `POST /setting/{key}`; `POST`/`DELETE /field/...`; `POST /backup` |

`PUT /spool/{id}/use` sits at `edit` on purpose — that is Moonraker's and OctoPrint's hot
path, so a printer gets an `edit` API key and cannot delete anything.

**Flags**: `is_admin` (manage users, API keys of others, view the audit log) and
`is_owner` (exactly one; can promote/demote admins and transfer ownership; cannot be
deleted or demoted by anyone else). Both imply `manage`.

API keys carry their own `level`, capped at their owning user's level at issue time and
re-capped on every request (demoting a user instantly weakens their keys).

### Enforcement — `spoolman/auth/`

```
spoolman/auth/
  levels.py        Level enum + comparison helpers
  principal.py     Principal dataclass: kind (user|apikey|cert|anonymous), user_id,
                   level, is_admin, is_owner, session_id, api_key_id
  hashing.py       scrypt password hash/verify (versioned string), token hashing,
                   constant-time compare, dummy-verify for timing equalization
  secret.py        SPOOLMAN_SECRET_KEY / auto-generated <data_dir>/secret.key (0600);
                   derives Fernet key for TOTP secrets and signing key for OIDC state
  dependencies.py  get_principal(), require_level(Level.X), require_admin,
                   require_owner, and WebSocket variants
  ratelimit.py     in-memory sliding-window throttle keyed by username and client IP
  audit.py         record(event, principal, request, target, detail)
  totp.py          stdlib RFC-6238
  oidc.py          discovery + PKCE + token exchange + JWKS via pyjwt
  mtls.py          trusted-proxy header parsing -> certificate fingerprint
  cli.py           lives at spoolman/cli.py (see below)
```

`get_principal()` resolution order, first match wins:

1. **Session cookie** `spoolman_session` — opaque 256-bit token, SHA-256 hashed in
   `auth_session.token_hash`. Non-GET requests additionally require a matching
   `X-CSRF-Token` header (double-submit against a non-httpOnly `spoolman_csrf` cookie).
2. **API key** — `Authorization: Bearer spm_<prefix>_<secret>` or `X-Api-Key: <same>`.
   Prefix indexes the row, secret is scrypt-compared. No CSRF (not an ambient credential).
3. **mTLS** — only when `SPOOLMAN_MTLS_ENABLED` and the peer address is inside
   `SPOOLMAN_TRUSTED_PROXIES`; reads verify/fingerprint/subject headers (names
   configurable, defaults match nginx's `X-SSL-Client-Verify` / `X-SSL-Client-Fingerprint`
   / `X-SSL-Client-S-DN`) and looks up `auth_certificate`.
4. **Anonymous** — level `read` if the `auth_anonymous_read` setting is on, else no access.

Every route in the v1 app gets an explicit
`dependencies=[Depends(require_level(Level.READ))]` (or `EDIT`/`MANAGE`). To make that
fail-closed rather than fail-open, **startup asserts coverage**: after
`v1_app.include_router(...)` runs, iterate `v1_app.routes` and raise if any route lacks an
auth dependency, excluding an explicit allow-list (`/health`, `/auth/config`,
`/auth/setup`, `/auth/login`, `/auth/oidc/*`). A forgotten route then crashes the server on
boot instead of silently serving unauthenticated. This gets its own integration test.

When `SPOOLMAN_AUTH_ENABLED` is false, `require_level` short-circuits to an
all-permissions principal before touching the DB — no query, no measurable overhead.

**WebSockets**: browsers can't set headers on `WebSocket`, but the session cookie *is*
sent on the same-origin handshake, so the SPA needs no change. Machine clients pass
`?api_key=`. WS dependencies must close before `accept()` — copy the precedent at
`spoolman/api/v1/setting.py:124-133`, using close codes **4401** (unauthenticated) and
**4403** (insufficient level).

**Outer app** (`spoolman/main.py`): `/metrics` gets a check requiring an API key when auth
is on, with `SPOOLMAN_METRICS_PUBLIC=TRUE` / `SPOOLMAN_METRICS_TOKEN` escape hatches. The
SPA mount at line 116 stays public. Any new outer-app route must be registered **before**
line 104 — the SPA mount is a catch-all.

**CORS fix required**: `spoolman/main.py:144-151` sets `allow_origins=["*"]` with
`allow_credentials=True` in debug mode, which browsers reject outright for credentialed
requests. Change debug mode to reflect the request `Origin` (or require an explicit
`SPOOLMAN_CORS_ORIGIN`) when auth is enabled. Dev is otherwise fine: `localhost:5174` and
`localhost:8000` are same-site (ports are ignored by SameSite), so a `SameSite=Lax` cookie
works across the Vite dev server.

### New endpoints — `spoolman/api/v1/auth.py`, `user.py`, `apikey.py`, `audit.py`

| Route | Gate | Purpose |
|---|---|---|
| `GET /auth/config` | public | `{enabled, setup_required, anonymous_read, oidc:{enabled,name}, mtls}` — the SPA's bootstrap probe |
| `POST /auth/setup` | public, only while 0 users | Claim ownership. Logs a loud warning + audit entry with the claiming IP |
| `POST /auth/login` | public | `{username, password, remember, totp_code?}` → sets cookies; 401 on failure, 429 when throttled, 428 when TOTP is required |
| `POST /auth/logout` | authed | Revokes the current session |
| `GET /auth/session` | authed | Current principal + capabilities |
| `POST /auth/password` | authed | Change own password (requires current) |
| `GET /auth/oidc/start`, `GET /auth/oidc/callback` | public | Auth Code + PKCE(S256), signed state/nonce cookie |
| `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `DELETE /auth/sessions` | authed | Session management UI |
| `POST /auth/totp/enroll`, `POST /auth/totp/confirm`, `DELETE /auth/totp` | authed | 2FA enrollment; returns an `otpauth://` URI (QR rendered client-side) |
| `GET/POST /user`, `GET/PATCH/DELETE /user/{id}` | admin | User CRUD; owner-only for admin/owner changes |
| `POST /user/{id}/password-reset` | admin | Returns a one-time temp password, sets `must_change_password` |
| `DELETE /user/{id}/sessions`, `DELETE /user/{id}/totp` | admin | Force logout / clear a lost authenticator |
| `GET/POST /apikey`, `PATCH/DELETE /apikey/{id}` | authed (own) / admin (all) | Plaintext key returned **once** on create |
| `GET /audit` | admin | Filterable, paginated, `x-total-count` |
| `GET/POST/DELETE /user/{id}/certificate` | admin | mTLS cert → identity mapping |

Business logic goes in `spoolman/database/auth_*.py`, not in routers — the routers
validate, delegate, and map exceptions to status codes, matching the existing convention.

### Sessions & remember-me

Opaque random token, hashed at rest, so sessions are revocable and listable (JWTs are
neither). `remember=false` → browser-session cookie, 12 h server-side idle expiry.
`remember=true` → 90-day `Max-Age`, sliding renewal on use. Cookie is `HttpOnly`,
`SameSite=Lax`, `Secure` whenever the request arrived over HTTPS (including via
`X-Forwarded-Proto` from a trusted proxy). Path is `env.get_base_path() + "/"`.

### Brute-force protection

In-memory sliding windows (safe: the deployment contract is one process) keyed by username
and by client IP, plus `failed_logins`/`locked_until` persisted on `auth_user` so account
lockout survives a restart. 5 failures → 1 min, doubling to a 15 min cap. Login always
runs a dummy scrypt verify on unknown usernames so response time doesn't leak account
existence. Client IP comes from `X-Forwarded-For` **only** when the peer is in
`SPOOLMAN_TRUSTED_PROXIES`.

### CLI — `spoolman/cli.py`, run as `python -m spoolman.cli`

Module form rather than a console script, because the Docker image runs from source rather
than an installed distribution. Connects with the same env config; refuses to run if the
schema is missing (it never migrates).

```
python -m spoolman.cli user list
python -m spoolman.cli user create <name> --level manage --admin [--owner]
python -m spoolman.cli user reset-password <name>       # prints a one-time password
python -m spoolman.cli user set-level <name> <level>
python -m spoolman.cli user disable|enable <name>
python -m spoolman.cli user clear-totp <name>
python -m spoolman.cli apikey list|revoke <id>
python -m spoolman.cli session revoke-all [--user <name>]
python -m spoolman.cli auth status
```

Documented as `docker exec -it spoolman python -m spoolman.cli ...`. This is the owner's
lockout escape hatch and is the reason no per-user recovery codes are needed.

### Configuration

New env vars in `spoolman/env.py` (copy the boolean-parsing pattern at `env.py:471-488` and
the `_FILE` secret pattern at `env.py:139-170`), all documented in `.env.example`:

`SPOOLMAN_AUTH_ENABLED`, `SPOOLMAN_SECRET_KEY(_FILE)`, `SPOOLMAN_TRUSTED_PROXIES`,
`SPOOLMAN_METRICS_PUBLIC`, `SPOOLMAN_METRICS_TOKEN`,
`SPOOLMAN_OIDC_{ENABLED,ISSUER,CLIENT_ID,CLIENT_SECRET(_FILE),SCOPES,DISPLAY_NAME,REDIRECT_BASE,USERNAME_CLAIM,GROUPS_CLAIM,GROUP_LEVEL_MAP,ADMIN_GROUP,AUTO_CREATE_USERS,DEFAULT_LEVEL}`,
`SPOOLMAN_MTLS_{ENABLED,REQUIRED,HEADER_VERIFY,HEADER_FINGERPRINT,HEADER_SUBJECT}`.

New DB settings via `register_setting()` in `spoolman/settings.py` (no migration needed):
`auth_anonymous_read` (boolean, default `false`), `audit_log_retention_days` (number,
default 90). **Guard `GET /setting/`** so it never returns auth-internal keys to a
non-admin.

Audit-log pruning is a new job on the existing `Scheduler` in `main.py:startup()`.

---

## Frontend — `client_v2` (Svelte 5 + SvelteKit 2)

No React, no Refine, no AntD, no form library, no query library. Everything is hand-rolled
components + rune-based singleton stores, so auth wiring is small and explicit.

### Core plumbing

- **`src/lib/api/http.ts`** — the single choke point. Add `credentials: 'include'` to all
  six verb helpers, attach `X-CSRF-Token` from the `spoolman_csrf` cookie on non-GET, and
  make `ensureOk` route 401 → `auth.markSignedOut()` and 403 → a localized permission
  toast. `src/lib/api/search.ts` builds its own `fetch` and must be moved onto `getJson`
  so it isn't an auth hole.
- **`src/lib/api/auth.ts`** — new endpoint module (config, login, logout, session, users,
  api keys, sessions, TOTP, audit).
- **`src/lib/stores/auth.svelte.ts`** — new rune store, matching the existing
  `settings.svelte.ts` / `serverInfo.svelte.ts` shape:
  `state: 'loading'|'setup'|'anon'|'authed'`, `user`, `level`, and derived capability
  getters `canEdit` / `canCreate` / `isAdmin` / `isOwner`. When auth is disabled the store
  reports full capability, so every call site works unchanged in the default config.
- **`src/routes/+layout.svelte`** — add `auth.load()` to the existing `$effect` alongside
  `settings.load()` / `serverInfo.load()`, and render `<LoginScreen>` / `<SetupScreen>`
  instead of `{@render children()}` while unauthenticated. `startLiveSync()` must not
  start until authenticated.
- **`src/lib/api/live.ts`** — on close codes 4401/4403, stop the reconnect loop (currently
  it would hot-retry with backoff forever) and hand off to `auth.markSignedOut()`.
  Reconnect after a successful login.

### New routes

`src/routes/login/`, `src/routes/setup/`, `src/routes/account/`, `src/routes/users/`.
`adapter-static` prerenders each into its own `.html`, which `spoolman/client.py`
`lookup_path()` already resolves generically — no backend change needed. `NavTabs.svelte`
gains a conditional **Users** tab (its `tabs` array is `satisfies { href: Pathname }`, so
the route must exist for the type to pass), and `TopBar.svelte` gains a user menu with
Account / Sign out.

- **`/login`** — username + password + a **Remember me** checkbox, an "Sign in with
  {provider}" button when `oidc.enabled`, and a TOTP step when the server answers 428.
- **`/setup`** — first-run owner creation, shown when `setup_required`. Carries a visible
  warning that the instance is unclaimed.
- **`/account`** — change password, TOTP enrollment (QR via the already-present `qrcode`
  npm dep, from the server's `otpauth://` URI), active sessions list with revoke /
  "sign out everywhere", and personal API keys (plaintext shown once, copy button).
- **`/users`** — admin only. User list, create, level/admin editing, disable, force
  password reset (shows the one-time password), revoke sessions, clear TOTP, manage that
  user's API keys and mTLS certificates. Audit-log viewer as a section here.

### Capability gating

Reuse the existing patterns rather than adding a framework: the inline auto-save editors
(`SpoolInspector.svelte`, `FilamentInspector.svelte`, `VendorInspector.svelte` via
`src/lib/utils/saver.ts`) become read-only at level `read`; the add and scan buttons in
`TopBar.svelte`, `AddSpoolModal.svelte`, delete actions, and the settings page's
write controls hide or disable below their required level. Gating is cosmetic — the server
is the authority.

### i18n

New keys go into **`client_v2/locales/en/common.json` only** (flat dotted keys,
i18next-style `{{var}}`); every other locale is Weblate's. Used as
`m['auth.signIn']()` after `import * as m from '$lib/paraglide/messages'`.

---

## Multi-tenancy readiness (design only — no tenant code in this project)

Keep the seam cheap to open later:

- All auth DB access goes through `spoolman/database/auth_*.py` functions that already take
  the `Principal`. A tenant filter later slots into those functions, not into 40 routers.
- `Principal` gets a `tenant_id: int | None = None` field now, unused. Everything that
  passes a principal is then already threading tenancy.
- Document in the model file that `auth_user.username` uniqueness becomes
  `(tenant_id, username)`, and that `auth_api_key.prefix` stays globally unique (it is a
  lookup key, not a name).
- Prefer integer surrogate PKs on all five tables (matches existing tables) so a
  `tenant_id` FK is a pure add-column later.

---

## Delivery phases

| Phase | Contents |
|---|---|
| **1 — Foundation** | Env flags, secret key, all five tables + the single migration, `spoolman/auth/` core, route-level annotations + startup coverage assertion, password login, sessions/cookies/CSRF, brute-force, open first-run setup, anonymous-read setting, `/metrics` gating, CORS fix, CLI. Frontend: auth store, `http.ts` wiring, `/login` + `/setup`, layout gate, logout, capability gating, live.ts 4401 handling. |
| **2 — Machine access & accountability** | API key endpoints + `/account` key UI, audit log write sites + `/audit` + viewer, `/users` admin page with password reset. |
| **3 — OIDC** | Discovery, PKCE, JWKS, claim→level/admin mapping, JIT provisioning, account linking, "Sign in with…" button. |
| **4 — 2FA & sessions** | TOTP enroll/confirm/disable, login TOTP step, session list + revoke UI, admin clear-TOTP. |
| **5 — mTLS** | Trusted-proxy header parsing, `auth_certificate` mapping, cert management UI, `SPOOLMAN_MTLS_REQUIRED` gate, nginx/Traefik/Caddy documentation. |

Each phase is independently shippable and leaves auth-disabled behavior untouched.

---

## Verification

**Regression (the most important gate).** With auth off, behavior must be identical:
run the full 4-DB suite unchanged — `poe itest` (`tests_integration/run.py`, SQLite +
PostgreSQL + MariaDB + CockroachDB). No existing test file may be edited; if one needs
editing, the contract broke. `tests_integration/tests/conftest.py:40-54` polls `GET /` and
`tests_frontend/run.py:30` polls `/api/v1/health` — both stay public, so neither harness
needs changes.

**Migration.** Confirm `alembic upgrade head` applies cleanly on all four backends from a
pre-existing populated database, then `downgrade` back and `upgrade` again on SQLite. The
4-DB compose run covers the upgrade path automatically since migrations run at startup.

**New auth suite.** Add `tests_integration/docker-compose-sqlite-auth.yml` (auth enabled,
plus one Postgres variant) and `tests_integration/tests/auth/`:

- `test_route_coverage.py` — every v1 route carries an auth dependency (asserts the
  startup self-check, the single highest-value test here).
- `test_levels.py` — a `read` key gets 403 on `PATCH /spool/{id}`; an `edit` key succeeds
  on `PUT /spool/{id}/use` but gets 403 on `DELETE /spool/{id}`; `manage` succeeds on both.
- `test_login.py` — success, wrong password, unknown user (equal timing), lockout after N
  failures, `remember` cookie `Max-Age`.
- `test_setup.py` — first call claims ownership; second call 409.
- `test_apikey.py` — plaintext returned once, revoke takes effect, key capped by owner
  level, demoting the user weakens the key.
- `test_csrf.py` — cookie-authenticated POST without `X-CSRF-Token` is rejected; the same
  request with an API key succeeds.
- `test_websocket.py` — unauthenticated WS closes with 4401; wrong-level closes 4403;
  `?api_key=` connects.
- `test_anonymous_read.py` — setting off → 401 on `GET /spool`; on → 200 on GET, 401 on POST.

**OIDC (phase 3).** Stand up a local generic provider container (Dex or Keycloak) in a
compose file and test discovery → PKCE → callback → session end-to-end. Then a manual
smoke against a real Pocket ID instance before merge, since Pocket ID is the named target.

**mTLS (phase 5).** An nginx container terminating mTLS in front of Spoolman, with a
self-signed CA; assert cert→user mapping works and that the same headers sent directly
(peer not in `SPOOLMAN_TRUSTED_PROXIES`) are ignored — that spoofing test matters more
than the happy path.

**Client.** `cd client_v2 && npm run check` (svelte-check), `npm run lint`, prettier, and
the existing `e2e/a11y-mobile.spec.ts` axe audit extended to the login and users pages.
Manual smoke of the two-terminal dev loop (`uvicorn` + `vite --port 5174` with
`VITE_APIURL` and an explicit `SPOOLMAN_CORS_ORIGIN`) to confirm cookies cross the dev
origin, plus a production-image run to confirm the prerendered `/login` and `/users`
documents resolve under a non-empty `SPOOLMAN_BASE_PATH`.

**Manual acceptance.** Fresh SQLite instance, auth on: claim owner → create an `edit` user
→ create a `read` API key → point a real Moonraker (or a curl script replaying its
`PUT /use` calls) at it and confirm usage tracking works with an `edit` key and is
rejected with a `read` key.
