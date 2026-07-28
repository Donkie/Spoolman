"""Integration tests: API keys.

The properties worth defending, in order of how badly they fail if broken:

* A key never outranks the account it belongs to, checked on every request rather than
  frozen at creation. :func:`test_key_is_capped_by_owner_level` demotes a user and shows
  the key it already issued weakening in the same breath.
* A key cannot manage keys, so a leak cannot be made permanent by minting a replacement.
* A key carries no administrative rights, whoever owns it.
* A key skips CSRF, because it is not an ambient credential -- and a session does not,
  which is the half that proves the skip is targeted rather than a hole.
"""

import time

import httpx

from .conftest import (
    CSRF_HEADER,
    READER_PASSWORD,
    assert_code,
    create_user,
    login,
    new_client,
)

KEY_HEADER = "X-API-Key"


def _unique(prefix: str) -> str:
    """Build a name no other test in this run will collide with."""
    return f"{prefix}-{int(time.time() * 1000)}"


def _keyed_client(key: str) -> httpx.Client:
    """Return a client that authenticates with an API key and nothing else."""
    client = new_client()
    client.headers[KEY_HEADER] = key
    return client


def test_create_returns_the_secret_once(owner: httpx.Client) -> None:
    """The plaintext key is in the creation response and in no later one."""
    response = owner.post("/auth/apikey", json={"name": _unique("once"), "level": "read"})
    assert_code(response, 201)
    body = response.json()

    key = body["key"]
    assert key.startswith("spoolman_")
    assert body["info"]["prefix"] in key
    assert body["info"]["revoked"] is False
    assert body["info"]["expired"] is False

    listed = owner.get("/auth/apikey")
    assert_code(listed, 200)
    entry = next(item for item in listed.json() if item["id"] == body["info"]["id"])
    # The secret must not survive anywhere in the listing, under any field name.
    assert key not in str(entry)


def test_key_authenticates_by_header_and_bearer(owner: httpx.Client) -> None:
    """Both presentation forms are accepted, because clients differ."""
    created = owner.post("/auth/apikey", json={"name": _unique("forms"), "level": "read"})
    assert_code(created, 201)
    key = created.json()["key"]

    with _keyed_client(key) as client:
        assert_code(client.get("/spool"), 200)

    with new_client() as client:
        client.headers["Authorization"] = f"Bearer {key}"
        assert_code(client.get("/spool"), 200)


def test_unknown_key_is_rejected() -> None:
    """A well-formed but unknown key authenticates nobody."""
    with _keyed_client("spoolman_aaaaaaaaaaaa.not-a-real-secret") as client:
        assert_code(client.get("/spool"), 401)

    # Malformed enough that it never reaches a database lookup at all.
    with _keyed_client("not-a-key") as client:
        assert_code(client.get("/spool"), 401)


def test_key_skips_csrf_but_a_session_does_not(owner: httpx.Client) -> None:
    """The CSRF requirement applies to ambient credentials only.

    A key travels in a header that a cross-site page cannot set, so there is nothing for
    a second factor to defend against. A session cookie is attached by the browser
    without being asked, so it needs one. Both halves are asserted here: dropping the
    header must break the session and must not break the key.
    """
    created = owner.post("/auth/apikey", json={"name": _unique("csrf"), "level": "edit"})
    assert_code(created, 201)
    key = created.json()["key"]

    vendor = owner.post("/vendor", json={"name": _unique("csrf-vendor")})
    assert_code(vendor, 200)
    vendor_id = vendor.json()["id"]

    try:
        with _keyed_client(key) as client:
            # No CSRF header anywhere on this client, and the write still lands.
            assert_code(client.patch(f"/vendor/{vendor_id}", json={"comment": "by key"}), 200)

        stripped = owner.headers.pop(CSRF_HEADER)
        try:
            assert_code(owner.patch(f"/vendor/{vendor_id}", json={"comment": "by session"}), 403)
        finally:
            owner.headers[CSRF_HEADER] = stripped
    finally:
        assert_code(owner.delete(f"/vendor/{vendor_id}"), 200)


