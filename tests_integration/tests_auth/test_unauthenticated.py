"""Integration tests: every gated route refuses a caller with no credentials.

This is the load-bearing test of the suite. ``spoolman.auth.coverage`` already proves at
import time that no route was left without a gate, but that is a static check on the
route table -- it says a dependency is attached, not that the dependency actually
rejects anybody. This file exercises the real thing over HTTP: 40 gated HTTP routes,
each of which must answer 401 to a request carrying nothing.

The table below is written out rather than derived, so that adding a route forces a
deliberate decision about whether it is public. ``test_route_table_matches_openapi``
is the guard that keeps the table honest: it fails the moment the served schema and this
list disagree, in either direction.

Websocket routes are gated by a different mechanism and are covered in test_websocket.py.
"""

import httpx
import pytest

from .conftest import (
    API_URL,
    INVALID_CREDENTIALS,
    SESSION_COOKIE,
    TIMEOUT,
    assert_code,
)

# Every gated HTTP route, as (method, request path, documented level).
#
# Path parameters are filled with values that need not exist: a permission gate is a
# route dependency and is solved before the handler's own parameters, so an unauthorised
# caller never gets far enough to produce a 404 or a 422.
GATED_ROUTES: list[tuple[str, str, str]] = [
    # -- read -------------------------------------------------------------------
    ("GET", "/info", "read"),
    ("GET", "/filament", "read"),
    ("GET", "/filament/1", "read"),
    ("GET", "/spool", "read"),
    ("GET", "/spool/1", "read"),
    ("GET", "/spool/group", "read"),
    ("GET", "/vendor", "read"),
    ("GET", "/vendor/1", "read"),
    ("GET", "/search", "read"),
    ("GET", "/material", "read"),
    ("GET", "/article-number", "read"),
    ("GET", "/lot-number", "read"),
    ("GET", "/location", "read"),
    ("GET", "/external/filament", "read"),
    ("GET", "/external/filament/search", "read"),
    ("GET", "/external/material", "read"),
    ("GET", "/field/spool", "read"),
    ("GET", "/field/spool/some_field/values", "read"),
    # A read-level route even though the payload is settings: reading them is how the
    # client learns the currency and the extra-field definitions.
    ("GET", "/setting/", "read"),
    ("GET", "/setting/currency", "read"),
    # Changing one's own password needs a real signed-in user, not merely read rights,
    # but the level recorded on the gate is read.
    ("POST", "/auth/password", "read"),
    # -- edit -------------------------------------------------------------------
    ("PATCH", "/filament/1", "edit"),
    ("PATCH", "/spool/1", "edit"),
    ("PATCH", "/vendor/1", "edit"),
    ("PATCH", "/location/somewhere", "edit"),
    ("PUT", "/spool/1/use", "edit"),
    ("PUT", "/spool/1/measure", "edit"),
    # -- manage -----------------------------------------------------------------
    ("POST", "/filament", "manage"),
    ("POST", "/spool", "manage"),
    ("POST", "/vendor", "manage"),
    ("DELETE", "/filament/1", "manage"),
    ("DELETE", "/spool/1", "manage"),
    ("DELETE", "/vendor/1", "manage"),
    ("POST", "/setting/currency", "manage"),
    ("POST", "/field/spool/some_field", "manage"),
    ("DELETE", "/field/spool/some_field", "manage"),
    ("POST", "/backup", "manage"),
    # The export routes are manage rather than read on purpose: they hand over the whole
    # database in one response, which is a different thing from browsing it.
    ("GET", "/export/spools?fmt=json", "manage"),
    ("GET", "/export/filaments?fmt=json", "manage"),
    ("GET", "/export/vendors?fmt=json", "manage"),
]

# The routes that must stay reachable with no credentials, mirroring PUBLIC_ROUTES in
# spoolman/api/v1/router.py. /health has to answer before anyone can possibly be signed
# in; the auth endpoints are how a credential is obtained, so gating them is circular.
PUBLIC_ROUTES: list[tuple[str, str]] = [
    ("GET", "/health"),
    ("GET", "/auth/config"),
    ("GET", "/auth/session"),
    ("POST", "/auth/setup"),
    ("POST", "/auth/login"),
    ("POST", "/auth/logout"),
]


def _strip_query(path: str) -> str:
    return path.split("?", 1)[0]


