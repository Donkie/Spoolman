Running tests
=============

Quick guide to run unit and integration tests locally.

1. Create and activate a virtualenv

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Upgrade pip and install dev/test dependencies

```bash
python -m pip install -U pip setuptools wheel
# Preferred: install dev extras (editable install)
python -m pip install -e '.[dev]'
# If editable install fails due to flat-layout, install the dev packages directly:
# python -m pip install pytest pytest-asyncio pytest-cov pytest-httpx pytest-mock httpx anyio starlette
```

3. Run unit tests (no running server needed)

```bash
PYTHONPATH=. .venv/bin/pytest -q tests -k "not tests_integration"
```

4. Run all tests (includes integration if you have test services running)

```bash
PYTHONPATH=. .venv/bin/pytest -q
```

5. Run integration tests (requires Docker and a database backend)

```bash
poe itest
# Or see tests_integration/README.md and run tests_integration/run.py directly.
```

Notes
-----

- Unit tests are hermetic by default and don't need a running Spoolman server.
- Integration tests require appropriate environment variables and services (DBs/containers) to be available. See `tests_integration/` for more details.
- If you encounter import-time errors for optional dependencies (e.g., `hishel`), install the missing package(s) or the dev extras above.
