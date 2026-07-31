"""Origin and host trust decisions, shared by the CSRF, websocket and DNS rebinding guards.

Spoolman has no authentication by design; the boundary that protects a user's data is the
network. This module answers the two questions those guards need: "is this browser origin
someone we trust?" and "is this a hostname we answer to?".

The second is a separate axis and is documented on :func:`is_allowed_host`; the rest of this
docstring is about the first.

The answer is driven entirely by ``SPOOLMAN_CORS_ORIGIN``, which is already an operator-declared
origin allowlist. An operator who allowlists an origin for CORS has declared it trusted to make
credentialed cross-origin requests, so refusing that same origin here would break the very
deployment CORS was configured for. Deliberately no second environment variable: two variables
answering one question would drift apart, and there is nothing a second one could express that
this one cannot.

Three cases, in the operator's terms:

* Unset -- the case for nearly every deployment -- means "same-origin only". Non-browser clients
  such as Moonraker and OctoPrint send no ``Origin`` at all and are unaffected.
* A list of origins means "these, plus my own". This is the same declaration CORS already needs.
* ``*`` means "I do not want origin checks", and is honoured as such: it is what an operator
  reaches for to opt out, so quietly reinterpreting it as something narrower would only leave
  them with no way to say what they meant. Debug mode implies the same thing. Both are logged
  loudly at startup.

Deployments behind a reverse proxy that rewrites ``Host`` are handled without any configuration
by also accepting ``X-Forwarded-Host``; see :func:`is_trusted_request`.
"""

import ipaddress
import logging
from functools import cache
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from starlette.requests import HTTPConnection
from starlette.responses import JSONResponse

from spoolman import env

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

WILDCARD_ORIGIN = "*"

# Methods that can change state. Safe methods are left alone: the same-origin policy already
# stops a cross-origin page from reading their responses, and OPTIONS must stay reachable for
# CORS preflight to work at all.
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Websocket close code used when a handshake is refused. In the 4000-4999 range reserved for
# application use, and deliberately echoes HTTP 403.
WS_CLOSE_FORBIDDEN = 4403

# An origin of "null" is what a browser sends from a sandboxed iframe, a data: URL or a
# file:// page. It identifies nobody, so it can never be trusted.
_OPAQUE_ORIGIN = "null"

_DEFAULT_PORTS = {"http": ":80", "https": ":443"}

# Websocket close code used when a handshake is refused for its Host. Echoes HTTP 400, the status
# Starlette's own TrustedHostMiddleware uses for the same condition.
WS_CLOSE_BAD_HOST = 4400

# Suffixes that cannot be registered on the public internet, so no attacker can point one of them
# at a victim's LAN address: mDNS (RFC 6762), the RFC 8375 home domain, and the conventional
# private-network suffixes router vendors hand out.
_LOCAL_HOST_SUFFIXES = (".local", ".localhost", ".lan", ".home", ".home.arpa", ".internal")


@cache
def _warn_all_origins_trusted(reason: str) -> None:
    """Warn that origin checks are disabled. Cached so it is logged only once per process."""
    logger.warning(
        "%s, so origin checks are disabled. Any website you visit in a browser that can reach this "
        "Spoolman instance is able to read and modify your data. Only use this on a trusted network; "
        "otherwise list the origins you actually need instead.",
        reason,
    )


def _authority(origin: str) -> str:
    """Extract the ``host[:port]`` part of an already-normalized origin.

    A port that is the default for the scheme is dropped, so that ``https://spoolman.local:443``
    and ``https://spoolman.local`` compare equal to a ``Host`` of ``spoolman.local``.

    Args:
        origin: A normalized origin, e.g. ``https://spoolman.local:7912``.

    Returns:
        str: The authority, or an empty string if the origin has no host part.

    """
    parts = urlsplit(origin)
    default_port = _DEFAULT_PORTS.get(parts.scheme)
    if default_port is not None:
        return parts.netloc.removesuffix(default_port)
    return parts.netloc


def _normalize_host(host: str) -> str:
    """Normalize a ``Host`` header for comparison against an origin's authority.

    Args:
        host: The raw ``Host`` header value, e.g. ``Spoolman.local:7912``.

    Returns:
        str: The normalized host.

    """
    host = host.strip().lower()
    # The scheme is unknown here, so drop whichever default port is present.
    return host.removesuffix(":80").removesuffix(":443")


