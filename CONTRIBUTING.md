# Contributing to Spoolman NG

Thanks for helping keep Spoolman alive! Spoolman NG is a community-maintained
continuation of the original [Spoolman](https://github.com/Donkie/Spoolman) by
Donkie, which is no longer actively maintained. Bug reports, features, filament
data, and translations that used to go upstream should come here now.

## Development setup

The backend is Python (FastAPI, managed with [uv](https://docs.astral.sh/uv/)),
the web client is React/TypeScript in `client/` (Vite, npm).

```bash
# Backend
uv sync                       # install Python deps (add --extra nfc for NFC support)
uv run poe run                # start the API on :8000

# Client
cd client
npm ci
npm run dev                   # dev server, proxies to the backend
```

Install the git hooks once — they run the same lint/format checks as CI:

```bash
uv run lefthook install
```

## Tests

This project holds a high testing bar: changes are expected to come with
behavioral tests, and mutation-score gates guard the critical modules. See
[`TESTING_STRATEGY.md`](TESTING_STRATEGY.md) for the philosophy (test observable
contracts, not implementation) and where each kind of test lives.

```bash
uv run pytest tests/          # backend unit tests (fast, no DB)
uv run poe itest              # backend integration tests (all supported DBs, needs Docker)
cd client && npm test         # client unit/component tests (Vitest)
cd client && npm run test:e2e # browser e2e (Playwright)
```

CI runs all of the above plus lint (`ruff`, `eslint`, `prettier`, `tsc`),
CodeQL, hadolint, multi-arch Docker builds, and a weekly mutation-testing run
(Stryker enforces a ≥90% mutation score on crown-jewel client modules).

## Pull requests

- Target `master`. Keep PRs focused; describe the user-visible behavior change.
- If you add or change UI strings, add them to
  `client/public/locales/en/common.json`. Other locales may lag behind English —
  that's expected until a fork translation project is set up (see below).
- New endpoints stay under `/api/v1` and must remain drop-in compatible with
  upstream Spoolman — integrations (Moonraker, OctoPrint, Home Assistant)
  depend on that contract.
- Database schema changes need an Alembic migration in `migrations/versions/`
  (linear history — set `down_revision` to the current head).

## Translations

The upstream Weblate project feeds the original repository, not this fork.
Until a Spoolman NG translation project exists, contribute translations
directly: edit `client/public/locales/<lang>/common.json`, using
`en/common.json` as the reference for keys, and open a PR.
`npm run check-i18n` (run in CI) reports per-locale key coverage.

## Filament database

The catalog of manufacturers and filaments lives in
[SpoolmanDB](https://github.com/sherrmann/SpoolmanDB) — the fork-maintained
continuation of the original database. Contribute new filaments and
manufacturers there; Spoolman NG installs sync from it by default (see
`EXTERNAL_DB_URL` in `.env.example` to point at another instance).

## Security issues

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
