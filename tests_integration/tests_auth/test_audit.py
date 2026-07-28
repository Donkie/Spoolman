"""Integration tests: the audit log.

The log's value rests on three things, and each is asserted below.

It records what happened even when the request failed -- a sign-in attempt against a
real account is exactly the event an administrator wants to see, and it is the one the
caller was told nothing about.

It cannot be edited through the API. There is no write endpoint and no delete endpoint,
so a log its subjects could tamper with never exists in the first place.

It outlives its subjects. Deleting an account detaches its entries rather than removing
them, so the record of what that account did survives the account.
"""

import time

import httpx

from .conftest import (
    READER_PASSWORD,
    assert_code,
    create_user,
    login,
)


def _unique(prefix: str) -> str:
    """Build a name no other test in this run will collide with."""
    return f"{prefix}-{int(time.time() * 1000)}"


def _entries(owner: httpx.Client, **params: object) -> list[dict]:
    """Read the audit log."""
    response = owner.get("/auth/audit", params=params)
    assert_code(response, 200)
    return response.json()


def test_successful_sign_in_is_recorded(owner: httpx.Client) -> None:
    """Signing in leaves an attributable entry."""
    username = _unique("audited")
    create_user(owner, username, level="read", password=READER_PASSWORD)
    client, response = login(username=username, password=READER_PASSWORD)
    assert_code(response, 200)
    client.close()

    entries = _entries(owner, event="login.success", limit=100)
    assert any(entry["target"] == username.lower() for entry in entries)


def test_failed_sign_in_is_recorded_with_a_reason(owner: httpx.Client) -> None:
    """The log distinguishes what the response deliberately does not.

    The caller is told only "incorrect username or password", because saying more would
    let anyone enumerate accounts. The administrator reading the log already knows which
    accounts exist, so the entry says which case it was.
    """
    username = _unique("badpass")
    create_user(owner, username, level="read", password=READER_PASSWORD)

    _, response = login(username=username, password="definitely-not-the-password")
    assert_code(response, 401)

    entries = _entries(owner, event="login.failure", limit=100)
    match = next((entry for entry in entries if entry["target"] == username.lower()), None)
    assert match is not None, "the failed attempt should have been recorded"
    assert match["detail"]["reason"] == "bad_password"
    assert match["actor_username"] == username.lower()


def test_user_and_key_changes_are_recorded(owner: httpx.Client) -> None:
    """Creating an account and issuing a key both leave entries."""
    username = _unique("recorded")
    user_id, _ = create_user(owner, username, level="read", password=READER_PASSWORD)

    key_name = _unique("recorded-key")
    created = owner.post("/auth/apikey", json={"name": key_name, "level": "read"})
    assert_code(created, 201)

    assert_code(owner.patch(f"/auth/user/{user_id}", json={"level": "edit"}), 200)

    entries = _entries(owner, limit=200)
    events = {(entry["event"], entry["target"]) for entry in entries}
    assert ("user.created", username.lower()) in events
    assert ("user.updated", username.lower()) in events
    assert ("apikey.created", key_name) in events

    # The key's prefix is recorded, so a key seen in a log can be traced to its creation.
    key_entry = next(entry for entry in entries if entry["event"] == "apikey.created" and entry["target"] == key_name)
    assert key_entry["detail"]["prefix"] == created.json()["info"]["prefix"]
    assert key_entry["actor_kind"] == "user"


def test_entries_survive_the_account_that_made_them(owner: httpx.Client) -> None:
    """Deleting a user detaches its entries instead of erasing them.

    A log that loses its record of what an account did the moment the account is removed
    is not evidence of anything. The username survives in ``target``.
    """
    username = _unique("ghost")
    user_id, password = create_user(owner, username, level="read", password=READER_PASSWORD)

    client, response = login(username=username, password=password)
    assert_code(response, 200)
    client.close()

    assert_code(owner.delete(f"/auth/user/{user_id}"), 200)

    entries = _entries(owner, event="login.success", limit=200)
    match = next((entry for entry in entries if entry["target"] == username.lower()), None)
    assert match is not None, "the sign-in should still be recorded"
    assert match.get("actor_user_id") is None, "the foreign key should have been cleared"
    assert match.get("actor_username") is None


def test_filtering_and_pagination(owner: httpx.Client) -> None:
    """The event filter narrows the list, and the total counts what matched."""
    unfiltered = owner.get("/auth/audit", params={"limit": 1})
    assert_code(unfiltered, 200)
    assert len(unfiltered.json()) <= 1
    total = int(unfiltered.headers["x-total-count"])
    assert total > 0

    filtered = owner.get("/auth/audit", params={"event": "login.success", "limit": 100})
    assert_code(filtered, 200)
    assert all(entry["event"] == "login.success" for entry in filtered.json())
    assert int(filtered.headers["x-total-count"]) <= total

    # An event nobody has produced yields an empty page rather than an error.
    empty = owner.get("/auth/audit", params={"event": "no.such.event"})
    assert_code(empty, 200)
    assert empty.json() == []


def test_newest_first(owner: httpx.Client) -> None:
    """Entries come back with the most recent first."""
    entries = _entries(owner, limit=50)
    dates = [entry["date"] for entry in entries]
    assert dates == sorted(dates, reverse=True)


def test_event_vocabulary_is_published(owner: httpx.Client) -> None:
    """A client can learn the event names rather than hardcoding them."""
    response = owner.get("/auth/audit/events")
    assert_code(response, 200)
    events = response.json()
    for expected in ("login.success", "login.failure", "user.created", "apikey.created"):
        assert expected in events


def test_the_log_is_read_only(owner: httpx.Client) -> None:
    """There is no way to add or remove an entry through the API."""
    assert owner.post("/auth/audit", json={"event": "login.success"}).status_code == 405
    assert owner.delete("/auth/audit").status_code == 405


def test_non_admin_cannot_read_the_log(reader: httpx.Client) -> None:
    """The log names accounts and addresses, so reading it needs admin."""
    assert_code(reader.get("/auth/audit"), 403)
    assert_code(reader.get("/auth/audit/events"), 403)


def test_anonymous_cannot_read_the_log(anonymous: httpx.Client) -> None:
    """Without a credential the log answers 401."""
    assert_code(anonymous.get("/auth/audit"), 401)
