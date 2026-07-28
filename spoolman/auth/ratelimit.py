"""Login throttling and client address resolution.

The windows are in-process dictionaries. That is sound here because Spoolman's
deployment contract is exactly one process -- the same assumption the websocket manager
and the scheduler already make -- but it does mean the counters reset on restart. Account
lockout is therefore also persisted on ``auth_user``; this module only provides the
cheap first line of defence that never touches the database.
"""

import time
from collections import deque
from dataclasses import dataclass
from datetime import timedelta
from ipaddress import IPv4Network, IPv6Network, ip_address, ip_network
from typing import Final

from starlette.requests import Request
from starlette.websockets import WebSocket

from spoolman import env

FORWARDED_FOR: Final = "x-forwarded-for"
FORWARDED_PROTO: Final = "x-forwarded-proto"


@dataclass(frozen=True, slots=True)
class Decision:
    """The outcome of a rate limit check."""

    allowed: bool
    retry_after: int = 0


class SlidingWindow:
    """Counts events per key over a moving time window."""

    def __init__(self, *, limit: int, window: timedelta) -> None:
        """Create a window.

        Args:
            limit: How many events are allowed within the window.
            window: How far back the window reaches.

        """
        self._limit = limit
        self._window = window.total_seconds()
        self._events: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> deque[float] | None:
        """Drop expired events for a key, forgetting the key entirely once empty."""
        events = self._events.get(key)
        if events is None:
            return None
        cutoff = now - self._window
        while events and events[0] <= cutoff:
            events.popleft()
        if not events:
            del self._events[key]
            return None
        return events

    def check(self, key: str) -> Decision:
        """Test whether an event would be allowed, without recording it.

        Args:
            key: The identity being limited.

        Returns:
            Decision: Whether to allow, and how long to wait if not.

        """
        now = time.monotonic()
        events = self._prune(key, now)
        if events is None or len(events) < self._limit:
            return Decision(allowed=True)
        retry_after = int(events[0] + self._window - now) + 1
        return Decision(allowed=False, retry_after=max(retry_after, 1))

    def hit(self, key: str) -> None:
        """Record an event against a key.

        Args:
            key: The identity being limited.

        """
        now = time.monotonic()
        self._prune(key, now)
        self._events.setdefault(key, deque()).append(now)

    def clear(self, key: str) -> None:
        """Forget a key's history, called after a successful login.

        Args:
            key: The identity to reset.

        """
        self._events.pop(key, None)


# Keyed by username, so guessing one account's password does not lock out the instance.
user_window: Final = SlidingWindow(limit=5, window=timedelta(minutes=15))

# Keyed by client address, to blunt spraying across many usernames from one source.
ip_window: Final = SlidingWindow(limit=20, window=timedelta(minutes=15))


def _parse_network(entry: str) -> IPv4Network | IPv6Network | None:
    """Parse one trusted-proxy entry, returning None if it is not an address or network."""
    try:
        return ip_network(entry, strict=False)
    except ValueError:
        return None


def _trusted_networks() -> list[IPv4Network | IPv6Network]:
    """Parse SPOOLMAN_TRUSTED_PROXIES, skipping entries that are not addresses."""
    parsed = (_parse_network(entry) for entry in env.get_trusted_proxies())
    return [network for network in parsed if network is not None]


def is_trusted_peer(peer: str | None) -> bool:
    """Check whether forwarding headers from an address may be believed.

    Args:
        peer: The address the connection actually came from.

    Returns:
        bool: True if the address is covered by SPOOLMAN_TRUSTED_PROXIES.

    """
    if not peer:
        return False
    try:
        address = ip_address(peer)
    except ValueError:
        return False
    return any(address in network for network in _trusted_networks())


def client_ip(conn: Request | WebSocket) -> str:
    """Determine the address a request came from.

    X-Forwarded-For is honoured only when the immediate peer is a configured trusted
    proxy. Without that check any client could spoof the header and evade rate limiting
    by varying it.

    Args:
        conn: The request or websocket.

    Returns:
        str: The client address, or an empty string if it cannot be determined.

    """
    peer = conn.client.host if conn.client else ""
    if is_trusted_peer(peer):
        forwarded = conn.headers.get(FORWARDED_FOR)
        if forwarded:
            return forwarded.split(",")[0].strip()
    return peer


def forwarded_proto(conn: Request | WebSocket) -> str | None:
    """Read the originating scheme reported by a trusted proxy.

    Args:
        conn: The request or websocket.

    Returns:
        Optional[str]: The scheme, or None if there is no trustworthy header.

    """
    if not is_trusted_peer(conn.client.host if conn.client else ""):
        return None
    proto = conn.headers.get(FORWARDED_PROTO)
    if not proto:
        return None
    return proto.split(",")[0].strip().lower()
