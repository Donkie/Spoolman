# Test Coverage Strategy

Goal: **complete, behavioral test coverage** for every change catalogued in
[`TESTING_CANDIDATES.md`](./TESTING_CANDIDATES.md) (103 items across 6 clusters), written so the
tests verify **observable contracts**, not the current implementation. This document defines the
principles, the infrastructure to stand up, the per-cluster approach, the phased rollout, and the
quality gates that let us claim "complete."

---

## 0. The one rule that governs everything: test behavior, not implementation

A test that mirrors the code it tests passes even when the code is wrong, and breaks on every
harmless refactor. To avoid that, **every test needs an independent oracle** — a source of truth
that was *not* produced by the code under test.

| Anti-pattern (tests the implementation) | Best practice (tests the behavior) |
|---|---|
| Assert `encode()` output equals bytes that `encode()` itself produced | Assert against a **golden vector** taken from the spec / a real tag capture |
| Re-implement the `remaining ?? initial ?? weight` fallback in the test to compute "expected" | Assert against **hand-computed** numbers from a fixed dataset, plus **invariants** |
| Spy that `useSavedState` called `localStorage.removeItem` | Assert the **observable end state**: the key is absent and the next mount reads the default |
| Snapshot the exact SQL the filter builder emits | Assert the **query results** against a seeded DB (behavior); keep SQL snapshots only as a narrow cross-dialect guard |
| Mock the module's own internal helper and assert it was called | Mock **only at boundaries** (network, DB, hardware, clock, storage); let internals run for real |
| `expect(fn).toHaveBeenCalledTimes(1)` on an internal collaborator | Assert the **effect the caller can see** (return value, DB row, rendered text, navigation) |

Five concrete techniques we will lean on, in priority order:

1. **Golden vectors** — checked-in inputs with externally-verified expected outputs (tag byte
   dumps, 3DFP HTML fixtures). The expected values come from the spec or a real capture, never from
   our own encoder.
2. **Round-trip / inverse invariants** — `decode(encode(x)) == x` and `encode(decode(b)) == b`.
   Cheap and powerful, but **insufficient alone**: a symmetric bug (encoder and decoder wrong the
   same way) passes a round-trip. Always pair round-trips with ≥1 golden vector per format.
3. **Cross-implementation equivalence** — the TigerTag codec exists in **both** Python
   (`tigertag_codec.py`) and TypeScript (`tigertagCodec.ts`). Two independent implementations
   agreeing on the same golden vectors is a strong oracle; make them share one fixture set.
4. **Property-based testing** — generate random valid structs and assert round-trip; generate
   random *bytes* and assert the decoder only ever raises the declared exception (never crashes,
   never over-reads). Catches the edge cases enumerated tests miss.
5. **Invariants over exact values** — "sum of the per-material weights equals the total remaining
   weight", "counts across every breakdown sum to the spool count". These survive refactors and
   don't duplicate the implementation.

**Mocking policy (this is where implementation-coupling sneaks in):** mock at system boundaries
only — outbound HTTP, the DB *engine* (never in integration tests, which use a real DB), NFC
hardware, the clock, `localStorage`, `matchMedia`. Never mock a private function of the unit under
test, and never assert on the call sequence of internal collaborators. If a test needs to reach
inside the module to work, that is a design smell — add a seam (see §5), don't reach in.

---

## 1. Infrastructure to stand up

### 1a. Backend (pytest) — mostly present, small additions

Already have: `pytest~=9.0`, `pytest-asyncio~=1.3` (`asyncio_mode=auto`), `pytest-cov~=7.0`,
`httpx`, integration harness in `tests_integration/`. Add to the `dev` dependency-group:

- **`hypothesis`** — property-based tests for the codecs/parsers (the highest-leverage add).
- **`time-machine`** (or `freezegun`) — freeze the clock for `bump.py` CalVer and any date logic.
- **`respx`** — mock `httpx` at the transport boundary for `externaldb.py` / 3DFP without a live
  network (works with the hishel `AsyncCacheClient`).
