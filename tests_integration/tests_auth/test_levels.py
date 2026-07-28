"""Integration tests: permission levels.

Phase 1 could only assert the ordering from above -- the owner, at manage, reaching
routes at all three levels -- because there was no way to create a second account
through the API, and the anonymous reader was the only low-level principal available.

Phase 2's POST /auth/user closes that. The `reader` fixture is a genuine read-level,
signed-in, non-anonymous user, which is what makes the refusing half of the ordering a
real test rather than an approximation: it distinguishes "refused for lack of level"
from "refused for being anonymous", which the two previous tests could not tell apart.
"""

import time

import httpx
import pytest

from .conftest import (
    OWNER_USERNAME_STORED,
    READER_PASSWORD,
    assert_code,
    create_user,
    login,
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


def test_read_user_is_refused_edit_and_manage(owner: httpx.Client, reader: httpx.Client) -> None:
    """A signed-in read-level user reaches read routes and nothing above them.

    Distinct from the anonymous-reader tests: this principal is authenticated, so a
    refusal here can only be about its level. An anonymous caller failing the same
    request proves less, because ``allow_anonymous`` could have been what stopped it.
    """
    session = reader.get("/auth/session")
    assert_code(session, 200)
    assert session.json()["authenticated"] is True
    assert session.json()["anonymous"] is False
    assert session.json()["level"] == "read"

    for path in ("/info", "/spool", "/filament", "/vendor", "/setting/"):
        assert_code(reader.get(path), 200)

    vendor = owner.post("/vendor", json={"name": "Read-level test vendor"})
    assert_code(vendor, 200)
    vendor_id = vendor.json()["id"]
    try:
        # edit
        assert_code(reader.patch(f"/vendor/{vendor_id}", json={"comment": "nope"}), 403)
        # manage
        assert_code(reader.post("/vendor", json={"name": "should not exist"}), 403)
        assert_code(reader.delete(f"/vendor/{vendor_id}"), 403)
        assert_code(reader.post("/setting/currency", json='"USD"'), 403)
        # The bulk exports sit at manage rather than read on purpose.
        assert_code(reader.get("/export/spools", params={"fmt": "json"}), 403)
    finally:
        assert_code(owner.delete(f"/vendor/{vendor_id}"), 200)


def test_edit_user_can_edit_but_not_create_or_delete(owner: httpx.Client) -> None:
    """The middle of the ordering, which nothing could exercise before.

    PUT /spool/{id}/use sits at edit rather than manage deliberately: it is Moonraker's
    and OctoPrint's hot path, so a printer can be given a credential that tracks filament
    usage without being able to delete anything. That distinction is only testable with a
    real edit-level account.
    """
    username = f"editor-{int(time.time() * 1000)}"
    create_user(owner, username, level="edit", password=READER_PASSWORD)
    client, response = login(username=username, password=READER_PASSWORD)
    assert_code(response, 200)

    vendor = owner.post("/vendor", json={"name": "Edit-level test vendor"})
    assert_code(vendor, 200)
    vendor_id = vendor.json()["id"]
    filament = owner.post(
        "/filament",
        json={"name": "Edit-level filament", "vendor_id": vendor_id, "density": 1.24, "diameter": 1.75, "weight": 1000},
    )
    assert_code(filament, 200)
    filament_id = filament.json()["id"]
    spool = owner.post("/spool", json={"filament_id": filament_id, "remaining_weight": 500})
    assert_code(spool, 200)
    spool_id = spool.json()["id"]

    try:
        assert_code(client.patch(f"/vendor/{vendor_id}", json={"comment": "edited by editor"}), 200)
        assert_code(client.put(f"/spool/{spool_id}/use", json={"use_weight": 5}), 200)

        assert_code(client.post("/vendor", json={"name": "should not exist"}), 403)
        assert_code(client.delete(f"/spool/{spool_id}"), 403)
    finally:
        client.close()
        assert_code(owner.delete(f"/spool/{spool_id}"), 200)
        assert_code(owner.delete(f"/filament/{filament_id}"), 200)
        assert_code(owner.delete(f"/vendor/{vendor_id}"), 200)
