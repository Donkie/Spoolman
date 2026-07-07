# Spoolman NG — Masterplan

**Date:** 2026-07-02 · **State snapshot:** master = fork foundation merged (#37); PR #38
(review follow-ups, hermetic e2e, CI signal gates, race/flake fixes) fully green.

An honest assessment of where the fork stands, dimension by dimension, followed by
issue-ready work items. Each item has a suggested issue title, priority, and rough
effort so it can be pasted into the tracker as-is. This document supersedes the
execution tracking in `docs/archive/FORK_ASSESSMENT.md` (now archived, essentially all
✅) as the forward-looking plan.

Priorities: **P0** = protects users or the project's viability · **P1** = needed to
grow beyond a personal fork · **P2** = robustness/DX debt · **P3** = polish.

---

## 1. Repo & release state

**Where we are.** The codebase is in genuinely good shape: ~470 behavioral tests
(backend unit + in-process integration + 4-database Docker matrix + 22 e2e journeys +
6 PWA specs), mutation-score gates (Stryker ≥90 enforced, ~97% actual — but note this runs
weekly/on-dispatch via `.github/workflows/mutation.yml`, **not** on every PR), CodeQL,
hadolint, multi-arch image builds with QEMU smoke tests, CalVer release automation,
and — since PR #38 — two CI signal gates (fail on backend 5xx during e2e, fail on
flaky-pass-via-retry) that have already caught real defects on their first outings.
All 28 language locales are at 99–100% key coverage. The filament database, docs,
help links, and release pipeline are fully fork-owned.

**The honest part.** The latest *release* is v2026.6.1, which predates everything
merged in #37/#38 — users on Moonraker one-click updates are running code without the
i18n completion, the SpoolmanDB switch, the setting-race fix, or the security docs.
And master's default `EXTERNAL_DB_URL` change means unreleased code points at the
fork's SpoolmanDB while every released artifact still points at the abandoned
upstream's Pages.

- [ ] **Cut release 2026.7.0 after #38 merges** — P0, ~15 min. Run the Release
  Trigger workflow. Acceptance: GHCR/Docker Hub images tagged, Moonraker updates
  offered, release notes generated.
- [ ] **Write a fork announcement in the release notes** — P1, ~1 h. 2026.7.0 is the
  first release where the fork is fully self-contained; say so explicitly (new
  SpoolmanDB source, 28 languages, security guidance).

## 2. Quality & CI

**Where we are.** Assertion-driven CI with deliberately advisory zones (Python
mutation baseline). The new gates make silent failure modes loud. The e2e suite is
hermetic (no live 3DFP or GitHub Pages traffic).

**The honest part.** The gates are new — expect them to surface more latent flakes
(they found the vendor-journey flake within hours; the filament journey had the same
bug). Locale files are validated for key *coverage*, not placeholder integrity — a
translation dropping `{{count}}` or a `<tag>` would ship silently today; the merge
tooling validated this once, but nothing guards future edits. The Python mutation
baseline (~39% on qidi_codec) is honest but low.

- [ ] **CI check: locale placeholder integrity** — P1, ~2 h. Extend
  `client/scripts/check-i18n.js` to verify every `{{var}}`/`{tag}`/component tag in an
  English value appears in each translation of that key; fail CI on mismatch.
  Acceptance: seeded regression (broken placeholder in a locale) turns CI red.
- [ ] **Watch the new e2e gates for a week and burn down any flakes they surface** —
  P2, reactive. Treat each pass-on-retry failure as a bug report (test or app).
- [ ] **Raise the Python mutation baseline for codecs** — P3, ~1 day. Target the
  surviving mutants in the lookup-table-heavy regions or explicitly annotate them as
  out of scope; document the resulting floor in `mutation.yml`.

## 3. Developer experience

**Where we are.** uv + npm + poe tasks, an in-process integration harness that runs
without Docker, a benchmark script, CONTRIBUTING.md, and a PR template. Onboarding is
plausible for an experienced contributor.

**The honest part.** Two real potholes were hit *in this very session*: `uv run
lefthook install` (the documented hook setup) fails because lefthook is not in the
dev dependency group — CI installs it ad hoc; and a plain `npm run build` produces a
client that renders "Missing API URL" under the e2e harness because the required
`VITE_APIURL=/api/v1` env is only set inside the CI workflow. Both cost real
debugging time and both will hit every new contributor.

- [ ] **Add lefthook to the dev dependency group** — P1, ~15 min. `uv add --dev
  lefthook`, remove the ad-hoc install from ci.yml. Acceptance: fresh clone +
  `uv sync` + `uv run lefthook install` works.
- [ ] **Make the e2e build config self-contained** — P1, ~1 h. Either commit a
  `client/.env.production` equivalent for the e2e path, have the Playwright config
  fail fast with a clear message when the build lacks an API URL, or document the
  `VITE_APIURL` requirement in CONTRIBUTING. Acceptance: a fresh contributor can run
  `npm run build && npm run test:e2e` from CONTRIBUTING instructions alone.
