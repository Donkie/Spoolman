"""Session cookie and CSRF handling.

The session cookie holds an opaque token and is ``HttpOnly``, so script cannot read it.
Because it is sent automatically on same-origin requests it is an ambient credential and
needs CSRF protection, which is done by double submit: a second, script-readable cookie
carries a random value that the client must echo in a request header. An attacker's page
can cause the browser to send the cookies but cannot read them to construct the header.

API keys, once they arrive in phase 2, are exempt -- they are not ambient, so a
cross-site page has no way to attach one.
"""

from datetime import timedelta
from typing import Final

from starlette.requests import Request
from starlette.responses import Response
from starlette.websockets import WebSocket

from spoolman import env
from spoolman.auth import ratelimit
from spoolman.auth.hashing import tokens_equal

SESSION_COOKIE: Final = "spoolman_session"
CSRF_COOKIE: Final = "spoolman_csrf"
CSRF_HEADER: Final = "X-CSRF-Token"

# Sessions without "remember me" expire this long after they were last used.
IDLE_LIFETIME: Final = timedelta(hours=12)

# Sessions with "remember me" last this long, sliding forward as they are used.
REMEMBER_LIFETIME: Final = timedelta(days=90)

# Methods that do not change state, and so do not require a CSRF token.
SAFE_METHODS: Final = frozenset({"GET", "HEAD", "OPTIONS"})


def cookie_path() -> str:
    """Get the path cookies are scoped to.

    Returns:
        str: The deployment's base path with a trailing slash.

    """
    return env.get_base_path() + "/"


def cookie_secure(conn: Request | WebSocket) -> bool:
    """Decide whether cookies should carry the Secure flag.

    Setting Secure on a plain-HTTP deployment makes the browser silently discard the
    cookie, which presents as a login that appears to succeed and then does nothing. The
    automatic path therefore only concludes HTTPS from positive evidence: either the
    request arrived over TLS, or a proxy we have been told to trust says it did.

    Args:
        conn: The request or websocket.

    Returns:
        bool: Whether to set the Secure flag.

    """
    override = env.get_cookie_secure_override()
    if override is not None:
        return override
    if conn.url.scheme in {"https", "wss"}:
        return True
    return ratelimit.forwarded_proto(conn) == "https"


def set_session_cookies(
    response: Response,
    conn: Request,
    *,
    token: str,
    csrf: str,
    remember: bool,
) -> None:
    """Attach the session and CSRF cookies to a response.

    Args:
        response: The response to modify.
        conn: The request being answered, used to derive the Secure flag.
        token: The plaintext session token.
        csrf: The plaintext CSRF token.
        remember: Whether the session should outlive the browser session.

    """
    secure = cookie_secure(conn)
    path = cookie_path()
    max_age = int(REMEMBER_LIFETIME.total_seconds()) if remember else None

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        path=path,
        secure=secure,
        httponly=True,
        samesite="lax",
    )
    # Readable by script on purpose: the client has to copy it into a request header.
    response.set_cookie(
        CSRF_COOKIE,
        csrf,
        max_age=max_age,
        path=path,
        secure=secure,
        httponly=False,
        samesite="lax",
    )


def clear_session_cookies(response: Response, conn: Request) -> None:
    """Remove the session and CSRF cookies.

    Args:
        response: The response to modify.
        conn: The request being answered, used to derive the Secure flag.

    """
    secure = cookie_secure(conn)
    path = cookie_path()
    for name in (SESSION_COOKIE, CSRF_COOKIE):
        response.delete_cookie(name, path=path, secure=secure, httponly=name == SESSION_COOKIE, samesite="lax")


def verify_csrf(request: Request) -> bool:
    """Check the CSRF double-submit for a state-changing request.

    Args:
        request: The request to check.

    Returns:
        bool: True if the request may proceed.

    """
    if request.method.upper() in SAFE_METHODS:
        return True
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not header:
        return False
    return tokens_equal(cookie, header)