def _template(path: str) -> str:
    """Turn a concrete request path back into its OpenAPI template form."""
    replacements = {
        "/filament/1": "/filament/{filament_id}",
        "/spool/1/use": "/spool/{spool_id}/use",
        "/spool/1/measure": "/spool/{spool_id}/measure",
        "/spool/group": "/spool/group",
        "/spool/1": "/spool/{spool_id}",
        "/vendor/1": "/vendor/{vendor_id}",
        "/setting/currency": "/setting/{key}",
        "/location/somewhere": "/location/{location}",
        "/field/spool/some_field/values": "/field/{entity_type}/{key}/values",
        "/field/spool/some_field": "/field/{entity_type}/{key}",
        "/field/spool": "/field/{entity_type}",
    }
    return replacements.get(path, path)


@pytest.mark.parametrize(
    ("method", "path"),
    [(method, path) for method, path, _ in GATED_ROUTES],
    ids=[f"{method} {path}" for method, path, _ in GATED_ROUTES],
)
def test_gated_route_requires_credentials(anonymous: httpx.Client, method: str, path: str) -> None:
    """A request with no credentials is refused with 401, before any handler runs."""
    result = anonymous.request(method, path, json={} if method in {"POST", "PATCH", "PUT"} else None)
    assert_code(result, 401)
    # The body shape is the same models.Message every other error in this API uses, not
    # FastAPI's default {"detail": ...}. Clients branch on it.
    assert result.json() == {"message": "Authentication required."}


def test_every_gated_route_is_listed() -> None:
    """Guard the count, so a route added without a test entry is noticed."""
    assert len(GATED_ROUTES) == 40


@pytest.mark.parametrize(
    ("method", "path"),
    PUBLIC_ROUTES,
    ids=[f"{method} {path}" for method, path in PUBLIC_ROUTES],
)
def test_public_route_is_reachable(
    setup_response: httpx.Response,  # noqa: ARG001
    anonymous: httpx.Client,
    method: str,
    path: str,
) -> None:
    """A public route answers on its own terms rather than with a permission error.

    Each of these does its own checking, so 'reachable' means 'anything but 401 or 403'.
    The instance is claimed first, which pins the answers: /auth/setup is a conflict
    rather than a fresh claim, and a bogus /auth/login is a credential failure.
    """
    if path == "/auth/setup":
        body = {"username": "impostor", "password": "another-long-password"}
    elif path == "/auth/login":
        body = {"username": "nobody-at-all", "password": "not-the-password"}
    else:
        body = {}

    result = anonymous.request(method, path, json=body if method == "POST" else None)
    assert result.status_code not in {401, 403} or (
        # A wrong password is a 401 from the credential check itself, not from a gate --
        # which is the point: the route was reached.
        path == "/auth/login" and result.json()["message"] == INVALID_CREDENTIALS
    ), f"{method} {path} answered {result.status_code}: {result.text}"


def test_health_is_the_only_public_non_auth_route() -> None:
    """Nothing outside /health and /auth/* may be public."""
    for _, path in PUBLIC_ROUTES:
        assert path == "/health" or path.startswith("/auth/")


def test_route_table_matches_openapi() -> None:
    """The tables above must describe exactly the routes the server serves.

    Fetched from the live server rather than imported, since the tester runs in its own
    container with no access to the Spoolman source. A route added or removed on either
    side fails here, which is what stops this file from silently going stale.
    """
    schema = httpx.get(f"{API_URL}/openapi.json", timeout=TIMEOUT)
    assert_code(schema, 200)

    served = {
        (method.upper(), path)
        for path, operations in schema.json()["paths"].items()
        for method in operations
        if method.upper() != "HEAD"
    }
    expected = {(method, _template(_strip_query(path))) for method, path, _ in GATED_ROUTES}
    expected |= set(PUBLIC_ROUTES)

    assert served == expected, (
        f"Routes served but not in the table: {sorted(served - expected)}. "
        f"Routes in the table but not served: {sorted(expected - served)}."
    )


def test_session_endpoint_reports_signed_out(anonymous: httpx.Client) -> None:
    """GET /auth/session answers for a signed-out caller instead of rejecting them.

    A client needs to tell 'no session' apart from 'server unreachable', so this one
    endpoint must never 401.
    """
    result = anonymous.get("/auth/session")
    assert_code(result, 200)
    info = result.json()
    assert info["authenticated"] is False
    assert info["anonymous"] is False
    assert info["user"] is None


def test_logout_without_a_session_succeeds(anonymous: httpx.Client) -> None:
    """Signing out is idempotent, so a client can always clear its cookies."""
    result = anonymous.post("/auth/logout")
    assert_code(result, 200)


def test_garbage_session_cookie_is_refused(anonymous: httpx.Client) -> None:
    """A made-up session token is not a credential."""
    result = anonymous.get("/spool", headers={"Cookie": f"{SESSION_COOKIE}=not-a-real-token"})
    assert_code(result, 401)