- **`dirty-equals`** *(optional)* — expressive partial assertions on API JSON without over-pinning.

New layout:

```
tests/                         # fast, no DB, no network — pure logic
  fixtures/nfc/*.bin           # golden tag byte dumps (shared with the TS suite)
  fixtures/3dfp/*.html         # real captured 3DFP pages
  conftest.py                  # fixture loaders, cbor2 payload builders
  nfc/test_tigertag_codec.py
  nfc/test_qidi_codec.py
  nfc/test_openprinttag_codec.py
  nfc/test_detect_format.py
  test_extra_field_registry.py
  test_bump_calver.py
  ...
tests_integration/tests/       # real DB + running server (existing harness)
  nfc/ externaldb/ filament/ (search) spool/ (use_weight, delete) ...
```

Note: Ruff runs `select = ["ALL"]` on everything; the `tests*/*` per-file-ignores already relax
`S101` (assert), `PLR2004` (magic numbers), `ANN201`, `D103`, etc., so idiomatic pytest is fine.

### 1b. Frontend (Vitest) — greenfield, must be created

No runner exists. Target stack (all compatible with Vite 8 / React 19 / TS 6):

- **`vitest`** (v3.x) with the `@vitejs/plugin-react` already present.
- **`jsdom`** (or `happy-dom`) environment.
- **`@testing-library/react`** (v16+, React 19 support), **`@testing-library/user-event`**,
  **`@testing-library/jest-dom`**.
- **`msw`** (v2) — mock `axios`/`fetch` at the network boundary instead of hand-stubbing.
- **`@vitest/coverage-v8`**.

Wire-up:

