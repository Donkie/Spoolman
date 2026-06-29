"""Integration tests for the export endpoint."""

from typing import Any

import httpx

from .conftest import URL


def test_export_spools_includes_archived_by_default(random_filament: dict[str, Any]):
    """Archived spools must be included in the export by default.

    The allow_archived query parameter defaults to True so that a backup/export captures everything;
    callers can opt out with allow_archived=false.
    """
    spool = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]}).json()
    spool_id = spool["id"]
    httpx.patch(f"{URL}/api/v1/spool/{spool_id}", json={"archived": True}).raise_for_status()
    try:
        # Default export includes the archived spool.
        result = httpx.get(f"{URL}/api/v1/export/spools", params={"fmt": "json"})
        result.raise_for_status()
        assert spool_id in {item["id"] for item in result.json()}

        # Explicit opt-out excludes it.
        result = httpx.get(f"{URL}/api/v1/export/spools", params={"fmt": "json", "allow_archived": "false"})
        result.raise_for_status()
        assert spool_id not in {item["id"] for item in result.json()}
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()
