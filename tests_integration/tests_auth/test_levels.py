"""Integration tests: permission levels.

Phase 1 ships no way to create a second account through the API -- there is no user
management endpoint, and the tester container has no access to a command line tool -- so
a read-level or edit-level *user* cannot be made from here. What can be exercised is
therefore split in two:

* The owner, at the manage level, reaches routes at all three levels. That proves the
  ordering read < edit < manage admits from above.
* A read-level principal is refused edit and manage routes. The anonymous reader is one,
  so test_anonymous_read.py covers the refusing half of the ordering.

When user management arrives, the natural home for a genuine read-user-versus-manage-route
test is this file.
"""

import httpx
import pytest

from .conftest import (
    OWNER_USERNAME_STORED,
    assert_code,
)


def test_owner_is_manage_level(owner: httpx.Client) -> None:
    """The account that claimed the instance holds every right."""
    result = owner.get("/auth/session")
    assert_code(result, 200)
    info = result.json()
    assert info["authenticated"] is True
    assert info["anonymous"] is False
    assert info["level"] == "manage"
    assert info["is_admin"] is True
    assert info["is_owner"] is True
    assert info["user"]["username"] == OWNER_USERNAME_STORED


def test_owner_can_read(owner: httpx.Client) -> None:
    """Read-level routes admit a manage-level caller."""
    for path in ("/info", "/spool", "/filament", "/vendor", "/setting/", "/material", "/location"):
        assert_code(owner.get(path), 200)


def test_owner_can_edit(owner: httpx.Client) -> None:
    """Edit-level routes: PATCH on a resource, and the use endpoint."""
    vendor = owner.post("/vendor", json={"name": "Level test vendor"})
    assert_code(vendor, 200)
    vendor_id = vendor.json()["id"]

    filament = owner.post(
        "/filament",
        json={
            "name": "Level test filament",
            "vendor_id": vendor_id,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
        },
    )
    assert_code(filament, 200)
    filament_id = filament.json()["id"]

    spool = owner.post("/spool", json={"filament_id": filament_id, "remaining_weight": 500})
    assert_code(spool, 200)
    spool_id = spool.json()["id"]

    try:
        assert_code(owner.patch(f"/vendor/{vendor_id}", json={"comment": "edited"}), 200)
        assert_code(owner.patch(f"/filament/{filament_id}", json={"comment": "edited"}), 200)
        assert_code(owner.patch(f"/spool/{spool_id}", json={"comment": "edited"}), 200)

        # used_weight is the spool's running total, not the amount of this one call.
        # Creating the spool with remaining_weight=500 against a 1000 g filament already
        # counts 500 g as used, so assert the delta rather than the absolute value.
        before = owner.get(f"/spool/{spool_id}")
        assert_code(before, 200)
        used_before = before.json()["used_weight"]

        used = owner.put(f"/spool/{spool_id}/use", json={"use_weight": 10})
        assert_code(used, 200)
        assert used.json()["used_weight"] == pytest.approx(used_before + 10)
    finally:
        assert_code(owner.delete(f"/spool/{spool_id}"), 200)
        assert_code(owner.delete(f"/filament/{filament_id}"), 200)
        assert_code(owner.delete(f"/vendor/{vendor_id}"), 200)


def test_owner_can_manage(owner: httpx.Client) -> None:
    """Manage-level routes: create, delete, settings, and the bulk exports."""
    vendor = owner.post("/vendor", json={"name": "Manage test vendor"})
    assert_code(vendor, 200)
    vendor_id = vendor.json()["id"]
    assert_code(owner.delete(f"/vendor/{vendor_id}"), 200)

    # Settings are read at read level but written at manage level.
    assert_code(owner.post("/setting/currency", json='"SEK"'), 200)
    assert_code(owner.post("/setting/currency", json=""), 200)

    # The exports hand over the whole database in one response, which is why they sit at
    # manage rather than read.
    for path in ("/export/spools", "/export/filaments", "/export/vendors"):
        assert_code(owner.get(path, params={"fmt": "json"}), 200)


def test_owner_can_change_own_password_endpoint_level(owner: httpx.Client) -> None:
    """POST /auth/password needs a real user, and the owner is one.

    Sending a wrong current password proves the gate was passed: the 400 comes from the
    endpoint's own check, not from a permission error.
    """
    result = owner.post(
        "/auth/password",
        json={"current_password": "not-the-current-password", "new_password": "a-brand-new-password"},
    )
    assert_code(result, 400)