- [ ] **Document the local mutation-testing workflow** — P3, ~30 min. `npm run
  mutation` exists; the mutmut invocation lives only in the workflow file.

## 4. Target devices & hardware

**Where we are.** This software runs on Raspberry Pis and similar SBCs next to
Klipper/Moonraker — often armv7 (32-bit) — plus arm64 and amd64. All three arches get
Docker images *with NFC included*; CI QEMU-boots the arm64 and armv7 images and probes
`/api/v1/health`. Native installs get systemd + uv via `install.sh` (Debian/Fedora
families). Moonraker one-click updates work. Dashboard analytics are proven fine at
10k spools (~43 ms), so Pi-class CPUs are not a UI-scaling concern.

**The honest part.** NFC hardware is the least-documented surface: server-side
reading needs a USB reader (nfcpy), which in Docker requires device pass-through and
on bare metal typically udev permissions — none of which is documented, and no list
of known-working reader models exists. Browser-side Web NFC only works in Chrome on
Android **over HTTPS** — but the standard deployment (`http://pi:7912` on a LAN) is
plain HTTP, so a chunk of the NFC feature quietly doesn't apply to the most common
setup and nothing tells the user why. The armv7 image builds compile cbor2 and
psycopg2 from source (slow, fragile against dependency bumps); 32-bit ARM is a
shrinking platform that upstream Debian/Python will deprioritize — fine today, worth
a stated support policy.

