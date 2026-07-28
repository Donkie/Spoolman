"""Integration tests: the auth_anonymous_read setting.

An operator who wants a read-only public dashboard turns this on. It grants an
unauthenticated caller a principal at the read level -- nothing more -- so it must open
exactly the read routes and no others.

The setting is a database row rather than an environment variable, which means it can be
flipped at runtime by anyone at manage level. That makes 'turning it off again really
does close the door' a property worth asserting, not assuming.
"""

import httpx
import pytest

from .conftest import assert_code

SETTING = "/setting/auth_anonymous_read"


@pytest.fixture
def anonymous_read_on(owner: httpx.Client):
    """Turn the setting on for one test, and off again afterwards.

    The teardown is not optional: leaving it on would silently defeat every 401
    assertion in test_unauthenticated.py, which collects after this file.
    """
    assert_code(owner.post(SETTING, json="true"), 200)
    try:
        yield
    finally:
        assert_code(owner.post(SETTING, json="false"), 200)


def test_setting_defaults_to_off(owner: httpx.Client, anonymous: httpx.Client) -> None:
    """With the setting off an unauthenticated read is refused."""
    result = owner.get(SETTING)
    assert_code(result, 200)
    assert result.json()["value"] in {"false", "null"}

    assert_code(anonymous.get("/spool"), 401)
    assert_code(anonymous.get("/filament"), 401)


def test_anonymous_read_opens_read_routes(anonymous_read_on: None, anonymous: httpx.Client) -> None:  # noqa: ARG001
    """With the setting on, read routes answer without any credential."""
    assert_code(anonymous.get("/spool"), 200)
    assert_code(anonymous.get("/filament"), 200)
    assert_code(anonymous.get("/vendor"), 200)
    assert_code(anonymous.get("/setting/"), 200)
    assert_code(anonymous.get("/info"), 200)


def test_anonymous_read_is_advertised_in_config(anonymous_read_on: None, anonymous: httpx.Client) -> None:  # noqa: ARG001
    """A client can discover the mode before deciding whether to prompt for a sign-in."""
    result = anonymous.get("/auth/config")
    assert_code(result, 200)
    assert result.json()["anonymous_read"] is True


def test_anonymous_session_reports_anonymous(anonymous_read_on: None, anonymous: httpx.Client) -> None:  # noqa: ARG001
    """The caller is anonymous, not authenticated, and holds read level only."""
    result = anonymous.get("/auth/session")
    assert_code(result, 200)
    info = result.json()
    assert info["authenticated"] is False
    assert info["anonymous"] is True
    assert info["level"] == "read"
    assert info["is_admin"] is False
    assert info["is_owner"] is False


def test_anonymous_read_does_not_open_writes(anonymous_read_on: None, anonymous: httpx.Client) -> None:  # noqa: ARG001
    """Nothing above read opens up.

    The status is 403 rather than 401: a principal was established, it simply does not
    cover the level. See the note on the export test below -- the same reasoning applies
    here, and the same caveat about what a client can do with the answer.
    """
    assert_code(anonymous.post("/spool", json={"filament_id": 1}), 403)
    assert_code(anonymous.post("/vendor", json={"name": "nope"}), 403)
    assert_code(anonymous.post("/filament", json={"density": 1.25, "diameter": 1.75}), 403)
    assert_code(anonymous.patch("/spool/1", json={"comment": "nope"}), 403)
    assert_code(anonymous.put("/spool/1/use", json={"use_weight": 1}), 403)
    assert_code(anonymous.delete("/spool/1"), 403)
    assert_code(anonymous.post("/backup"), 403)
    assert_code(anonymous.post("/setting/currency", json='"SEK"'), 403)


def test_anonymous_read_does_not_open_the_exports(
    anonymous_read_on: None,  # noqa: ARG001
    anonymous: httpx.Client,
) -> None:
    """The bulk exports stay shut, which is the whole reason they sit at manage level.

    'Read-only public dashboard' must not mean 'download the entire database', so this is
    the assertion that gives the manage level on /export/* its purpose.

    The answer is 403. AUTHENTICATION_PLAN.md describes these as endpoints that expose
    the database in bulk and therefore refuse the anonymous reader outright, which
    ``require_level(allow_anonymous=False)`` exists to express -- but no route passes
    that argument today, so the refusal comes from the level check instead. The door is
    shut either way; only the status code differs. If the intent is later wired up, this
    expectation becomes 401.
    """
    assert_code(anonymous.get("/export/spools", params={"fmt": "json"}), 403)
    assert_code(anonymous.get("/export/filaments", params={"fmt": "json"}), 403)
    assert_code(anonymous.get("/export/vendors", params={"fmt": "json"}), 403)


def test_turning_the_setting_off_closes_the_door(owner: httpx.Client, anonymous: httpx.Client) -> None:
    """The grant is revoked immediately, without a restart or a cache to wait out."""
    assert_code(owner.post(SETTING, json="true"), 200)
    assert_code(anonymous.get("/spool"), 200)

    assert_code(owner.post(SETTING, json="false"), 200)
    assert_code(anonymous.get("/spool"), 401)


def test_owner_still_works_while_anonymous_read_is_on(
    anonymous_read_on: None,  # noqa: ARG001
    owner: httpx.Client,
) -> None:
    """A real session is not downgraded to the anonymous principal."""
    result = owner.get("/auth/session")
    assert_code(result, 200)
    info = result.json()
    assert info["anonymous"] is False
    assert info["level"] == "manage"
    assert_code(owner.get("/export/spools", params={"fmt": "json"}), 200)
