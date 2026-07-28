"""Fixtures for the authentication integration tests.

This suite is deliberately a sibling of ``tests_integration/tests`` rather than a
subdirectory of it. The tester image's entrypoint is fixed to ``pytest --exitfirst
tests``, and the auth compose file mounts *this* directory at ``/tester/tests``. That
means the regression suite and the auth suite can never be collected in the same run:
the regression suite talks to a server with authentication off and would fail wholesale
against an authenticated one.

The URL/DbType/session-start block below is duplicated from ``tests/conftest.py`` on
purpose. Nothing there can be reused: every fixture in that file drives bare ``httpx``
module functions with no credentials, which against an authenticated server is exactly
the thing under test.

Two pieces of shared state matter for the whole run:

* The instance is claimed exactly once, by the ``setup_response`` fixture. Any test that
  needs a signed-in caller depends on it, so ``test_setup.py`` can assert on the *first*
  call's response no matter which file pytest happens to collect first.
* The sign-in throttle in ``spoolman.auth.ratelimit`` allows 20 failed attempts per
  client address per 15 minutes, and every test here shares one address. The suite spends
  roughly 8. Keep new failing-login assertions well under the remaining budget or later
  tests will start seeing 429 where they expect 401.
"""

import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from enum import StrEnum

import httpx
import pytest

TIMEOUT = 30

HOST = "spoolman:" + os.environ.get("SPOOLMAN_PORT", "8000")
URL = f"http://{HOST}"
API_URL = f"{URL}/api/v1"
WS_API_URL = f"ws://{HOST}/api/v1"

SESSION_COOKIE = "spoolman_session"
CSRF_COOKIE = "spoolman_csrf"
CSRF_HEADER = "X-CSRF-Token"

# Deliberately mixed case: usernames are normalised to lowercase on the way in, and
# test_setup asserts that the stored form came back lowercased.
OWNER_USERNAME = "Owner"
OWNER_USERNAME_STORED = "owner"
OWNER_PASSWORD = "correct-horse-battery-staple"
OWNER_DISPLAY_NAME = "The Owner"

# Every failed sign-in answers with this exact text, whatever went wrong.
INVALID_CREDENTIALS = "Incorrect username or password."

# Password for accounts the tests create for themselves. Long enough to clear the
# server's ten character minimum.
READER_PASSWORD = "reader-password-1"

# Websocket close codes, from spoolman.auth.dependencies.
WS_UNAUTHENTICATED = 4401
WS_FORBIDDEN = 4403


class DbType(StrEnum):
    """Enum for database types."""

    SQLITE = "sqlite"
    POSTGRES = "postgres"
    MYSQL = "mysql"
    COCKROACHDB = "cockroachdb"


def get_db_type() -> DbType:
    """Return the database type from environment variables."""
    env_db_type = os.environ.get("DB_TYPE")
    if env_db_type is None:
        raise RuntimeError("DB_TYPE environment variable not set")
    try:
        db_type = DbType(env_db_type)
    except ValueError as e:
        raise RuntimeError(f"Unknown database type: {env_db_type}") from e
    return db_type


def pytest_sessionstart(session):  # noqa: ARG001, ANN001
    """Wait for the server to start up."""
    get_db_type()
    start_time = time.time()
    while True:
        try:
            print("pytest: Waiting for spoolman to be available...")  # noqa: T201
            response = httpx.get(URL, timeout=1)
            response.raise_for_status()
            print("pytest: Spoolman now seems to be up!")  # noqa: T201
        except httpx.HTTPError:
            if time.time() - start_time > TIMEOUT:
                raise
            time.sleep(0.5)
        else:
            break


def new_client() -> httpx.Client:
    """Return a client with no credentials, rooted at the v1 API."""
    return httpx.Client(base_url=API_URL, timeout=TIMEOUT)


def attach_csrf(client: httpx.Client) -> str:
    """Copy the readable CSRF cookie into the header the server checks.

    This is what a browser client does by hand; the session cookie rides along
    automatically, so without this step every non-GET would be rejected as CSRF.

    Args:
        client: The signed-in client to modify.

    Returns:
        str: The CSRF token that was attached.

    """
    csrf = client.cookies.get(CSRF_COOKIE)
    if not csrf:
        pytest.fail("No CSRF cookie was set; the client is not signed in.")
    client.headers[CSRF_HEADER] = csrf
    return csrf


