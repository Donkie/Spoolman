"""API key format, generation and presentation.

A key is presented as ``spoolman_<prefix>.<secret>``. The marker makes a leaked key
recognisable in a log or a paste -- secret scanners key off exactly this kind of fixed
prefix -- and the separated prefix is what makes the lookup a single indexed query
rather than a scan that verifies every stored hash in turn.

The separator is a full stop rather than an underscore because both halves are url-safe
base64, whose alphabet already contains ``-`` and ``_``; splitting on one of those would
cut the key in an unpredictable place.

Keys are hashed for storage with the same plain SHA-256 used for session tokens, and for
the same reason: the secret half is 256 bits from a cryptographic random source, so
there is no dictionary to attack and a work factor would buy nothing while costing tens
of milliseconds on the hot path of every machine request. See
:func:`spoolman.auth.hashing.hash_token`.
"""

import secrets
from typing import Final

from starlette.requests import Request
from starlette.websockets import WebSocket

from spoolman.auth.levels import Level, covers

MARKER: Final = "spoolman_"
SEPARATOR: Final = "."

# 9 bytes is 12 base64 characters, which fits the 16 character prefix column with room
# to spare and leaves 72 bits of collision resistance on a value that only has to be
# unique, not unguessable.
PREFIX_BYTES: Final = 9
SECRET_BYTES: Final = 32

# Both headers are accepted. X-API-Key is what Spoolman's own metrics gate already reads,
# and bearer is what most HTTP clients and Prometheus scrape configs express natively.
API_KEY_HEADER: Final = "x-api-key"
AUTHORIZATION_HEADER: Final = "authorization"
BEARER_SCHEME: Final = "bearer"

# Longest key we will even look at. A key is a fixed ~57 characters; anything much
# larger is either not a key or an attempt to make us hash a megabyte per request.
MAX_KEY_LENGTH: Final = 256


def new_prefix() -> str:
    """Generate the public half of a key.

    Returns:
        str: A 12 character url-safe identifier.

    """
    return secrets.token_urlsafe(PREFIX_BYTES)


def format_key(prefix: str, secret: str) -> str:
    """Assemble the string a caller presents.

    Args:
        prefix: The public identifier.
        secret: The secret half.

    Returns:
        str: The complete key.

    """
    return f"{MARKER}{prefix}{SEPARATOR}{secret}"


def generate() -> tuple[str, str]:
    """Generate a new key.

    Returns:
        tuple: The prefix to store, and the complete key, which is the only time the
        secret exists in a readable form.

    """
    prefix = new_prefix()
    return prefix, format_key(prefix, secrets.token_urlsafe(SECRET_BYTES))


def prefix_of(presented: str) -> str | None:
    """Extract the prefix from a presented key.

    Args:
        presented: The string a caller sent.

    Returns:
        Optional[str]: The prefix, or None if the string is not shaped like a key. A
        None here means no database query happens at all, which is what keeps a flood
        of junk credentials from becoming a flood of lookups.

    """
    if not presented or len(presented) > MAX_KEY_LENGTH or not presented.startswith(MARKER):
        return None
    head, separator, tail = presented.partition(SEPARATOR)
    if not separator or not tail:
        return None
    prefix = head[len(MARKER) :]
    return prefix or None


def presented_key(conn: Request | WebSocket) -> str:
    """Read the API key a request carries, if any.

    Args:
        conn: The request or websocket.

    Returns:
        str: The presented key, or an empty string.

    """
    presented = conn.headers.get(API_KEY_HEADER, "").strip()
    if presented:
        return presented
    scheme, _, value = conn.headers.get(AUTHORIZATION_HEADER, "").partition(" ")
    if scheme.lower() == BEARER_SCHEME:
        return value.strip()
    return ""


def effective_level(key_level: Level, user_level: Level) -> Level:
    """Work out what a key may actually do.

    A key never exceeds its owner. The cap is applied here, on every request, rather
    than being baked into the stored level at creation time, so that demoting a user
    weakens their existing keys immediately instead of leaving credentials in the wild
    that outrank the account they belong to.

    Args:
        key_level: The level the key was issued with.
        user_level: The level its owner currently holds.

    Returns:
        Level: The weaker of the two.

    """
    return user_level if covers(key_level, user_level) else key_level