def test_key_cannot_exceed_its_level(owner: httpx.Client) -> None:
    """A read key is refused an edit route and a manage route."""
    created = owner.post("/auth/apikey", json={"name": _unique("readonly"), "level": "read"})
    assert_code(created, 201)
    key = created.json()["key"]

    with _keyed_client(key) as client:
        assert_code(client.get("/spool"), 200)
        assert_code(client.post("/vendor", json={"name": "should not exist"}), 403)


def test_key_cannot_manage_keys(owner: httpx.Client) -> None:
    """A key cannot mint, list or revoke keys, however senior its owner.

    Without this a leaked key is unrevocable in practice: whoever holds it issues
    themselves a fresh one before the original is withdrawn.
    """
    created = owner.post("/auth/apikey", json={"name": _unique("nomint"), "level": "manage"})
    assert_code(created, 201)
    key = created.json()["key"]
    key_id = created.json()["info"]["id"]

    with _keyed_client(key) as client:
        assert_code(client.get("/auth/apikey"), 403)
        assert_code(client.post("/auth/apikey", json={"name": "child", "level": "read"}), 403)
        assert_code(client.post(f"/auth/apikey/{key_id}/revoke"), 403)
        assert_code(client.delete(f"/auth/apikey/{key_id}"), 403)


def test_key_carries_no_admin_rights(owner: httpx.Client) -> None:
    """A manage-level key held by the owner still cannot administer users."""
    created = owner.post("/auth/apikey", json={"name": _unique("noadmin"), "level": "manage"})
    assert_code(created, 201)
    key = created.json()["key"]

    with _keyed_client(key) as client:
        assert_code(client.get("/auth/user"), 403)
        assert_code(client.get("/auth/audit"), 403)
        # Nor can it change the password of the account it belongs to.
        assert_code(
            client.post("/auth/password", json={"current_password": "x" * 10, "new_password": "y" * 12}),
            403,
        )


def test_cannot_issue_above_own_level(owner: httpx.Client) -> None:
    """A read-level user is refused when asking for an edit key.

    Refused rather than silently capped: a key quietly issued weaker than asked for is a
    support ticket six months later, when a script starts failing for no visible reason.
    """
    username = _unique("issuer")
    create_user(owner, username, level="read", password=READER_PASSWORD)
    client, response = login(username=username, password=READER_PASSWORD)
    assert_code(response, 200)
    try:
        refused = client.post("/auth/apikey", json={"name": _unique("too-strong"), "level": "manage"})
        assert_code(refused, 403)
        assert "above your own" in refused.json()["message"]

        allowed = client.post("/auth/apikey", json={"name": _unique("just-right"), "level": "read"})
        assert_code(allowed, 201)
    finally:
        client.close()