def login(
    *,
    username: str = OWNER_USERNAME,
    password: str = OWNER_PASSWORD,
    remember: bool = False,
) -> tuple[httpx.Client, httpx.Response]:
    """Sign in and return a client carrying the resulting session.

    Args:
        username: The username to present.
        password: The password to present.
        remember: Whether to ask for a long-lived session.

    Returns:
        tuple: The client, and the raw login response.

    """
    client = new_client()
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password, "remember": remember},
    )
    if response.is_success:
        attach_csrf(client)
    return client, response


@contextmanager
def signed_in(
    *,
    username: str = OWNER_USERNAME,
    password: str = OWNER_PASSWORD,
    remember: bool = False,
) -> Iterator[tuple[httpx.Client, httpx.Response]]:
    """Sign in for the duration of a block, closing the client afterwards.

    A plain ``with client:`` will not do here: httpx marks a client as opened on its
    first request, and ``login`` has already made one, so entering it again raises.

    Args:
        username: The username to present.
        password: The password to present.
        remember: Whether to ask for a long-lived session.

    Yields:
        tuple: The client, and the raw login response.

    """
    client, response = login(username=username, password=password, remember=remember)
    try:
        yield client, response
    finally:
        client.close()


def assert_code(response: httpx.Response, code: int) -> None:
    """Assert that a response has the expected status code."""
    if response.status_code != code:
        pytest.fail(f"Expected {code}, got {response.status_code}: {response.text}")


@pytest.fixture(scope="session")
def setup_response() -> httpx.Response:
    """Claim the instance, once per run.

    Owning the only call to POST /auth/setup is what lets test_setup make assertions
    about the very first claim while every other file is free to assume an owner exists.
    """
    return httpx.post(
        f"{API_URL}/auth/setup",
        json={
            "username": OWNER_USERNAME,
            "password": OWNER_PASSWORD,
            "display_name": OWNER_DISPLAY_NAME,
        },
        timeout=TIMEOUT,
    )


@pytest.fixture(scope="session")
def owner(setup_response: httpx.Response) -> httpx.Client:
    """Return a client signed in as the owner, at the manage level.

    Signs in afresh rather than reusing the setup response's cookies, so the session this
    fixture holds is independent of anything test_setup does. It also survives an account
    lockout, since a lockout only blocks new sign-ins and never invalidates a live
    session -- which is what lets test_login lock the account mid-run.
    """
    assert_code(setup_response, 201)
    client, response = login()
    assert_code(response, 200)
    return client


@pytest.fixture
def anonymous() -> httpx.Client:
    """Return a client with no credentials at all."""
    with new_client() as client:
        yield client


def create_user(
    admin: httpx.Client,
    username: str,
    *,
    level: str = "read",
    is_admin: bool = False,
    password: str | None = None,
    must_change_password: bool = False,
) -> tuple[int, str]:
    """Create an account and return its ID and password.

    Phase 2's answer to what tests_auth could not do before: make a second account
    without a command line. Every caller picks a username of its own, because the suite
    shares one server and one database for the whole run.

    Args:
        admin: A client signed in as an administrator.
        username: The username to create.
        level: The permission level to grant.
        is_admin: Whether the account administers other users.
        password: The password to set, or None to have one generated.
        must_change_password: Whether to force a change at first sign-in.

    Returns:
        tuple: The new user's ID, and the password it can sign in with.

    """
    response = admin.post(
        "/auth/user",
        json={
            "username": username,
            "password": password,
            "level": level,
            "is_admin": is_admin,
            "must_change_password": must_change_password,
        },
    )
    assert_code(response, 201)
    body = response.json()
    # The server returns a generated password exactly once, here. If one was supplied it
    # is deliberately absent from the response, so fall back to what the caller sent.
    return body["user"]["id"], body.get("password") or (password or "")


@pytest.fixture
def reader(owner: httpx.Client) -> Iterator[httpx.Client]:
    """Return a client signed in as a read-level, non-administrator user.

    This is what test_levels.py's docstring said phase 1 could not build. It exists for
    exactly one purpose: proving that a low-level *user* is refused, which the anonymous
    reader could only approximate.
    """
    username = f"reader-{int(time.time() * 1000)}"
    create_user(owner, username, level="read", password=READER_PASSWORD)
    client, response = login(username=username, password=READER_PASSWORD)
    assert_code(response, 200)
    try:
        yield client
    finally:
        client.close()
