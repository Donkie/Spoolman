"""Integration tests for the backup endpoint."""

import httpx

from .conftest import URL, DbType, get_db_type


def test_backup():
    """Test triggering an automatic database backup."""
    if get_db_type() != DbType.SQLITE:
        return

    # Trigger backup
    result = httpx.post(f"{URL}/api/v1/backup")
    result.raise_for_status()


def test_repeated_backups_do_not_churn_the_history():
    """Rotation discards the oldest restore point, so repeated calls must not each rotate.

    The endpoint takes no parameters, so it used to be reachable by a bodyless cross-origin form
    post; enough of those left nothing in the backup folder but snapshots of the damage.
    """
    if get_db_type() != DbType.SQLITE:
        return

    results = []
    for _ in range(6):
        result = httpx.post(f"{URL}/api/v1/backup")
        result.raise_for_status()
        results.append(result.json())

    # Every call still answers with a usable backup path.
    assert all(entry["path"] for entry in results)

    # But at most the first can have actually rotated: the database does not change in between,
    # and the rate limit covers the case where something else changes it concurrently.
    assert sum(entry["created"] for entry in results) <= 1