- [ ] **Document NFC hardware setup end-to-end** — P0 (it's a headline feature), ~1
  day. docs/nfc.md: supported/tested USB readers, `docker run --device` /
  compose `devices:` examples, udev rule for non-root access, `SPOOLMAN_NFC_*` env
  reference, and the Web NFC HTTPS/Chrome-on-Android constraint with a reverse-proxy
  TLS recipe. Acceptance: a Pi + PN532/ACR122U user can go from zero to scanning
  using only this page.
- [ ] **Surface the Web NFC availability reason in the UI** — P1, ~half day. When Web
  NFC is unavailable, the client should say *why* (not Chrome/Android, or not a
  secure context) instead of hiding/failing the affordance.
- [ ] **State an armv7 support policy** — P2, ~30 min. README note: supported for the
  foreseeable future, best-effort as ecosystem support decays; arm64 recommended for
  new installs.
- [ ] **Add a migration step to the QEMU smoke tests** — P3, ~1 h. The smoke test
  hits `/health`; asserting the alembic upgrade log reached head on both ARM images
  would catch arch-specific DB driver issues.

## 5. External data dependencies

**Where we are.** Four external surfaces: **SpoolmanDB** (filament catalog — now
fork-hosted, synced hourly with hishel allow-stale caching and a local file cache),
**3dfilamentprofiles.com** (profile import — HTML scraping, now env-overridable and
absent from e2e), **TigerTag's API** (product lookups — with a local cache), and
**hosted Weblate** (deliberately deferred; AI-seeded translations in place).

**The honest part.** 3DFP is scraped HTML from a third party that rate-limits (we
observed 429s) and can redesign at any moment — the parser has fixture tests, but
when it breaks, users just get a generic failure. TigerTag lookups depend on
tigertag.io's availability and goodwill; the cache softens but doesn't remove that.
The AI-seeded translations are *unreviewed by native speakers* in all 27 locales —
they're grammatical and placeholder-safe, but terminology drift is likely and nobody
has proofread them.

- [ ] **Native-speaker review pass for AI-seeded locales** — P1, ongoing. Announce in
  README/Discussions that translations are AI-seeded and PRs refining them are
  welcome; track per-locale review status in a checklist issue. (Weblate later
  replaces this workflow.)
- [ ] **Graceful-degradation UX for 3DFP import failures** — P2, ~half day.
  Distinguish "profile not found" from "site unreachable/rate-limited" in the error
  toast; back off on 429.
- [ ] **Decide and document the TigerTag API dependency policy** — P2, ~1 h. What
  happens if tigertag.io disappears: cached product table keeps existing lookups
  working; document cache refresh mechanics and their failure mode.
- [ ] **Set up the Spoolman NG Weblate project** — P2 (was deferred deliberately),
  ~half day + ongoing. Hosted Weblate libre project pointed at the fork; replaces
  PR-based translation flow; wire commit integration.

## 6. SpoolmanDB (the filament catalog fork)

**Where we are.** `sherrmann/SpoolmanDB` is forked, its Pages build deploys, the app
default points at it, and end-to-end sync is verified (6,957 filaments / 33
materials). The build workflow gained `workflow_dispatch`.

**The honest part.** This is currently a **frozen snapshot**. The original
Donkie/SpoolmanDB may keep receiving community contributions (its maintenance status
is separate from Spoolman's) — every filament added there after the fork date is
invisible to Spoolman NG users, and vice versa. There is also no contribution
guidance on the fork: a user wanting to add their filament brand today has no
documented path, and the repo's README is upstream's.

- [ ] **Automated upstream-sync for SpoolmanDB** — P0, ~half day. Scheduled workflow
  on sherrmann/SpoolmanDB that fetches upstream's default branch, opens a PR when it
  has new commits (or fast-forwards when clean). Acceptance: an upstream filament
  addition lands in the fork within a week without manual work.
- [ ] **Fork identity + contribution docs for SpoolmanDB** — P1, ~2 h. README note
  (continuation, where to contribute), PR template pointing at the JSON/YAML schema
  validation, link from Spoolman NG's README/CONTRIBUTING.
- [ ] **Uptime/staleness guard** — P3, ~1 h. A scheduled workflow in the Spoolman
  repo that curls the Pages URL and opens an issue if it 404s or its data is older
  than N weeks (Pages of a personal repo can silently break).

## 7. Security posture

**Where we are.** No authentication *by design*, now honestly documented (README
"Security & exposure" + SECURITY.md threat model, private reporting via GitHub
advisories). CVE-patched dependency set. NFC auto-create is idempotent per payload
and serialized per process.

**The honest part.** "Put a proxy in front" is the right answer for the Klipper
crowd but a real adoption ceiling for "many users": every internet-exposed install is
one port-forward away from a writable inventory and a physical-tag-writing endpoint.
The auto-create lock is per-process only (documented; fine for the shipped
single-worker deployment, not for replicas).

- [ ] **Optional built-in auth (opt-in bearer token)** — P1, ~2–3 days. A single
  `SPOOLMAN_API_TOKEN` env var; when set, all mutating endpoints (or all endpoints)
  require `Authorization: Bearer`. Zero change for LAN users, one env var for exposed
  installs, no user management. Must stay compatible with Moonraker/OctoPrint
  integrations (both support configurable headers). Acceptance: token-gated write
  paths, integration docs updated, e2e covers both modes.
- [ ] **Rate-limit the NFC lookup/auto-create endpoint** — P3, ~half day. Cheap
  in-process limiter; mostly defense-in-depth once auth exists.

## 8. Community & sustainability

**Where we are.** Clean issue tracker, contributor docs, PR template, working
release cadence. The fork is *technically* ready for users.

**The honest part.** Bus factor is exactly 1: every commit since the fork is one
person, Docker Hub publishing runs under a personal account (`cookiemonster95`), the
Ko-fi link still pays the original author (kept deliberately — but it means the fork
has no funding channel at all: FUNDING.yml is an empty placeholder), and nobody
outside this repo knows the fork exists. Upstream's ~800 open issues/PRs remain
unswept for adoptable fixes. No Discussions, no announcement, and the ecosystem
(Mainsail/Fluidd/Moonraker docs, OctoPrint plugin, Home Assistant integration) still
links to the abandoned upstream.

- [ ] **Enable GitHub Discussions + write the fork announcement** — P1, ~2 h.
  Announce on r/klippers etc.; pin a "state of the fork" discussion.
- [x] **Upstream backlog sweep** — P1, ~1–2 days. **Done** (2026-07-06, PR #142) —
  see [`docs/upstream-triage.md`](docs/upstream-triage.md). One-time triage of all 265
  open Donkie/Spoolman issues (PRs excluded): 24 FIX · 108 IMPLEMENT · 133 SKIP → 98
  fork issues filed covering 132 upstream issues.
- [ ] **Integration ecosystem outreach** — P1, ongoing. PRs/issues to Moonraker,
  Mainsail, Fluidd, OctoPrint-Spoolman, spoolman-homeassistant docs listing Spoolman
  NG as the maintained endpoint.
- [ ] **Reduce single-maintainer risk** — P2, decision + ~2 h. GitHub org for the
  repos, org/second-owner on Docker Hub (or GHCR-only), branch protection on master,
  document the release credentials (PAT, REMOTE_REGISTRY_PASSWORD) recovery path.
- [ ] **Decide the funding story** — P2, ~30 min. Fill FUNDING.yml (or explicitly
  decide "no funding"); align the in-app Ko-fi link with that decision.

---

## Suggested sequencing

1. **Now:** merge #38 → cut **2026.7.0** → NFC hardware docs → SpoolmanDB
   upstream-sync workflow. (Everything users touch.)
2. **Next:** DX potholes (lefthook, e2e build config), locale placeholder CI check,
   announcement + Discussions, upstream sweep, native-speaker translation call.
3. **Then:** opt-in bearer auth, Weblate, org/bus-factor work, ecosystem outreach.
4. **Ongoing:** watch the new CI gates; each flake or 5xx they catch is a
   pre-triaged bug report.
