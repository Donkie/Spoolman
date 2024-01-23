"""Integration tests for the Vendor API endpoint."""

import httpx

from .conftest import URL, DbType, get_db_type


def test_backup():
    """Test triggering an automatic database backup."""
    if get_db_type() != DbType.SQLITE:
        return

    # Trigger backup
    result = httpx.post(f"{URL}/api/v1/backup")
    result.raise_for_status()
