> _**Archived 2026-07-07.** The execution tracking in this document is essentially all complete; its forward-looking role has been superseded by [MASTERPLAN.md](../../MASTERPLAN.md). Kept here for historical record only._

# Spoolman NG — Fork Assessment & Roadmap TODOs

**Date:** 2026-07-01 · **Scope:** all work since upstream v0.23.1 (commit `eafbc64`, Feb 2026; upstream abandoned ~March 2026) through `d34402f` (PR #36).

This document assesses the ~36 PRs of fork work and lists the TODOs needed to make
Spoolman NG a solid long-term home for a large user base.

---

## 1. What has been done since March (state of the fork)

All fork work landed 2026-06-30 → 2026-07-01, PRs #2–#36, on top of upstream v0.23.1.

### Features
- **Upstream community PRs merged** (#2): extra-field filter/sort, 3D Filament Profiles
  import, weight-delta spool events, calibration sessions (new `calibration_session` /
  `calibration_step_result` tables).
- **Redesigned home dashboard** (#3): KPI cards + inventory analytics (client-side aggregation).
- **Filament label printing** (#4): label templates, QR codes, QR scanning.
- **NFC spool identification** (#5, #13): TigerTag, OpenPrintTag, QIDI codecs; Web NFC and
  server-side USB reader; `POST /api/v1/nfc/*` endpoints incl. external lookup for Klipper
  daemons; enabled on all architectures including armv7.

### Fork infrastructure
- **Identity**: rebranded "Spoolman NG", drop-in compatible with upstream (#8, #12).
- **Releases**: CalVer (`2026.6.x`), automated release workflow, release ZIP +
  `release_info.json`, Moonraker one-click updates pointing at the fork (#8, #10, #11).
- **Images**: multi-arch (amd64/arm64/armv7) published to `ghcr.io/sherrmann/spoolman` and
  Docker Hub `cookiemonster95/spoolman` with `:latest`/`:edge`/`:sha-*` tags (#6, #7).
- **Native install**: one-line `scripts/install.sh` (systemd, uv), Fedora support, armv7
  build tools (#11, #12).

### Maintenance & quality
- **Dependency refresh**: Node 22 toolchain, Debian trixie base, Starlette 1.x
  (CVE-2026-48710/48817/48818/54282/54283), hishel 1.x, Vite 8, TypeScript 6, i18next 26,
  `path-to-regexp` 8.4.2 override (ReDoS), backend dep refresh (#15–#25).
- **Bug fixes**: PWA/service-worker base-path correctness (manifest `start_url`/`scope`,
  SW registration path, navigation precache bug), `useSavedState` localStorage poisoning
  (#26–#29).
- **Testing** (#30–#36): ~431 behavioral tests — backend unit + 4-DB integration matrix
  (SQLite/Postgres/MySQL/CockroachDB), Vitest+RTL client tests, Playwright e2e (PWA flows +
  20 whole-app journeys), mutation-testing gates (Stryker ≥90 hard gate on crown-jewel
  modules, ~97% actual; mutmut advisory for Python codecs), CodeQL, hadolint.
  `TESTING_STRATEGY.md` / `TESTING_CANDIDATES.md` document the approach honestly.

### Verdict on the work so far

The engineering quality is high. CI on `master` is green, the release pipeline is fully
independent of upstream, migrations are linear and safe, new API endpoints stay under
`/api/v1` and remain drop-in compatible with Moonraker/OctoPrint/Home Assistant, N+1s are
avoided (`contains_eager`/`selectinload`), and the test/mutation gates are unusually strong
for a project of this size. **The technical base for a fork is sound.** The gaps are almost
all in *community-facing* areas: runtime coupling to abandoned upstream infrastructure,
translations, governance, and documentation.

---

## 2. Already in good shape — no action needed

- Release automation, CalVer, GHCR/Docker Hub publishing, Moonraker update path.
- `scripts/install.sh`, `docker-compose.yml`, README install instructions — all point at the fork.
- API docs published independently to `sherrmann.github.io/Spoolman` (`apidocs.yml`).
- Issue templates are neutral (no upstream references); dependabot configured for pip + npm.
- Migration chain linear; calibration tables use proper FKs with `ondelete="CASCADE"`.
- No TODO/FIXME debt introduced by the fork; known bugs are pinned by tests and documented.
- No open issues/PRs backlog.

---

## 3. TODOs

### P0 — Decouple from abandoned upstream infrastructure (breaks users if upstream rots)

1. ✅ **SpoolmanDB default URL** — *done:* `sherrmann/SpoolmanDB` is forked, its Pages
   deployment is live, and the default in `externaldb.py`/`.env.example` (plus
   README/CONTRIBUTING links) now points at `https://sherrmann.github.io/SpoolmanDB/`.
   Verified end-to-end: Spoolman's sync code parses 6,957 filaments and 33 materials
   from the fork-hosted instance. The filament catalog is now fully owned by the fork.
2. **Translation pipeline** — README points contributors to upstream's Weblate project
   (`hosted.weblate.org/projects/spoolman/`), which feeds the *upstream* repo. The fork
   currently has **no way to receive translation updates**.
   → Register a Spoolman NG project on Hosted Weblate (free for libre projects) or document
   a PR-based translation workflow; update README.
3. ✅ **Translate the fork's new features** — *done:* all 27 locales seeded with AI
   translations to 99–100% key coverage (from ~68%; `et`/`hi-Latn` from <15%, both now
   selectable in the UI for the first time). Existing human translations untouched;
   placeholders validated programmatically. Native-speaker review remains welcome via PRs.
   `client/scripts/check-i18n.js` reports per-locale coverage on every CI run.
4. **In-app links point at upstream** —
   ✅ *Done:* the help page now links to this repo's Integrations section.
   *Open:* `client/src/components/header/index.tsx:62` (Ko-fi → `ko-fi.com/donkie`) —
   decide deliberately whether the donation link should keep honoring the original author,
   point at the fork maintainer, or be removed (align with FUNDING.yml, TODO 9).
5. ✅ **Docs/wiki story** — *done:* fork-owned `docs/installation.md` (install paths, full
   env-var reference, backups, Moonraker updates) and `docs/monitoring.md` (Prometheus)
   authored from repo sources; README links point at them instead of the upstream wiki.

### P1 — Community & governance (needed before inviting many users/contributors)

6. ✅ **CONTRIBUTING.md** — *done:* dev setup (uv, npm, lefthook), PR process, testing
   expectations, translation and SpoolmanDB contribution guidance.
7. ✅ **SECURITY.md + README security section** — *done:* threat model (no auth by
   design, trusted-LAN model; `nfc/write` and `auto_create` raise the stakes),
   reverse-proxy/VPN guidance for internet exposure, private reporting via GitHub
   security advisories.
8. ✅ **Issue Manager workflow removed** — the scheduled run failed every night because
   `tiangolo/issue-manager@0.8.0`'s Docker image is broken
   (`ModuleNotFoundError: typing_extensions`), and auto-closing issues is premature for a
   young fork. Reintroduce a maintained action later if triage volume warrants it.
9. **FUNDING.yml** — currently the untouched GitHub placeholder. Fill in the fork's funding
   (consistent with whatever decision is made for the in-app Ko-fi link, TODO 4).
10. **Bus factor / ownership** — 100% of fork commits are one person; Docker Hub publishing
    runs under the personal `cookiemonster95` account (`ci.yml:653,666`). Consider a GitHub
    org (also gives the fork a neutral home if other maintainers join), a Docker Hub org or
    GHCR-only distribution, and at least one co-maintainer with release rights.
    ✅ *Done:* PR template with tests/i18n/API-compat/migration checklist.
11. **Upstream backlog triage** — upstream had ~830 issues/PRs; the fork merged four
    high-value PRs. Sweep upstream's open PRs/issues once for remaining well-tested,
    popular changes (and known bugs with fixes attached) worth adopting, and say publicly
    (README/Discussions) that this is where such contributions should now go.
12. **Attribution hygiene** — `pyproject.toml:7` still lists Donkie as author (fine as
    attribution; add maintainers field), and the release-notes template correctly credits
    upstream. Keep, but make the "continuation of an unmaintained project" wording
    consistent everywhere (README does this well already).

### P2 — Hardening & known bugs

13. ✅ **OpenPrintTag UUID bug** — *fixed:* UUID derivation now uses an RFC 4122 helper
    that produces the identical UUID on every supported interpreter (3.10 native installs
    no longer crash; Docker-created bindings unchanged); tests assert golden values.
14. ✅ **Low-stock sort/filter inconsistency** — *fixed:* filter and sort share one
    `remainingFraction` fallback chain.
15. ✅ **Abuse-resistance for `auto_create`** — *done:* auto-creation is idempotent per
    tag payload (payload-hash binding + duplicate check), concurrent scans serialize
    behind a lock, and `create-from-tag` retries return the already-bound spool.
    Integration tests fail without the guard and pass with it.
16. ✅ **DB-level cascade on `*Field` tables** — *done:* migration `e7a41c9d2b53` adds
    `ondelete="CASCADE"` on all three FKs (batch rebuild on SQLite, reflected constraint
    names elsewhere); models updated to match.
17. ✅ **Dashboard analytics at scale** — *done:* benchmarked (`npm run bench`) at
    1k/5k/10k synthetic spools. After fixing `recentSpools` to parse dates once
    (was re-parsing per sort comparison), the full home-page aggregation takes ~43ms
    at 10k spools — client-side aggregation is fine; no server-side endpoint needed.

### P3 — Polish / long tail

18. ✅ **e2e long tail** — *done:* journeys added for the calibration wizard (skip-to-
    finish + cancel/resume), print dialog (selection step, template editing + live
    preview), list filter/sort, error branches (3DFP failure, 404), and locations card
    grouping; plus a component test rendering `help.description` through real i18next
    to pin `<Trans>` interpolation. The locations drag itself is hover-driven react-dnd
    that Playwright cannot drive reliably — the resulting PATCH is covered at the API
    level with UI assertions on the regrouped state. Full journey suite: 22 passing.
19. **Community channels** — enable GitHub Discussions (or link a Matrix/Discord) so
    support questions don't all become issues; announce the fork where users will look
    (upstream issue tracker if possible, r/klippers, Moonraker/Fluidd/Mainsail docs which
    currently link upstream).
20. **Integration ecosystem outreach** — OctoPrint-Spoolman, Home Assistant integration,
    OctoEverywhere etc. target upstream's API (still compatible today); longer-term, get
    the fork listed in their docs as the maintained endpoint.

---

## 4. Suggested sequencing

- ✅ **Done on this branch:** issue-manager workflow removed; help link points at the
  fork; SECURITY.md + README security section; CONTRIBUTING.md; PR template; per-locale
  i18n coverage report in CI; README translation/SpoolmanDB notes corrected; all 27
  locales seeded to 99–100% coverage (et and hi-Latn newly enabled in the UI).
- ✅ **SpoolmanDB owned:** default URL switched to the live fork-hosted instance,
  verified end-to-end. Weblate deferred (AI-seeded translations in place meanwhile);
  Ko-fi link deliberately kept on the original author for now — revisit together with
  FUNDING.yml.
- ✅ **P2 hardening done:** both pinned bugs fixed, auto_create duplicate guard,
  cascade migration, fork-owned installation/monitoring docs.
- ✅ **P3 done:** analytics benchmarked at 10k spools (~43ms after the recentSpools
  fix — no server endpoint needed); e2e long tail covered (22 journeys passing).
- **Remaining (needs maintainer decisions or external accounts):** Ko-fi/FUNDING,
  Weblate project, upstream backlog sweep, community channels, integration outreach.