def _own_hosts(host: str, forwarded_host: str | None) -> set[str]:
    """Collect the hostnames that identify this instance, as the browser could have addressed it.

    Args:
        host: The request's ``Host`` header.
        forwarded_host: The request's ``X-Forwarded-Host`` header, if any. A chain of proxies
            appends to this header, so only the first entry -- the host the browser actually
            asked for -- is considered.

    Returns:
        set[str]: The normalized hostnames.

    """
    hosts = {_normalize_host(host)}
    if forwarded_host:
        hosts.add(_normalize_host(forwarded_host.split(",")[0]))
    hosts.discard("")
    return hosts


def trusts_all_origins() -> bool:
    """Determine whether the operator has opted out of origin checks entirely.

    That is either ``SPOOLMAN_CORS_ORIGIN=*`` or debug mode, which already declares that all
    origins are allowed. Both are logged once, loudly.

    Returns:
        bool: Whether every origin should be trusted.

    """
    if env.is_debug_mode():
        _warn_all_origins_trusted("Running in debug mode")
        return True
    if WILDCARD_ORIGIN in (env.get_cors_origin() or []):
        _warn_all_origins_trusted(f"SPOOLMAN_CORS_ORIGIN is set to '{WILDCARD_ORIGIN}'")
        return True
    return False


def get_trusted_origins() -> set[str]:
    """Get the set of normalized origins the operator has explicitly declared trusted.

    Does not account for the wildcard; see :func:`trusts_all_origins` for that.

    Returns:
        set[str]: The trusted origins. Empty when nothing was configured.

    """
    return {origin for origin in env.get_cors_origin() or [] if origin != WILDCARD_ORIGIN}


def is_trusted_origin(origin: str | None, host: str, forwarded_host: str | None = None) -> bool:
    """Determine whether a request's browser origin is trusted.

    Returns True for every origin when the operator has opted out via ``SPOOLMAN_CORS_ORIGIN=*``
    or debug mode.

    Args:
        origin: The request's ``Origin`` header, if any. An absent header means either a
            same-origin navigation or a non-browser client such as Moonraker or OctoPrint,
            neither of which the same-origin policy applies to, so both are trusted.
        host: The request's own ``Host`` header. An origin pointing at the host the request
            was made to is by definition same-origin.
        forwarded_host: The request's ``X-Forwarded-Host`` header, if any. See
            :func:`is_trusted_request` for why this is trusted.

    Returns:
        bool: Whether the origin is trusted.

    """
    if origin is None or not origin.strip():
        return True

    if trusts_all_origins():
        return True

    normalized = env.normalize_origin(origin)
    if normalized == _OPAQUE_ORIGIN:
        return False

    if normalized in get_trusted_origins():
        return True

    authority = _authority(normalized)
    return bool(authority) and authority in _own_hosts(host, forwarded_host)


def is_trusted_request(connection: HTTPConnection) -> bool:
    """Determine whether a request or websocket handshake comes from a trusted origin.

    This is the entry point for the CSRF and websocket guards; it accepts both a ``Request``
    and a ``WebSocket``.

    ``X-Forwarded-Host`` is honoured because the reverse proxies that need it are exactly the
    ones that break the ``Origin``/``Host`` comparison: nginx without ``proxy_set_header Host
    $host`` and Apache without ``ProxyPreserveHost On`` replace ``Host`` with the backend's
    address, but set ``X-Forwarded-Host`` to what the browser asked for. Without it those
    deployments would see the guard reject their own web UI.

    Honouring it does not weaken the guard against the attacks it exists to stop, because a
    malicious page cannot set the header on any of them: an HTML form cannot set request headers
    at all, the browser websocket API cannot either, and a ``fetch`` that adds one stops being a
    simple request, so it needs a CORS preflight that an untrusted origin will not get. A
    non-browser client can forge it freely, but it can equally forge ``Origin`` and ``Host``, and
    the guard never defended against those -- an absent ``Origin`` is trusted by design so that
    Moonraker and OctoPrint keep working.

    Args:
        connection: The incoming HTTP request or websocket connection.

    Returns:
        bool: Whether the connection is trusted.

    """
    headers = connection.headers
    return is_trusted_origin(
        headers.get("origin"),
        headers.get("host", ""),
        headers.get("x-forwarded-host"),
    )


def _hostname(value: str) -> str:
    """Reduce a ``Host``-style header value to a bare hostname, without its port.

    Args:
        value: A raw header value, e.g. ``Spoolman.local:7912`` or ``[::1]:7912``.

    Returns:
        str: The normalized hostname.

    """
    host = value.strip().lower()
    if host.startswith("["):
        # An IPv6 literal is bracketed, so its own colons are not port separators.
        host = host.partition("]")[0].removeprefix("[")
    else:
        host = host.partition(":")[0]
    # A fully-qualified name may carry the trailing root dot; it names the same host.
    return host.rstrip(".")