- Add a `test` block to `vite.config.ts` (`environment: 'jsdom'`, `setupFiles`, `globals: true`).
- `client/src/test/setup.ts`: import `@testing-library/jest-dom`, install `localStorage` +
  `matchMedia` polyfills, set `window.SPOOLMAN_BASE_PATH`, start/stop the MSW server.
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`.
- Co-locate tests next to source: `saveload.test.ts`, `home/analytics.test.ts`, etc.

### 1c. CI

- New `frontend-tests` job: `npm ci && npm run test:coverage` (fast, no browser).
- Existing backend job: add a `pytest tests/ --cov=spoolman --cov-branch` unit step (fast) ahead of
  the DB integration matrix.
- Coverage upload + threshold gate (§6). Keep `npm audit` / `check-i18n` as they are.
- **e2e** (Playwright, Chromium already provisioned) as a separate, non-blocking job for the
  PWA/service-worker/manifest flows that can only be verified in a real browser.

---

## 2. Per-cluster approach and the oracle for each

For every cluster: **what we assert against** (the oracle) and **what we refuse to do** (the
coupling trap).

### NFC codecs & lookups (rows 1–31)

- **Oracle:** checked-in **golden byte vectors** per format (TigerTag NTAG213, QIDI MIFARE block,
  OpenPrintTag NFC-V/CBOR), sourced from the format specs / real-tag captures — *not* from our
  encoders. Store under `tests/fixtures/nfc/` and **share the same files with the TS suite** so the
  two codecs are cross-checked.
- **Techniques:** golden decode → assert every field; round-trip `encode∘decode`; Hypothesis
  property "random 144-byte input never raises anything except `ValueError`"; boundary tables for
  `is_valid_qidi_block` / `diameter_mm` / `_detect_tag_format`.
- **Lookups (`*_lookup.py`):** the *pure mapping* half (`map_spool_to_tigertag`, `map_spool_to_qidi`)
  is unit-tested with hand-built spool objects; the *DB match/bind* half is **integration** (real DB)
  asserting the resulting rows and the review-fixed invariants — heuristic match must **not**
  auto-bind, case-insensitive color match works on Postgres, duplicate bind is rejected.
- **Refuse:** don't assert against bytes your own `encode_*` emitted; don't mock `cbor2`.

### Extra-field filter/sort, 3DFP, weight-delta, calibration (rows 32–58c)

- **Filter/sort oracle:** seed a DB with rows whose values include the tricky literals (`50%`,
  `5.0`, empty, out-of-range) and assert the **returned entity set** — behavior, portable across all
  4 dialects. Keep exactly one per-dialect **SQL snapshot** of `_JsonArrayElement` as a targeted
  guard for the CockroachDB `json_extract` regression (a legitimate low-level canary, clearly
  labelled as supplementary).
- **3DFP oracle:** **real captured HTML fixtures** + hand-verified expected extraction; separate
  cases for non-numeric id → 400 and missing brand → 404. First extract the parser into a pure
  `parse_3dfp_html(html) -> dict` (see §5) so it's unit-testable with no network; test the endpoint
  wiring once via `respx`.
- **weight-delta oracle:** the clamped applied-delta contract `max(0, before+w) - before` verified
  through the `/use` endpoint and the WS `payload_extras.weight_delta`, plus a **concurrency**
  integration test (two racing `/use` calls lose no weight) — that behavior is the whole point of
  `use_weight_safe` and can't be seen from a single call.
- **Registry validation:** table-driven unit tests over all 8 field types incl. the untested
  `integer_range`/`float_range`/`datetime` branches and the immutability invariants.

### Home dashboard analytics (rows 59–74)

- **Prerequisite refactor (§5):** extract the inline reducers/helpers from `home/index.tsx` into an
  exported pure `home/analytics.ts` — otherwise they can't be tested without rendering, which forces
  implementation-coupled component tests.
- **Oracle:** a small fixed `ISpool[]` fixture with **hand-computed** expected KPIs, plus
  **invariants** (Σ material weights = total; Σ breakdown counts = spool count; low-stock ⊂ all).
  Explicitly exercise the nullable-field fallback matrix that already caused a bug.
- **Component layer:** RTL tests for the *branch selection* only (loading / error / empty-hero /
  dashboard) — assert what the user sees (error vs onboarding must not collide), not internal state.

### Label printing / QR (rows 75–87)

- **Star test — cross-component round-trip:** feed the payload built by
  `filamentQrCodePrintingDialog` straight into the `qrCodeScanner` regex and assert it resolves back
  to the original id. Encoder and scanner are independent code paths, so this is a real oracle, and
  it locks the two halves together forever.
- **Template engine:** `renderLabelContents` tested with `GenericObject` inputs and expected strings
  (nested `vendor.name`, `extra.*` JSON, conditional `{...}` omission when a tag is missing).
- **Backend search:** `_build_search_filters` unit-tested on the returned condition set (quoted vs
  fuzzy, numeric-id branch, empty-term skip), then one integration test that the `/filament?search=`
  endpoint returns the right rows and never 500s on garbage.

### Client/PWA fixes & dependency migrations (rows 88–102)

- **Every fix becomes a regression test framed by the original bug.** `useSavedState`: pre-seed
  `localStorage` with the literal `"undefined"` and assert the next mount returns the default and
  heals the key (asserting *state*, not which storage method ran). `getBasePath`/SW/manifest: pure
  URL-derivation tests (`""` vs `/spoolman` → correct absolute `sw.js`/`start_url`/`scope`), plus a
  build-artifact assertion that `dist/sw.js` has no `NavigationRoute`.
- **Migrations:** hishel 1.x — integration test that a second `_download_file` is served from the
  SQLite cache and that an unwritable cache dir falls back to `:memory:`; Starlette `FileResponse` —
  integration test that a static asset returns 200 (the bug was a 500 on every asset) and 304 still
  works. These are the behaviors the migrations changed; assert them, not the library internals.
- **e2e (Playwright):** the SW precache-navigation fix (#93) and manifest base-path (#95) genuinely
  need a browser — a hard navigation to `/spool/print` under a base path boots with no 4xx/5xx.

### Release tooling (row 103)

- Extract a pure `calver(now: datetime, current_version: str | None) -> str` core; oracle is a
  hand-written table of `(date, current) → expected` including month rollover, year rollover, and
  no/unparseable current version. The file-I/O wrapper stays a thin, separately-smoke-tested shell.

---

## 3. Phased rollout

Ordered by **risk × cheapness**: pure logic first (highest bug-density, lowest cost, no infra
coupling), then integration, then UI behavior, then browser/e2e and the quality gates.

| Phase | Scope | Rows | Exit criteria |
|---|---|---|---|
| **0 — Enablement** | Stand up Vitest+RTL+MSW and the pytest fixtures/Hypothesis/time-machine/respx deps; add coverage config + CI jobs; land **one exemplar test per stack** (a codec golden-vector test, a `useSavedState` behavioral test, a `home/analytics` invariant test) as the reference pattern | infra | Both suites run green in CI; coverage reports publish |
| **1 — Pure logic (High)** | NFC codecs + `_detect_tag_format` + pure lookup mappings + `env`; 3DFP parser (post-extract); `_escape_like`/`_build_search_filters`; dashboard `analytics.ts` + spoolCard helpers; `useSavedState`, `getBasePath`, `parseStringSettingValue`, `renderLabelContents`, QR round-trip, TS codec, client filtering/dataProvider; `bump.calver` | 1–13, 18–20, 26, 29, 32, 43, 52–58b, 59–70, 75–79, 91, 103 | Every listed unit has golden/invariant/round-trip tests incl. error paths; 100% branch cov on these modules |
| **2 — Integration (DB + HTTP)** | NFC `/lookup` `/bind` `/encode` `/create-from-tag` + lookup/bind DB invariants; filament `/search`; extra-field filter/sort behavior on all 3 endpoints + malformed→400; `use_weight_safe` (+ concurrency) & delete durability; calibration gaps; hishel cache + fallback; `FileResponse` asset 200/304; manifest serving; extra-field create/update refactor | 14–17, 21–25, 27, 30–31, 34–42, 44–51, 80, 86, 94–100 | Endpoints assert response + DB state + review-fixed invariants; runs across the 4-DB matrix |
| **3 — Component / behavioral UI** | Dashboard render-state branches; locationContainer immutability + validation; settings routing; header breakpoint; print dialog immutability/preview; filament print href/param parsing; `useGetFilamentsByIds`; `authReloadHandler`; `queryExternalDB`; i18n `<Trans>`; SW registration guard | 71–74, 81–85, 55, 58c, 92, 101 | RTL tests assert user-visible outcomes via MSW; no `toHaveBeenCalled` on internals |
| **4 — Browser e2e + gates** | Playwright: SW precache-navigation (#93) and manifest base-path (#95) under a sub-path; `npm audit` guard (#102); cbor2 5.x matrix (#30) & armv7 lazy-import smoke (#31); turn on coverage thresholds + **mutation testing** on crown-jewel modules | 93, 95, 102, 30, 31 + gates | e2e green; coverage gate enforced; mutation score ≥ floor |

---

## 4. Definition of "complete coverage"

Coverage is a **floor, not the goal** — 100% line coverage with weak assertions proves nothing.
"Complete" means all four hold:

1. **Every row** in `TESTING_CANDIDATES.md` has ≥1 test asserting its **contract** *and* ≥1 test for
   an **error/edge path** (malformed input, empty, boundary, missing field).
2. **Branch coverage** thresholds enforced in CI: **100%** on pure codec/parser/analytics/filter
   modules; **≥90%** on lookup/endpoint glue; the thin hardware-I/O paths in `nfc_service.py` that
   need a physical reader are `# pragma: no cover`-excluded and replaced by **fake-tag** unit tests +
   one smoke test.
