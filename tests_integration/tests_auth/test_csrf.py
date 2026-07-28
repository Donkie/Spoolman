"""Integration tests: cross-site request forgery protection.

The session cookie is ambient -- the browser attaches it to any same-origin request,
including ones a hostile page caused. The defence is a double submit: a second, readable
cookie whose value must be echoed in a header. A cross-site page can make the browser
send the cookies but cannot read them, so it cannot construct the header.

The rejection is 403 and not 401 on purpose. The credential is valid; answering 401
would make a client treat a stale tab as a sign-out.
"""

import httpx

from .conftest import (
    CSRF_COOKIE,
    CSRF_HEADER,
    assert_code,
    signed_in,
)


def test_post_without_csrf_header_is_forbidden(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """A cookie-authenticated write with no CSRF header is refused."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        # signed_in attaches the header; drop it to model a request the client did not make.
        del client.headers[CSRF_HEADER]

        result = client.post("/vendor", json={"name": "CSRF test vendor"})
        assert_code(result, 403)
        assert "csrf" in result.json()["message"].lower()


def test_post_with_mismatched_csrf_header_is_forbidden(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """The header has to match the cookie, not merely be present."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        client.headers[CSRF_HEADER] = "not-the-token-from-the-cookie"

        result = client.post("/vendor", json={"name": "CSRF test vendor"})
        assert_code(result, 403)


def test_post_with_csrf_header_succeeds(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """With the cookie echoed into the header the write goes through."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        assert client.headers[CSRF_HEADER] == client.cookies.get(CSRF_COOKIE)

        result = client.post("/vendor", json={"name": "CSRF test vendor"})
        assert_code(result, 200)
        vendor = result.json()
        try:
            assert vendor["name"] == "CSRF test vendor"
        finally:
            assert_code(client.delete(f"/vendor/{vendor['id']}"), 200)


def test_reads_do_not_need_a_csrf_token(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """Safe methods change nothing, so they are exempt.

    Requiring a header on GET would break every plain link and bookmark for no gain.
    """
    with signed_in() as (client, response):
        assert_code(response, 200)
        del client.headers[CSRF_HEADER]

        assert_code(client.get("/spool"), 200)
        assert_code(client.get("/vendor"), 200)
        assert_code(client.get("/setting/"), 200)


def test_every_unsafe_method_is_checked(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """The check covers every state-changing method, not just POST."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        created = client.post("/vendor", json={"name": "CSRF delete test vendor"})
        assert_code(created, 200)
        vendor_id = created.json()["id"]

        try:
            del client.headers[CSRF_HEADER]
            assert_code(client.delete(f"/vendor/{vendor_id}"), 403)
            assert_code(client.patch(f"/vendor/{vendor_id}", json={"comment": "nope"}), 403)
            assert_code(client.put("/spool/1/use", json={"use_weight": 1}), 403)
        finally:
            client.headers[CSRF_HEADER] = client.cookies.get(CSRF_COOKIE)
            assert_code(client.delete(f"/vendor/{vendor_id}"), 200)
