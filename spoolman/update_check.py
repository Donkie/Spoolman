"""Periodically check GitHub for a newer Spoolman release."""

import datetime
import logging

import httpx
from scheduler.asyncio.scheduler import Scheduler

from spoolman import env

logger = logging.getLogger(__name__)

LATEST_RELEASE_URL = "https://api.github.com/repos/Donkie/Spoolman/releases/latest"
CHECK_INTERVAL = datetime.timedelta(hours=12)

# Latest released version seen on GitHub, None until a check has succeeded.
latest_version: str | None = None


def _parse_version(version: str) -> tuple[int, ...] | None:
    """Parse "v1.2.3" or "1.2.3" into (1, 2, 3). Returns None for anything non-numeric."""
    try:
        return tuple(int(part) for part in version.strip().removeprefix("v").split("."))
    except ValueError:
        return None


def is_newer(candidate: str, current: str) -> bool:
    """Return True if candidate is a strictly newer version than current."""
    cand, cur = _parse_version(candidate), _parse_version(current)
    return cand is not None and cur is not None and cand > cur


def is_update_available() -> bool:
    """Return True if a newer release than the running version has been seen."""
    return latest_version is not None and is_newer(latest_version, env.get_version())


async def _check() -> None:
    global latest_version  # noqa: PLW0603
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(LATEST_RELEASE_URL, headers={"Accept": "application/vnd.github+json"})
            response.raise_for_status()
            version = str(response.json()["tag_name"]).removeprefix("v")
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.info("Could not check for Spoolman updates: %s", exc)
        return

    if version == latest_version:
        return
    latest_version = version
    if is_update_available():
        logger.warning(
            "A new version of Spoolman is available: v%s (running v%s). https://github.com/Donkie/Spoolman/releases",
            version,
            env.get_version(),
        )


def schedule_tasks(scheduler: Scheduler) -> None:
    """Schedule the update check: once in the background at startup, then periodically."""
    if not env.is_update_check_enabled():
        logger.info("Update check disabled.")
        return
    scheduler.once(datetime.timedelta(seconds=0), _check)  # type: ignore[arg-type]
    scheduler.cyclic(CHECK_INTERVAL, _check)  # type: ignore[arg-type]
