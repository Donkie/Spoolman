# Frontend integration tests

Browser-driven, end-to-end tests that run against Spoolman **as it is deployed
for real**: the production Docker image (with the client bundle baked in and
served on the same origin as the API) backed by a real PostgreSQL database.
They complement the backend HTTP suite in [`../tests_integration`](../tests_integration),
which never touches the UI.

## What is covered

- **`tests/smoke.spec.ts`** — starting from the app root, clicks through every
  entry in the sidebar (spools, filaments, vendors, locations, settings, help,
  home) and confirms each page renders inside the app shell with no
  browser-console errors.
- **`tests/crud.spec.ts`** — the core happy path in one session: create a
  manufacturer (vendor) → a filament under it → a spool of that filament,
  verifying each through its list page.

The tests navigate purely through the UI — the sidebar to reach each list and
the list's "Create" button to reach each form — using language-independent link
targets. Only the initial "open the app" step uses a direct URL. The app's
language is forced to English (see `tests/fixtures.ts`) so the label and button
matchers are stable regardless of the runner's browser locale.

## Running locally

From the repository root:

```bash
uv run poe itest-frontend
```

This builds the client (if `client/dist` is missing), builds the
`donkie/spoolman:test` image, brings up the stack with Docker Compose, waits for
it to become healthy, and runs Playwright. It tears the stack down afterwards.

Useful environment variables:

- `SPOOLMAN_CONTAINER_ENGINE=podman` — run with rootless Podman instead of Docker.
- `SPOOLMAN_HOST_PORT=9000` — publish Spoolman on a different host port (default `8000`).

### Running the tests against an already-running instance

If you already have Spoolman running somewhere, you can skip the orchestration
and point Playwright straight at it:

```bash
cd tests_frontend
npm ci
npx playwright install --with-deps chromium
SPOOLMAN_BASE_URL=http://localhost:8000 npx playwright test
```

The tests create data with unique, non-ASCII-tagged names, so they are safe to
run repeatedly against a persistent instance (though a fresh database is what CI
uses).

## CI

The `test-frontend` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
reuses the same `donkie/spoolman:test` image built for the backend integration
tests, so the frontend is verified against the exact artifact that ships.
On failure it uploads the Playwright HTML report as a build artifact.
