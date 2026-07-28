"""Integration tests: changing one's own password.

The endpoint takes the current password as well as the new one, so that a borrowed
session -- an unlocked laptop, a stolen cookie -- cannot be turned into permanent
ownership of the account.

Every test here restores the original password before finishing. The owner account is
shared with the rest of the suite, and a stale password would strand every later sign-in.
"""

import httpx
import pytest

from .conftest import (
    OWNER_PASSWORD,
    OWNER_USERNAME,
    assert_code,
    signed_in,
)

NEW_PASSWORD = "an-entirely-different-password"


@pytest.fixture
def restore_password(owner: httpx.Client):
    """Put the owner's password back however the test ends."""
    yield
    # Whichever password is current, one of these two puts it back.
    for current in (NEW_PASSWORD, OWNER_PASSWORD):
        result = owner.post(
            "/auth/password",
            json={"current_password": current, "new_password": OWNER_PASSWORD},
        )
        if result.status_code == 200:
            break
    else:
        pytest.fail("Could not restore the owner password; later tests will not be able to sign in.")


def test_wrong_current_password_is_refused(owner: httpx.Client) -> None:
    """A caller who cannot produce the current password cannot replace it."""
    result = owner.post(
        "/auth/password",
        json={"current_password": "not-the-current-password", "new_password": NEW_PASSWORD},
    )
    assert_code(result, 400)
    assert "current password" in result.json()["message"].lower()

    # The old password still works, so nothing was changed on the way to the refusal.
    with signed_in() as (_, response):
        assert_code(response, 200)


def test_password_change_requires_a_session(anonymous: httpx.Client) -> None:
    """Unlike the other auth endpoints, this one is gated."""
    result = anonymous.post(
        "/auth/password",
        json={"current_password": OWNER_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert_code(result, 401)


def test_password_change_succeeds_and_takes_effect(
    owner: httpx.Client,
    restore_password: None,  # noqa: ARG001
) -> None:
    """The new password works on the next sign-in, and the old one stops working."""
    result = owner.post(
        "/auth/password",
        json={"current_password": OWNER_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert_code(result, 200)

    with signed_in(password=NEW_PASSWORD) as (_, with_new):
        assert_code(with_new, 200)
        assert with_new.json()["is_owner"] is True

    with signed_in(password=OWNER_PASSWORD) as (_, with_old):
        assert_code(with_old, 401)


def test_changing_the_password_keeps_the_current_session_alive(
    owner: httpx.Client,
    restore_password: None,  # noqa: ARG001
) -> None:
    """The session that made the change is not signed out by it.

    Phase 1 does not revoke any session on a password change. Asserting the current
    behaviour here means that if revocation is added later, this test is the thing that
    says so out loud rather than users being silently signed out.
    """
    assert_code(
        owner.post("/auth/password", json={"current_password": OWNER_PASSWORD, "new_password": NEW_PASSWORD}),
        200,
    )
    assert_code(owner.get("/spool"), 200)
    assert_code(owner.get("/auth/session"), 200)


def test_new_password_works_for_any_username_casing(
    owner: httpx.Client,
    restore_password: None,  # noqa: ARG001
) -> None:
    """The changed password belongs to the account, whichever casing signs in with it."""
    assert_code(
        owner.post("/auth/password", json={"current_password": OWNER_PASSWORD, "new_password": NEW_PASSWORD}),
        200,
    )
    with signed_in(username=OWNER_USERNAME.upper(), password=NEW_PASSWORD) as (_, response):
        assert_code(response, 200)