def test_key_is_capped_by_owner_level(owner: httpx.Client) -> None:
    """Demoting a user weakens the keys they already hold, immediately.

    This is the property that makes a key safe to hand out: it is not a frozen grant,
    it is a pointer at an account whose rights are re-read on every request.
    """
    username = _unique("demoted")
    user_id, password = create_user(owner, username, level="manage", password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    try:
        created = client.post("/auth/apikey", json={"name": _unique("capped"), "level": "manage"})
        assert_code(created, 201)
        key = created.json()["key"]
        key_id = created.json()["info"]["id"]
        assert created.json()["info"]["effective_level"] == "manage"

        with _keyed_client(key) as keyed:
            vendor = keyed.post("/vendor", json={"name": _unique("capped-vendor")})
            assert_code(vendor, 200)
            vendor_id = vendor.json()["id"]

        assert_code(owner.patch(f"/auth/user/{user_id}", json={"level": "read"}), 200)

        with _keyed_client(key) as keyed:
            # Same key, same request, different answer -- the cap is re-applied per call.
            assert_code(keyed.get("/spool"), 200)
            assert_code(keyed.post("/vendor", json={"name": "should not exist"}), 403)

        listed = client.get("/auth/apikey")
        assert_code(listed, 200)
        entry = next(item for item in listed.json() if item["id"] == key_id)
        assert entry["level"] == "manage", "the issued level is a historical fact and does not change"
        assert entry["effective_level"] == "read", "what it can actually do follows the owner"

        assert_code(owner.delete(f"/vendor/{vendor_id}"), 200)
    finally:
        client.close()


def test_revoke_stops_the_key_but_keeps_the_record(owner: httpx.Client) -> None:
    """A revoked key stops authenticating and stays visible as revoked."""
    created = owner.post("/auth/apikey", json={"name": _unique("revoked"), "level": "read"})
    assert_code(created, 201)
    key = created.json()["key"]
    key_id = created.json()["info"]["id"]

    with _keyed_client(key) as client:
        assert_code(client.get("/spool"), 200)

    revoked = owner.post(f"/auth/apikey/{key_id}/revoke")
    assert_code(revoked, 200)
    assert revoked.json()["revoked"] is True

    with _keyed_client(key) as client:
        assert_code(client.get("/spool"), 401)

    listed = owner.get("/auth/apikey")
    assert_code(listed, 200)
    assert any(item["id"] == key_id and item["revoked"] for item in listed.json())


def test_delete_removes_the_key(owner: httpx.Client) -> None:
    """A deleted key stops working and leaves the listing."""
    created = owner.post("/auth/apikey", json={"name": _unique("deleted"), "level": "read"})
    assert_code(created, 201)
    key = created.json()["key"]
    key_id = created.json()["info"]["id"]

    assert_code(owner.delete(f"/auth/apikey/{key_id}"), 200)

    with _keyed_client(key) as client:
        assert_code(client.get("/spool"), 401)

    listed = owner.get("/auth/apikey")
    assert_code(listed, 200)
    assert all(item["id"] != key_id for item in listed.json())


def test_keys_are_private_to_their_owner(owner: httpx.Client, reader: httpx.Client) -> None:
    """One user cannot see or touch another's keys.

    The refusal is 404 rather than 403 on purpose: answering "forbidden" would confirm
    that a key with this ID exists and belongs to somebody else.
    """
    created = owner.post("/auth/apikey", json={"name": _unique("private"), "level": "read"})
    assert_code(created, 201)
    key_id = created.json()["info"]["id"]

    listed = reader.get("/auth/apikey")
    assert_code(listed, 200)
    assert all(item["id"] != key_id for item in listed.json())

    assert_code(reader.post(f"/auth/apikey/{key_id}/revoke"), 404)
    assert_code(reader.delete(f"/auth/apikey/{key_id}"), 404)


def test_key_belonging_to_a_disabled_user_stops_working(owner: httpx.Client) -> None:
    """Disabling an account disables its machine credentials too."""
    username = _unique("disabled")
    user_id, password = create_user(owner, username, level="edit", password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    try:
        created = client.post("/auth/apikey", json={"name": _unique("orphan"), "level": "read"})
        assert_code(created, 201)
        key = created.json()["key"]
    finally:
        client.close()

    with _keyed_client(key) as keyed:
        assert_code(keyed.get("/spool"), 200)

    assert_code(owner.patch(f"/auth/user/{user_id}", json={"is_active": False}), 200)

    with _keyed_client(key) as keyed:
        assert_code(keyed.get("/spool"), 401)


def test_anonymous_cannot_reach_key_endpoints(anonymous: httpx.Client) -> None:
    """Without a session there is no account to own a key."""
    assert_code(anonymous.get("/auth/apikey"), 401)
    assert_code(anonymous.post("/auth/apikey", json={"name": "nope", "level": "read"}), 401)
