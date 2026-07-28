"""Integration tests: user administration.

Two things are being defended here.

The first is that an instance cannot be administered into a state nobody can recover
from through the interface: the owner and the caller's own account are shielded from
demotion, disabling and deletion. Neither is a security boundary -- both are recoverable
with ``python -m spoolman.cli`` -- so the tests assert the refusal, not that it is
unbypassable.

The second is that the protections only fire on changes that actually take something
away. A form that re-sends an account unchanged must not be refused just because it
included a field the caller may not lower.
"""

import time

import httpx

from .conftest import (
    OWNER_USERNAME_STORED,
    READER_PASSWORD,
    assert_code,
    create_user,
    login,
)


def _unique(prefix: str) -> str:
    """Build a username no other test in this run will collide with."""
    return f"{prefix}-{int(time.time() * 1000)}"


def test_create_generates_a_password_when_none_is_given(owner: httpx.Client) -> None:
    """A generated password comes back once, and works."""
    username = _unique("generated")
    response = owner.post("/auth/user", json={"username": username, "level": "read"})
    assert_code(response, 201)
    body = response.json()

    password = body["password"]
    assert password, "a password should have been generated"
    assert body["user"]["must_change_password"] is True, "generated passwords default to one-time"

    client, login_response = login(username=username, password=password)
    assert_code(login_response, 200)
    client.close()

    # And it is never retrievable again.
    fetched = owner.get(f"/auth/user/{body['user']['id']}")
    assert_code(fetched, 200)
    assert password not in str(fetched.json())


def test_create_accepts_a_supplied_password(owner: httpx.Client) -> None:
    """When the caller supplies a password, none is generated or echoed."""
    username = _unique("supplied")
    response = owner.post(
        "/auth/user",
        json={"username": username, "password": READER_PASSWORD, "level": "edit"},
    )
    assert_code(response, 201)
    assert response.json().get("password") is None

    client, login_response = login(username=username, password=READER_PASSWORD)
    assert_code(login_response, 200)
    client.close()


def test_usernames_are_unique_and_normalised(owner: httpx.Client) -> None:
    """A second account with the same name, in any case, is refused."""
    username = _unique("Unique")
    create_user(owner, username, password=READER_PASSWORD)

    clash = owner.post("/auth/user", json={"username": username.upper(), "level": "read"})
    assert_code(clash, 409)
    assert "already exists" in clash.json()["message"]


def test_list_includes_every_account(owner: httpx.Client) -> None:
    """The listing shows the owner alongside whatever the suite has created."""
    username = _unique("listed")
    create_user(owner, username, password=READER_PASSWORD)

    response = owner.get("/auth/user")
    assert_code(response, 200)
    usernames = {user["username"] for user in response.json()}
    assert OWNER_USERNAME_STORED in usernames
    assert username.lower() in usernames
    assert response.headers["x-total-count"] == str(len(response.json()))


def test_update_changes_level_and_flags(owner: httpx.Client) -> None:
    """Level, administrator and display name all take effect."""
    user_id, _ = create_user(owner, _unique("updated"), level="read", password=READER_PASSWORD)

    response = owner.patch(
        f"/auth/user/{user_id}",
        json={"level": "manage", "is_admin": True, "display_name": "Renamed"},
    )
    assert_code(response, 200)
    body = response.json()
    assert body["level"] == "manage"
    assert body["is_admin"] is True
    assert body["display_name"] == "Renamed"


def test_owner_cannot_be_demoted_disabled_or_deleted(owner: httpx.Client) -> None:
    """The account that can always fix the others cannot be taken apart."""
    session = owner.get("/auth/session")
    assert_code(session, 200)
    owner_id = session.json()["user"]["id"]

    for change in ({"level": "read"}, {"is_admin": False}, {"is_active": False}):
        refused = owner.patch(f"/auth/user/{owner_id}", json=change)
        assert_code(refused, 403)
        assert "owner" in refused.json()["message"].lower()

    assert_code(owner.delete(f"/auth/user/{owner_id}"), 403)


