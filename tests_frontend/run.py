"""Build and run the Playwright frontend integration tests.

Spins up Spoolman from the production image (client baked in) backed by a real
PostgreSQL database, waits for it to become healthy, then drives the frontend
through a browser with Playwright. Mirrors tests_integration/run.py, including
the SPOOLMAN_CONTAINER_ENGINE switch for running under rootless Podman.
"""

# ruff: noqa: T201, INP001

import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# Container engine to use. Defaults to "docker"; set SPOOLMAN_CONTAINER_ENGINE=podman
# to run the suite with rootless Podman (both expose a compatible build/compose CLI).
ENGINE = os.environ.get("SPOOLMAN_CONTAINER_ENGINE", "docker")

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "tests_frontend"
COMPOSE_FILE = FRONTEND_DIR / "docker-compose.yml"

HOST_PORT = os.environ.get("SPOOLMAN_HOST_PORT", "8000")
BASE_URL = f"http://localhost:{HOST_PORT}"
HEALTH_URL = f"{BASE_URL}/api/v1/health"
HEALTH_TIMEOUT = 120


def run(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> int:
    """Run a command, echoing it, and return its exit code."""
    print(f"$ {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd, cwd=cwd, env=env)


def die(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def build_client() -> None:
    """Build the production client bundle the image bakes in.

    Mirrors the CI ``build-client`` job exactly: a dev ``client/dist`` is built
    with a different (or missing) ``VITE_APIURL`` and would render the "Missing
    API URL" screen, so we always produce a fresh deployment build where the
    client talks to the API on the same origin.
    """
    client_dir = REPO_ROOT / "client"
    print("Building the production client bundle (VITE_APIURL=/api/v1)...")
    # A stray .env would override .env.production, so remove it like CI does.
    (client_dir / ".env").unlink(missing_ok=True)
    (client_dir / ".env.production").write_text("VITE_APIURL=/api/v1\n")
    if not (client_dir / "node_modules").exists() and run(["npm", "ci"], cwd=client_dir) != 0:
        die("Failed to install client dependencies!")
    if run(["npm", "run", "build"], cwd=client_dir) != 0:
        die("Failed to build the client!")


def wait_for_health() -> None:
    print(f"Waiting for Spoolman to become healthy at {HEALTH_URL} ...")
    deadline = time.monotonic() + HEALTH_TIMEOUT
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=5) as resp:  # noqa: S310
                if resp.status == 200:
                    print("Spoolman is up.")
                    return
        except Exception:  # noqa: BLE001, S110 - server not ready yet, keep polling
            pass
        time.sleep(2)
    die(f"Spoolman did not become healthy within {HEALTH_TIMEOUT}s.")


def compose(*args: str) -> int:
    return run([ENGINE, "compose", "-f", str(COMPOSE_FILE), *args])


def main() -> None:
    print(f"Building and running frontend integration tests (engine: {ENGINE})...")

    build_client()

    print("Building Spoolman image...")
    if run([ENGINE, "build", "-t", "donkie/spoolman:test", "."], cwd=REPO_ROOT) != 0:
        die("Failed to build Spoolman!")

    print("Installing Playwright and its browser...")
    if run(["npm", "ci"], cwd=FRONTEND_DIR) != 0:
        die("Failed to install Playwright dependencies!")
    # No --with-deps here: it shells out to the system package manager (sudo/apt)
    # and only works on Debian-based hosts. Dev machines that can run a browser
    # already have the libraries; CI installs the OS deps in its own step.
    if run(["npx", "playwright", "install", "chromium"], cwd=FRONTEND_DIR) != 0:
        die("Failed to install the Playwright browser!")

    # Clean slate, then bring the stack up.
    compose("down", "-v")
    if compose("up", "-d") != 0:
        compose("logs")
        compose("down", "-v")
        die("Failed to start the Spoolman stack!")

    exit_code = 1
    try:
        wait_for_health()
        env = {**os.environ, "SPOOLMAN_BASE_URL": BASE_URL}
        exit_code = run(["npx", "playwright", "test"], cwd=FRONTEND_DIR, env=env)
    finally:
        if exit_code != 0:
            print("Tests failed; dumping Spoolman logs:")
            compose("logs", "spoolman")
        compose("down", "-v")

    if exit_code != 0:
        die("Frontend integration tests failed!")
    print("Frontend integration tests passed!")


if __name__ == "__main__":
    main()
