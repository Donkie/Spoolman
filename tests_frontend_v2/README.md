# Frontend integration tests (client_v2)

Browser-driven, end-to-end tests for the **Svelte client** (`client_v2`), run
against Spoolman **as it is deployed for real**: the production Docker image
(with the client bundle baked in and served on the same origin as the API)
backed by a real PostgreSQL database.

This is the sibling of [`../tests_frontend`](../tests_frontend), which drives the
same deployment with `SPOOLMAN_LEGACY_CLIENT=TRUE` to cover the legacy React
client. Both complement the backend HTTP suite in
[`../tests_integration`](../tests_integration), which never touches the UI.

## What is covered

- **`tests/smoke.spec.ts`** — starting from the app root, clicks through every
  top-bar tab (dashboard, labels, settings, back to the library) and confirms
  each page renders inside the app shell with no browser-console errors. A
  second test confirms the library actually reaches the API rather than falling
  into its "couldn't reach the backend" state.
- **`tests/crud.spec.ts`** — the core happy path in one session. client_v2 folds
  what the legacy client spread over three create forms into a single "Add
  spools" modal, so one submit creates a manufacturer, a filament and a spool.
  The result is verified back in the library list (group header, spool row,
  remaining weight) and on the dashboard, which groups spools by location.
- **`tests/legacy-sw.spec.ts`** — the upgrade path off the legacy client's
  service worker. Everyone who ever opened the old React client has a worker
  registered at the deploy root whose precache serves the old app shell for all
  navigations, so unless something answers its update check for `/sw.js` the
  upgrade is invisible to them. The test stands in a worker that behaves like
  the old one, proves it does keep serving the old shell, then swaps the real
  `/sw.js` back in and asserts the new UI returns on its own with the
  registration and every cache gone. The fix it covers is
  `client_v2/static/sw.js`.

The tests navigate purely through the UI — the top bar to reach each page, the
"Add spools" button to reach the create modal. Only the initial "open the app"
step uses a direct URL. The app's language is forced to English (see
`tests/fixtures.ts`) so the label and button matchers are stable regardless of
the runner's browser locale.

## Running locally

From the repository root:

```bash
uv run poe itest-frontend-v2
```

This builds both client bundles (the image bakes in `client_v2/build` and, for
the `SPOOLMAN_LEGACY_CLIENT` fallback, `client/dist`), builds the
`donkie/spoolman:test` image, brings up the stack with Docker Compose, waits for
it to become healthy, and runs Playwright. It tears the stack down afterwards.

Useful environment variables:

- `SPOOLMAN_CONTAINER_ENGINE=podman` — run with rootless Podman instead of Docker.
- `SPOOLMAN_HOST_PORT=9000` — publish Spoolman on a different host port
  (default `8001`, one above the legacy suite's `8000` so both stacks can be up
  at the same time).

### Running the tests against an already-running instance

If you already have Spoolman running somewhere, you can skip the orchestration
and point Playwright straight at it:

```bash
cd tests_frontend_v2
npm ci
npx playwright install --with-deps chromium
SPOOLMAN_BASE_URL=http://localhost:8000 npx playwright test
```

The tests create data with unique, non-ASCII-tagged names, so they are safe to
run repeatedly against a persistent instance (though a fresh database is what CI
uses).

## CI

The `test-frontend-v2` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
reuses the same `donkie/spoolman:test` image built for the backend integration
tests, so the frontend is verified against the exact artifact that ships.
On failure it uploads the Playwright HTML report as a build artifact.
