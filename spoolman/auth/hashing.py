"""Password and token hashing.

Passwords use :func:`hashlib.scrypt`. The alternatives normally reached for --
``argon2-cffi`` and ``bcrypt`` -- ship compiled wheels that are unavailable or painful
on the armv7 image Spoolman still builds, whereas scrypt is in the standard library and
is a memory-hard function in its own right.

Every hash records the parameters it was produced with, so the cost can be raised later
without a migration: :func:`verify_password` re-derives using the parameters embedded in
the stored string, and :func:`needs_rehash` reports when a stored hash predates a change
so the login path can opportunistically upgrade it.

Deriving a hash blocks for tens to hundreds of milliseconds depending on hardware
(measured at 49 ms on a desktop, several times that on a Raspberry Pi). Spoolman runs as
a single process, so a synchronous call in a request handler would stall every other
request and every websocket ping for that whole time. scrypt releases the GIL, so the
``_async`` wrappers below genuinely offload to a worker thread; request handlers must
use those and never the synchronous forms.
"""

import base64
import hashlib
import hmac
import secrets
from typing import Final

import anyio.to_thread

# Cost parameters. n is the CPU/memory cost, r the block size, p the parallelisation.
# Memory use is roughly 128 * r * n bytes, so this costs ~16 MiB and ~50 ms per hash on
# a desktop. OWASP's headline scrypt recommendation is n=2**17, which is eight times
# this and would be multi-second on the low-power ARM boards that Spoolman commonly runs
# on -- unacceptable for an interactive login. Their memory-constrained alternative
# raises p instead, which costs the same wall-clock time without the memory hardness.
SCRYPT_N: Final = 2**14
SCRYPT_R: Final = 8
SCRYPT_P: Final = 1
SCRYPT_DKLEN: Final = 32
SALT_BYTES: Final = 16

# OpenSSL caps scrypt's allocation at 32 MiB when maxmem is left at 0, which n=2**14
# fits under. It is passed explicitly so that raising SCRYPT_N later fails loudly at the
# parameter change rather than obscurely inside OpenSSL.
SCRYPT_MAXMEM: Final = 64 * 1024 * 1024

ALGORITHM: Final = "scrypt"
TOKEN_BYTES: Final = 32


def _b64encode(raw: bytes) -> str:
    """Encode bytes as unpadded url-safe base64."""
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    """Decode unpadded url-safe base64."""
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _derive(password: str, salt: bytes, n: int, r: int, p: int, dklen: int) -> bytes:
    """Run scrypt with explicit parameters."""
    return hashlib.scrypt(
        password.encode(),
        salt=salt,
        n=n,
        r=r,
        p=p,
        dklen=dklen,
        maxmem=SCRYPT_MAXMEM,
    )


def _format(salt: bytes, derived: bytes, n: int, r: int, p: int) -> str:
    """Build the stored representation of a hash."""
    return f"{ALGORITHM}${n}${r}${p}${_b64encode(salt)}${_b64encode(derived)}"


def _parse(encoded: str) -> tuple[int, int, int, bytes, bytes]:
    """Split a stored hash into its parameters, salt and digest.

    Args:
        encoded: The stored hash string.

    Raises:
        ValueError: If the string is not a well-formed scrypt hash.

    Returns:
        tuple: n, r, p, salt and the expected digest.

    """
    parts = encoded.split("$")
    expected_parts = 6
    if len(parts) != expected_parts or parts[0] != ALGORITHM:
        raise ValueError("Malformed password hash.")
    try:
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        return n, r, p, _b64decode(parts[4]), _b64decode(parts[5])
    except (ValueError, TypeError) as exc:
        raise ValueError("Malformed password hash.") from exc


def hash_password(password: str) -> str:
    """Hash a password for storage.

    Args:
        password: The plaintext password.

    Returns:
        str: The encoded hash, including the parameters used.

    """
    salt = secrets.token_bytes(SALT_BYTES)
    derived = _derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN)
    return _format(salt, derived, SCRYPT_N, SCRYPT_R, SCRYPT_P)


def verify_password(password: str, encoded: str) -> bool:
    """Check a password against a stored hash.

    Args:
        password: The plaintext password to check.
        encoded: The stored hash.

    Returns:
        bool: True if the password matches. False if it does not, and also if the stored
        hash is unreadable -- a corrupt hash must never authenticate anyone.

    """
    try:
        n, r, p, salt, expected = _parse(encoded)
    except ValueError:
        return False
    derived = _derive(password, salt, n, r, p, len(expected))
    return hmac.compare_digest(derived, expected)


def needs_rehash(encoded: str) -> bool:
    """Check whether a stored hash was produced with outdated parameters.

    Args:
        encoded: The stored hash.

    Returns:
        bool: True if the hash should be recomputed on the next successful login.

    """
    try:
        n, r, p, _, expected = _parse(encoded)
    except ValueError:
        return True
    return (n, r, p, len(expected)) != (SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN)


# A real hash of a random password, derived once at import. Verifying against this costs
# the same as verifying a real account, which is what lets the login path spend equal
# time on unknown and known usernames.
_DUMMY_ENCODED: Final = hash_password(secrets.token_urlsafe(32))


def dummy_verify() -> None:
    """Spend the same time a real verification would.

    Called on login paths that fail before reaching a password check -- unknown
    username, disabled account, or an account with no password set -- so that response
    timing does not reveal which accounts exist.
    """
    verify_password("", _DUMMY_ENCODED)


async def hash_password_async(password: str) -> str:
    """Hash a password on a worker thread.

    Args:
        password: The plaintext password.

    Returns:
        str: The encoded hash.

    """
    return await anyio.to_thread.run_sync(hash_password, password)


async def verify_password_async(password: str, encoded: str) -> bool:
    """Check a password on a worker thread.

    Args:
        password: The plaintext password to check.
        encoded: The stored hash.

    Returns:
        bool: True if the password matches.

    """
    return await anyio.to_thread.run_sync(verify_password, password, encoded)


async def dummy_verify_async() -> None:
    """Spend a verification's worth of time on a worker thread."""
    await anyio.to_thread.run_sync(dummy_verify)


def new_token() -> str:
    """Generate an opaque credential.

    Returns:
        str: A url-safe 256-bit random token.

    """
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    """Hash a token for storage.

    A plain SHA-256 with no salt and no stretching, unlike passwords. Tokens are 256
    bits of output from a cryptographic random source, so there is no dictionary to
    attack and nothing for a work factor to buy; the digest is here so that a database
    leak does not hand over usable session cookies. The fixed 64-character output also
    lets the column be indexed for lookup.

    Args:
        token: The plaintext token.

    Returns:
        str: The hex digest.

    """
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_equal(left: str, right: str) -> bool:
    """Compare two tokens without leaking their contents through timing.

    Args:
        left: One token.
        right: The other.

    Returns:
        bool: True if equal.

    """
    return hmac.compare_digest(left, right)