3. **Mutation score** ≥ an agreed floor (start 80%) on the crown-jewel modules — the codecs,
   `_build_search_filters`, `extra_field_query`, and `home/analytics.ts`. Mutation testing
   (`mutmut`/`cosmic-ray` for Python, **Stryker** for TS) is how we *prove* the tests catch injected
   bugs rather than just executing lines. This is the direct antidote to "testing the implementation."
4. **Refactor-resilience spot check:** rename an internal helper / reorder a computation in a covered
   module and confirm the suite still passes. If a test breaks on a behavior-preserving change, it's
   coupled to the implementation and gets rewritten against the contract.

---

## 5. Refactoring prerequisites (add seams, don't reach in)

Minimal, behavior-preserving extractions so units can be tested through a public contract:

- **`home/index.tsx` → `home/analytics.ts`**: export the reducers/helpers (`totalRemainingWeight`,
  `lowStockSpools`, `materialBreakdown`, `getWeightPct`, …) as pure functions over `ISpool[]`.
- **`bump.py`**: split the pure `calver(now, current_version) -> str` from the file-I/O `bump()`.
- **`externaldb.py` 3DFP**: extract `parse_3dfp_html(html) -> ProfileData` from the endpoint so the
  regex/unit-conversion logic is testable without a network round-trip.