def _is_ip_literal(host: str) -> bool:
    """Determine whether a hostname is an IP address rather than a name."""
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def _matches_host_pattern(host: str, pattern: str) -> bool:
    """Match a hostname against one allowlist entry, where a leading ``*.`` is a subdomain wildcard.

    ``*.example.com`` matches ``example.com`` as well as its subdomains: an operator who writes
    the wildcard means the domain, and having to list the apex separately only invites a
    confusing half-working deployment.

    Args:
        host: The normalized hostname from the request.
        pattern: One entry from the allowlist.

    Returns:
        bool: Whether the hostname matches.

    """
    if pattern == WILDCARD_ORIGIN:
        return True
    if pattern.startswith("*."):
        return host == pattern.removeprefix("*.") or host.endswith(pattern.removeprefix("*"))
    return host == pattern


def get_allowed_hostnames() -> set[str]:
    """Get the hostname patterns the operator has explicitly declared this instance answers to.

    That is ``SPOOLMAN_ALLOWED_HOSTS``, plus the hostnames inside ``SPOOLMAN_CORS_ORIGIN`` -- an
    operator who declared an origin has necessarily declared the hostname inside it, so a
    deployment that already configured CORS needs no second variable.

    Returns:
        set[str]: The hostname patterns. Empty when nothing was configured.

    """
    patterns = set(env.get_allowed_hosts() or [])
    return patterns | {_hostname(_authority(origin)) for origin in get_trusted_origins()} - {""}


def is_allowed_host(host: str, forwarded_host: str | None = None) -> bool:
    """Determine whether this instance may be addressed by the hostname a request used.

    This is a different axis from :func:`is_trusted_origin`, and it closes a hole that one cannot:
    in a DNS rebinding attack the attacker's page keeps its own name, so ``Origin`` and ``Host``
    agree with each other and the origin guard trusts them both -- while the address behind that
    name is the victim's Spoolman instance. Checking that the *name* is one this instance could
    plausibly answer to is what breaks that.

    Everything that cannot be pointed at a victim's machine by a stranger is allowed by default,
    which is nearly every real deployment:

    * IP literals. The browser then connected to that address directly, with no name to rebind.
    * Single-label names (``spoolman``, a Docker service name). Not registrable on the public
      internet, so an attacker cannot own one.
    * The non-registrable suffixes in :data:`_LOCAL_HOST_SUFFIXES` (``.local``, ``.lan``, ...).
    * Anything in :func:`get_allowed_hostnames`.

    What is left over is a registrable public domain the operator never mentioned -- which is both
    the shape of the attack and, unavoidably, the shape of a reverse proxy on a real domain. Those
    deployments set ``SPOOLMAN_ALLOWED_HOSTS``.

    Args:
        host: The request's ``Host`` header. An absent one is allowed: browsers always send it,
            so its absence means a non-browser client, which is not what rebinding attacks use.
        forwarded_host: The request's ``X-Forwarded-Host`` header, if any. Checked as well as
            ``Host``, because :func:`is_trusted_request` accepts it as this instance's identity,
            so leaving it unchecked would hand back the hole this function closes.

    Returns:
        bool: Whether every hostname the request claims is allowed.

    """
    if trusts_all_origins():
        return True
    return all(_is_allowed_hostname(claimed) for claimed in _claimed_hosts(host, forwarded_host))


def _claimed_hosts(host: str, forwarded_host: str | None) -> set[str]:
    """Collect the bare hostnames a request claims to have been addressed by."""
    hosts = {_hostname(host)}
    if forwarded_host:
        # A chain of proxies appends to this header; the first entry is what the browser asked for.
        hosts.add(_hostname(forwarded_host.split(",")[0]))
    hosts.discard("")
    return hosts


def _is_allowed_hostname(host: str) -> bool:
    """Apply the default-allow rules documented on :func:`is_allowed_host` to one hostname."""
    if any(_matches_host_pattern(host, pattern) for pattern in get_allowed_hostnames()):
        return True
    if _is_ip_literal(host):
        return True
    if "." not in host:
        return True
    return host.endswith(_LOCAL_HOST_SUFFIXES)


def describe_allowed_hosts() -> str:
    """Describe the host policy for the startup log, in the operator's terms."""
    configured = sorted(get_allowed_hostnames())
    default = "IP addresses, single-label names and " + ", ".join(f"*{suffix}" for suffix in _LOCAL_HOST_SUFFIXES)
    if configured:
        return f"{default}, plus {configured}"
    return default


