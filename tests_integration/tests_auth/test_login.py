"""Integration tests: signing in.

Two properties matter more than the happy path here. The first is that every failure
looks identical, so nobody can use the endpoint to find out which usernames exist. The
second is that repeated guessing stops working, and says so with a Retry-After the
client can obey.
"""

import httpx
import pytest

from .conftest import (
    API_URL,
    CSRF_COOKIE,
    INVALID_CREDENTIALS,
    OWNER_PASSWORD,
    OWNER_USERNAME,
    OWNER_USERNAME_STORED,
    SESSION_COOKIE,
    TIMEOUT,
    assert_code,
    signed_in,
)

# spoolman.database.auth_user.LOCKOUT_THRESHOLD.
LOCKOUT_THRESHOLD = 5

# The first lockout, in seconds, doubling per further failure up to 900.
LOCKOUT_BASE_SECONDS = 60

# spoolman.auth.cookies.REMEMBER_LIFETIME, in seconds.
REMEMBER_LIFETIME_SECONDS = 90 * 24 * 60 * 60


def _cookie_header(response: httpx.Response, name: str) -> str:
    """Return the Set-Cookie header for one cookie."""
    for header in response.headers.get_list("set-cookie"):
        if header.startswith(f"{name}="):
            return header
    return pytest.fail(f"No {name} cookie was set. Headers: {response.headers.get_list('set-cookie')}")


def test_login_succeeds(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """Correct credentials return the caller's standing and set both cookies."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        info = response.json()
        assert info["authenticated"] is True
        assert info["level"] == "manage"
        assert info["user"]["username"] == OWNER_USERNAME_STORED

        assert client.cookies.get(SESSION_COOKIE)
        assert client.cookies.get(CSRF_COOKIE)

        # The session it handed out works.
        assert_code(client.get("/spool"), 200)


def test_login_is_case_insensitive(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """Usernames are matched in their normalised, lowercased form."""
    with signed_in(username=OWNER_USERNAME.upper()) as (_, response):
        assert_code(response, 200)
        assert response.json()["user"]["username"] == OWNER_USERNAME_STORED


def test_login_with_wrong_password_is_refused(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """A wrong password is a 401 and sets no cookies."""
    result = httpx.post(
        f"{API_URL}/auth/login",
        json={"username": OWNER_USERNAME, "password": "definitely-not-the-password"},
        timeout=TIMEOUT,
    )
    assert_code(result, 401)
    assert result.json()["message"] == INVALID_CREDENTIALS
    assert not result.headers.get_list("set-cookie")


def test_unknown_user_gives_the_same_answer(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """An account that does not exist is indistinguishable from a wrong password.

    Identical status and body: any difference here would turn the endpoint into a
    username oracle.
    """
    wrong_password = httpx.post(
        f"{API_URL}/auth/login",
        json={"username": OWNER_USERNAME, "password": "definitely-not-the-password"},
        timeout=TIMEOUT,
    )
    unknown_user = httpx.post(
        f"{API_URL}/auth/login",
        json={"username": "no-such-person", "password": "definitely-not-the-password"},
        timeout=TIMEOUT,
    )

    assert unknown_user.status_code == wrong_password.status_code == 401
    assert unknown_user.json() == wrong_password.json() == {"message": INVALID_CREDENTIALS}


def test_remember_controls_cookie_lifetime(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """'Remember me' is the difference between a persistent and a session cookie.

    Without it the cookies must carry no Max-Age, so the browser drops them when it
    closes. With it they get the 90-day lifetime the session itself is given.
    """
    with signed_in(remember=False) as (_, plain):
        assert_code(plain, 200)
        assert "max-age" not in _cookie_header(plain, SESSION_COOKIE).lower()
        assert "max-age" not in _cookie_header(plain, CSRF_COOKIE).lower()

    with signed_in(remember=True) as (_, remembered):
        assert_code(remembered, 200)
        assert f"max-age={REMEMBER_LIFETIME_SECONDS}" in _cookie_header(remembered, SESSION_COOKIE).lower()
        assert f"max-age={REMEMBER_LIFETIME_SECONDS}" in _cookie_header(remembered, CSRF_COOKIE).lower()


def test_logout_revokes_the_session(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """After signing out the cookie is dead server-side, not merely cleared client-side."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        token = client.cookies.get(SESSION_COOKIE)
        csrf = client.cookies.get(CSRF_COOKIE)
        assert_code(client.post("/auth/logout"), 200)

    # Present the old token by hand: the row is gone, so it authenticates nothing.
    with httpx.Client(base_url=API_URL, timeout=TIMEOUT) as fresh:
        result = fresh.get(
            "/spool",
            headers={"Cookie": f"{SESSION_COOKIE}={token}; {CSRF_COOKIE}={csrf}"},
        )
        assert_code(result, 401)


def test_repeated_failures_lock_the_account(owner: httpx.Client) -> None:
    """Guessing stops working after five failures, with a Retry-After the client can obey.

    The lockout is persisted on the user row, so it survives a restart, and it applies to
    new sign-ins only -- the ``owner`` fixture's existing session keeps working
    throughout, which is what makes the recovery below possible.

    This is the only test that locks the account. It restores it before finishing by
    re-setting the same password through the still-live owner session: ``set_password``
    clears failed_logins and locked_until, which is the only way back in short of waiting
    out the minute.
    """
    # Start from a known state: a successful sign-in zeroes the persisted failure count,
    # so the loop below is exactly five failures whatever ran before it.
    with signed_in() as (_, reset):
        assert_code(reset, 200)

    try:
        for attempt in range(LOCKOUT_THRESHOLD):
            result = httpx.post(
                f"{API_URL}/auth/login",
                json={"username": OWNER_USERNAME, "password": f"wrong-guess-{attempt}"},
                timeout=TIMEOUT,
            )
            # Every one of the first five is an ordinary credential failure; the lockout
            # only takes effect from the next attempt onwards.
            assert_code(result, 401)
            assert result.json()["message"] == INVALID_CREDENTIALS

        # Even the correct password is now refused, and with a different status: a client
        # must be able to tell "wrong password, try again" from "stop trying".
        locked = httpx.post(
            f"{API_URL}/auth/login",
            json={"username": OWNER_USERNAME, "password": OWNER_PASSWORD},
            timeout=TIMEOUT,
        )
        assert_code(locked, 429)
        retry_after = locked.headers.get("Retry-After")
        assert retry_after is not None, "A 429 without Retry-After leaves the client guessing."
        assert 0 < int(retry_after) <= LOCKOUT_BASE_SECONDS
    finally:
        # Recover, so the rest of the run can still sign in.
        recovered = owner.post(
            "/auth/password",
            json={"current_password": OWNER_PASSWORD, "new_password": OWNER_PASSWORD},
        )
        assert_code(recovered, 200)

    with signed_in() as (_, unlocked):
        assert_code(unlocked, 200)