- **`client.py` manifest**: extract `tweak_manifest(base: str, manifest: dict) -> dict` (pure) from
  the file-serving `load_and_tweak_manifest_file`, so base-path rewriting and JSON-injection safety
  are unit-testable.

The codecs, `_build_search_filters`, `env` helpers, and `parseStringSettingValue` are already pure —
no refactor needed, only fixtures.

---

## 6. Tooling summary (what to add)

- **Backend:** `hypothesis`, `time-machine`, `respx`, `@vitest`… (n/a) — plus `--cov-branch` and a
  mutation runner (`mutmut`).
- **Frontend:** `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/{react,user-event,jest-dom}`,
  `msw`, and `@stryker-mutator/*` for the crown-jewel TS modules.
- **CI:** fast unit jobs (py + ts) gated on coverage; integration matrix unchanged; optional
  Playwright e2e job; scheduled (not per-PR) mutation-testing job to keep PRs fast.

---

## 7. First concrete steps (Phase 0)

1. Add the frontend test toolchain + `vite.config.ts` test block + `src/test/setup.ts`; land
   `saveload.test.ts` as the reference behavioral test (pre-seed poisoned storage → assert healed).
2. Add the backend deps + `tests/conftest.py` fixture loaders; capture the first golden tag vectors
   into `tests/fixtures/nfc/`; land `test_tigertag_codec.py` (golden decode + round-trip + one
   Hypothesis property) as the reference.
3. Extract `home/analytics.ts` and land `analytics.test.ts` (hand-computed KPI + one invariant).
4. Wire the two CI jobs and publish coverage. These three exemplars set the pattern every later
   phase copies.

---

## 8. Implementation status

**Done (Phase 0 + Phase 1 pure-logic + gate wiring):**

- **Infra, both stacks.** Backend: `hypothesis`, `time-machine`, `respx`, `cbor2` dev deps + NFC
  fixtures. Frontend: Vitest 4 + jsdom + Testing Library + MSW, `vitest.config.ts`, `src/test/setup.ts`,
  `npm test`/`test:coverage` scripts.
- **~407 behavioral tests, all green:** backend `tests/` (TigerTag/QIDI/OpenPrintTag codecs, env,
  extra-field registry, `_build_search_filters`, externaldb config, CalVer, 3DFP parser); frontend
  (dashboard `analytics`, `saveload`, `url`, `scan` round-trip, `tigertagCodec` cross-impl,
  `querySettings`, `filtering`, `parsing`, `spoolCardHelpers`).
- **Seams extracted** (behavior-preserving): `home/analytics.ts`, `bump.calver`,
  `externaldb.parse_3dfp_html`, `scan.ts` (`buildScanPayload`/`parseScanResult`), `spoolCardHelpers.ts`.