class TrustedHostMiddleware:
    """Refuse requests addressed to a hostname this instance has no reason to answer to.

    This is the DNS rebinding guard. Without it, a page on any website can make the browser treat
    that site's own name as Spoolman's -- passing the origin guard, since the page's origin then
    genuinely matches the host it asked for -- and read and write the whole inventory.

    Applied to every request and handshake, not only the state-changing ones: a rebound name is
    same-origin as far as the browser is concerned, so the attacker can read the responses too.
    """

    def __init__(self, app: "ASGIApp") -> None:
        """Wrap the given ASGI application."""
        self.app = app

    async def __call__(self, scope: "Scope", receive: "Receive", send: "Send") -> None:
        """Reject the connection if its Host is not one we answer to, otherwise pass it through."""
        if scope["type"] in {"http", "websocket"}:
            headers = HTTPConnection(scope).headers
            host = headers.get("host", "")
            forwarded_host = headers.get("x-forwarded-host")
            if not is_allowed_host(host, forwarded_host):
                await self._refuse(scope, receive, send, host, forwarded_host)
                return
        await self.app(scope, receive, send)

    async def _refuse(
        self,
        scope: "Scope",
        receive: "Receive",
        send: "Send",
        host: str,
        forwarded_host: str | None,
    ) -> None:
        """Close the connection, and log enough for an operator to see what to configure."""
        logger.warning(
            "Refused a request addressed to an unknown host. Host: %r, X-Forwarded-Host: %r, path: %r. "
            "If this is how you reach Spoolman, add the hostname to SPOOLMAN_ALLOWED_HOSTS.",
            host,
            forwarded_host,
            scope.get("path"),
        )
        if scope["type"] == "websocket":
            # The ASGI server expects the connect message to be consumed before a close is sent.
            await receive()
            await send({"type": "websocket.close", "code": WS_CLOSE_BAD_HOST})
            return
        response = JSONResponse(
            status_code=400,
            content={
                "message": (
                    "Request refused: it was addressed to a hostname this Spoolman instance does not "
                    "answer to. If you reach Spoolman on a public domain name, list it in "
                    "SPOOLMAN_ALLOWED_HOSTS."
                ),
            },
        )
        await response(scope, receive, send)


class TrustedOriginMiddleware:
    """Refuse state-changing requests and websocket handshakes from untrusted browser origins.

    Spoolman has no authentication, so without this a page on any website the user happens to
    visit can make their browser write to a Spoolman instance it can reach (a form post needs no
    CORS preflight), and can open a websocket to it (websockets are exempt from CORS entirely).

    A single middleware rather than a per-endpoint dependency, so that an endpoint added later
    cannot forget to opt in.
    """

    def __init__(self, app: "ASGIApp") -> None:
        """Wrap the given ASGI application."""
        self.app = app

    async def __call__(self, scope: "Scope", receive: "Receive", send: "Send") -> None:
        """Reject the connection if its origin is not trusted, otherwise pass it through."""
        # Every websocket handshake is guarded, since websockets are exempt from CORS and are
        # readable by the page that opens them. Of plain HTTP only the state-changing methods are.
        guarded = scope["type"] == "websocket" or (scope["type"] == "http" and scope["method"] in UNSAFE_METHODS)
        if guarded:
            connection = HTTPConnection(scope)
            if not is_trusted_request(connection):
                await self._refuse(scope, receive, send, connection)
                return
        await self.app(scope, receive, send)

    async def _refuse(
        self,
        scope: "Scope",
        receive: "Receive",
        send: "Send",
        connection: HTTPConnection,
    ) -> None:
        """Close the connection, and log enough for an operator to see why."""
        logger.warning(
            "Refused a %s from an untrusted origin. Origin: %r, Host: %r, X-Forwarded-Host: %r, path: %r. "
            "If this was you, add the origin to SPOOLMAN_CORS_ORIGIN.",
            "websocket handshake" if scope["type"] == "websocket" else scope["method"] + " request",
            connection.headers.get("origin"),
            connection.headers.get("host"),
            connection.headers.get("x-forwarded-host"),
            scope.get("path"),
        )
        if scope["type"] == "websocket":
            # The ASGI server expects the connect message to be consumed before a close is sent.
            await receive()
            await send({"type": "websocket.close", "code": WS_CLOSE_FORBIDDEN})
            return
        response = JSONResponse(
            status_code=403,
            content={
                "message": (
                    "Request refused: it came from an origin this Spoolman instance does not trust. "
                    "Set SPOOLMAN_CORS_ORIGIN if this origin should be allowed."
                ),
            },
        )
        await response(scope, receive, send)
