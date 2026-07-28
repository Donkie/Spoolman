"""Integration tests: claiming an unclaimed instance.

The first caller to reach POST /auth/setup becomes the owner. That is a one-shot,
irreversible transition, so the interesting assertions are that it happens exactly once
and that the claim really does hand out a working session.
"""

import httpx

from .conftest import (
    API_URL,
    CSRF_COOKIE,
    OWNER_DISPLAY_NAME,
    OWNER_USERNAME_STORED,
    SESSION_COOKIE,
    TIMEOUT,
    assert_code,
)


def test_setup_claims_the_instance(setup_response: httpx.Response) -> None:
    """The first claim answers 201 with an owner-level session."""
    assert_code(setup_response, 201)

    info = setup_response.json()
    assert info["authenticated"] is True
    assert info["anonymous"] is False
    assert info["level"] == "manage"
    assert info["is_admin"] is True
    assert info["is_owner"] is True


def test_setup_lowercases_the_username(setup_response: httpx.Response) -> None:
    """The username is stored lowercased regardless of how it was typed."""
    assert_code(setup_response, 201)
    user = setup_response.json()["user"]
    assert user["username"] == OWNER_USERNAME_STORED
    assert user["display_name"] == OWNER_DISPLAY_NAME
    assert user["level"] == "manage"
    assert user["is_owner"] is True


def test_setup_sets_session_and_csrf_cookies(setup_response: httpx.Response) -> None:
    """The claim is also a sign-in: both cookies come back, session one HttpOnly."""
    assert_code(setup_response, 201)

    set_cookie = "; ".join(setup_response.headers.get_list("set-cookie")).lower()
    assert SESSION_COOKIE in set_cookie
    assert CSRF_COOKIE in set_cookie

    session_header = next(
        header for header in setup_response.headers.get_list("set-cookie") if header.startswith(SESSION_COOKIE)
    )
    csrf_header = next(
        header for header in setup_response.headers.get_list("set-cookie") if header.startswith(CSRF_COOKIE)
    )
    # The session token must not be reachable from script; the CSRF token must be, since
    # the client has to copy it into a request header.
    assert "httponly" in session_header.lower()
    assert "httponly" not in csrf_header.lower()


def test_setup_is_refused_once_claimed(setup_response: httpx.Response) -> None:
    """A second claim is a conflict, not a second owner."""
    assert_code(setup_response, 201)

    result = httpx.post(
        f"{API_URL}/auth/setup",
        json={"username": "impostor", "password": "another-long-password"},
        timeout=TIMEOUT,
    )
    assert_code(result, 409)
    assert "claimed" in result.json()["message"].lower()


def test_setup_session_can_be_used(setup_response: httpx.Response) -> None:
    """The cookies the claim handed out actually authenticate a request."""
    assert_code(setup_response, 201)

    with httpx.Client(base_url=API_URL, timeout=TIMEOUT, cookies=setup_response.cookies) as client:
        result = client.get("/auth/session")
        assert_code(result, 200)
        info = result.json()
        assert info["authenticated"] is True
        assert info["is_owner"] is True
        assert info["user"]["username"] == OWNER_USERNAME_STORED


def test_config_reports_the_instance_claimed(setup_response: httpx.Response) -> None:
    """GET /auth/config stops advertising setup once an account exists."""
    assert_code(setup_response, 201)

    result = httpx.get(f"{API_URL}/auth/config", timeout=TIMEOUT)
    assert_code(result, 200)
    config = result.json()
    assert config["enabled"] is True
    assert config["setup_required"] is False