- **Gates wired:** backend `unit-tests` job now uses `--cov-branch`; new `client-tests` CI job runs
  `npm run test:coverage`; Vitest per-module coverage thresholds enforced on the tested pure modules;
  mutation testing configured (`[tool.mutmut]`, `client/stryker.config.json`) and run by a dedicated
  manual/weekly `mutation.yml` workflow (kept off the per-PR path).

**Bugs surfaced by the tests (behavior pinned, source unchanged — flagged for a deliberate fix):**
`OpenPrintTagData.effective_instance_uuid`/`effective_brand_uuid` pass `bytes` to `uuid.uuid5` and
raise `TypeError` when a UID/brand is present; the low-stock **sort** comparator in `analytics.ts`
uses a different weight fallback than the **filter** (dead defensive branches).

**Also done — Phase 1 tail + first Phase 2 integration:**

- Phase 1 tail: `_detect_tag_format`, pure `map_spool_to_tigertag`/`map_spool_to_qidi` +
  `_make_nfc_tag_id`, extracted+tested `client.py` `tweak_manifest`, `renderLabelContents`
  (rendered-DOM), `inputNumberRange` parsers, and a shared `serializeFilterValues`
  (`dataProvider` custom-field query build).
- **In-process integration harness** (`tests/integration/`): FastAPI routers over a temp
  SQLite DB via httpx ASGI transport — no Docker, runs in the fast unit job, complements the
  Docker multi-DB suite. Covers: filament `/search`, NFC `/encode`→`/lookup` round-trip and
  `/bind` duplicate-rejection, spool `/use` consumption + refill-clamp (`use_weight_safe`),
  and extra-field filtering incl. the `_escape_like` literal-`%`/`_` regression.

**Also done — Phase 2 tail + first Phase 3 (post-merge follow-up):**

- Phase 2 tail: extra-field **sort** (asc/desc, unknown-key ignored, malformed→400) and
  `use_weight_safe` **true concurrency** (8 racing `/use` calls, no lost updates). Starlette
  `FileResponse` asset serving + manifest rewrite landed in the initial PR.
- Phase 3 (component): a boundary-mock harness for refine components — Home **render-state
  branches** (loading / error / empty-onboarding / dashboard, incl. the error-vs-empty fix) and
  the **`authReloadHandler`** 401 auto-reload (idempotent-only, cooldown, SW unregister).

**Also done — Phase 2 tail complete:**

- Extra-field numeric-**range** filtering (integer `min:max` / `min:` / `:max`, invalid→400) and
  **boolean** field filtering (true/false) through the API.
- **hishel download cache**: `_download_file` fetches once and serves a repeat cacheable request
  from the shared storage without hitting the network (respx-verified), and HTTP errors propagate.

**Also done — Phase 4 mutation baseline (Stryker) established as a hard gate:**

Ran Stryker on the crown-jewel client modules (`stryker.config.json`; `npm run mutation`).
Baseline mutation score **87.5%** overall:

| Module | Score |
|---|---|
| `spoolCardHelpers.ts` | 100% |
| `scan.ts` | 98% (was 81% — mutation testing surfaced untested URL-regex edges: http vs https, multi-digit id, leading/trailing anchors) |
| `analytics.ts` | 88% |
| `tigertagCodec.ts` | 82% (was 74% — added truncated-buffer decode + `isTigerTag(false)` cases) |

The break threshold is raised to **80** and the scheduled `mutation.yml` job now enforces it
(no `|| true`), so a drop below 80% fails the run. This is the direct proof the suite catches
injected bugs, not just executes lines.

**Remaining (follow-up):**

- Phase 3 (component): print-dialog default-resolution, i18n `<Trans>` rendering (both need
  rendering provider-heavy components; the print-dialog updates are plain immutable spreads now).
- Phase 4: Playwright e2e for the SW/manifest flows; raise the per-module mutation scores on
  `analytics.ts`/`tigertagCodec.ts` toward the 90% "high" threshold; baseline `mutmut` for the
  Python crown-jewel modules the same way.