def test_unchanged_fields_are_not_refused(owner: httpx.Client) -> None:
    """Re-sending an account's current values is a no-op, not a violation.

    The protections compare against what is stored, so a form that submits every field
    -- including the owner's own level -- succeeds as long as nothing actually changes.
    """
    session = owner.get("/auth/session")
    assert_code(session, 200)
    owner_id = session.json()["user"]["id"]

    response = owner.patch(
        f"/auth/user/{owner_id}",
        json={"level": "manage", "is_admin": True, "is_active": True},
    )
    assert_code(response, 200)
    assert response.json()["level"] == "manage"


def test_admin_cannot_demote_or_delete_themselves(owner: httpx.Client) -> None:
    """Removing your own rights needs a second pair of hands."""
    username = _unique("selfadmin")
    user_id, password = create_user(owner, username, level="manage", is_admin=True, password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    try:
        for change in ({"level": "read"}, {"is_admin": False}, {"is_active": False}):
            refused = client.patch(f"/auth/user/{user_id}", json=change)
            assert_code(refused, 403)
        assert_code(client.delete(f"/auth/user/{user_id}"), 403)

        # Somebody else with the rights can, which is the point of the restriction.
        assert_code(owner.patch(f"/auth/user/{user_id}", json={"is_admin": False}), 200)
    finally:
        client.close()


def test_disabling_an_account_ends_its_sessions(owner: httpx.Client) -> None:
    """A disabled account whose cookie still worked would not be disabled."""
    username = _unique("cutoff")
    user_id, password = create_user(owner, username, level="read", password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    try:
        assert_code(client.get("/spool"), 200)
        assert_code(owner.patch(f"/auth/user/{user_id}", json={"is_active": False}), 200)
        assert_code(client.get("/spool"), 401)
    finally:
        client.close()


def test_password_reset_ends_sessions_and_sets_the_new_password(owner: httpx.Client) -> None:
    """A reset invalidates what the old password bought."""
    username = _unique("reset")
    user_id, password = create_user(owner, username, level="read", password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    try:
        assert_code(client.get("/spool"), 200)

        reset = owner.post(f"/auth/user/{user_id}/password", json={"must_change_password": True})
        assert_code(reset, 200)
        new_password = reset.json()["password"]
        assert new_password
        assert new_password != password

        # Whoever knew the old password may be exactly who the reset defends against.
        assert_code(client.get("/spool"), 401)
    finally:
        client.close()

    fresh, response = login(username=username, password=new_password)
    assert_code(response, 200)
    try:
        assert response.json()["user"]["must_change_password"] is True
    finally:
        fresh.close()


def test_revoke_sessions_without_changing_the_password(owner: httpx.Client) -> None:
    """Signing somebody out everywhere leaves their credential alone."""
    username = _unique("revoked")
    user_id, password = create_user(owner, username, level="read", password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    try:
        assert_code(owner.post(f"/auth/user/{user_id}/revoke-sessions"), 200)
        assert_code(client.get("/spool"), 401)
    finally:
        client.close()

    again, response = login(username=username, password=password)
    assert_code(response, 200)
    again.close()


def test_delete_removes_the_account_and_its_sessions(owner: httpx.Client) -> None:
    """A deleted account cannot sign in and is gone from the listing."""
    username = _unique("gone")
    user_id, password = create_user(owner, username, level="read", password=READER_PASSWORD)

    assert_code(owner.delete(f"/auth/user/{user_id}"), 200)
    assert_code(owner.get(f"/auth/user/{user_id}"), 404)

    listed = owner.get("/auth/user")
    assert_code(listed, 200)
    assert all(user["id"] != user_id for user in listed.json())

    _, response = login(username=username, password=password)
    assert_code(response, 401)


def test_non_admin_is_refused_every_user_endpoint(reader: httpx.Client) -> None:
    """Managing accounts needs administrator rights, not merely a session."""
    assert_code(reader.get("/auth/user"), 403)
    assert_code(reader.post("/auth/user", json={"username": "nope", "level": "read"}), 403)
    assert_code(reader.patch("/auth/user/1", json={"level": "read"}), 403)
    assert_code(reader.delete("/auth/user/1"), 403)


def test_anonymous_is_refused_every_user_endpoint(anonymous: httpx.Client) -> None:
    """Without any credential the endpoints answer 401, not 403."""
    assert_code(anonymous.get("/auth/user"), 401)
    assert_code(anonymous.post("/auth/user", json={"username": "nope", "level": "read"}), 401)
