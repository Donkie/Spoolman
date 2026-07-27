"""The instance secret key.

Resolution order is ``SPOOLMAN_SECRET_KEY_FILE``, then ``SPOOLMAN_SECRET_KEY``, then an
auto-generated ``secret.key`` in the data directory. The generated file is created with
mode 0600 via an exclusive open, rather than a write followed by a chmod, so its
contents are never briefly readable under a permissive umask.

Phase 1 does not use the key for anything cryptographic: session tokens are opaque
256-bit random values stored as SHA-256 digests, and CSRF protection is a double-submit
cookie comparison. The key exists now because it is consumed from phase 3 onward (OIDC
state signing) and phase 4 (Fernet encryption of TOTP secrets), and introducing it later
would force every phase-1 adopter to reconfigure. Resolving it at startup also proves,
at a point where the error message is actionable, that the data directory is writable
and that any configured key file exists and is readable.
"""

import logging
import os
import secrets
import stat
from pathlib import Path

from spoolman import env

logger = logging.getLogger(__name__)

KEY_FILENAME = "secret.key"
KEY_BYTES = 32

__key: bytes | None = None


def _generate(path: Path) -> bytes:
    """Create a new key file with owner-only permissions.

    Args:
        path: Where to write the key.

    Returns:
        bytes: The generated key.

    """
    value = secrets.token_hex(KEY_BYTES)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, stat.S_IRUSR | stat.S_IWUSR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(value)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    logger.info("Generated a new secret key at %s.", path)
    return value.encode()


def _warn_if_readable(path: Path) -> None:
    """Warn when an existing key file is readable by anyone but its owner.

    Deliberately a warning rather than an error: some bind-mounted volumes cannot
    represent 0600, and refusing to start would be worse than the exposure.

    Args:
        path: The key file to inspect.

    """
    try:
        mode = path.stat().st_mode
    except OSError:
        return
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        logger.warning(
            "Secret key file %s is readable by users other than its owner. Restrict it with 'chmod 600 %s'.",
            path,
            path,
        )


def get_secret_key() -> bytes:
    """Get the instance secret key, generating one if needed.

    The result is memoised, so the file is read or created at most once per process.

    Raises:
        ValueError: If a configured key is empty.

    Returns:
        bytes: The secret key.

    """
    global __key  # noqa: PLW0603
    if __key is not None:
        return __key

    configured = env.get_secret_key()
    if configured is not None:
        if not configured:
            raise ValueError("Failed to parse SPOOLMAN_SECRET_KEY variable: The key is empty.")
        __key = configured.encode()
        return __key

    path = env.get_data_dir() / KEY_FILENAME
    if path.exists():
        _warn_if_readable(path)
        existing = path.read_text(encoding="utf-8").strip()
        if existing:
            __key = existing.encode()
            return __key
        logger.warning("Secret key file %s is empty, generating a new key.", path)
        path.unlink()

    __key = _generate(path)
    return __key


def ensure_secret_key() -> None:
    """Resolve the secret key early so configuration problems surface at startup.

    Called from the server's startup sequence when authentication is enabled.
    """
    get_secret_key()


def reset_cache() -> None:
    """Forget the memoised key.

    Only useful to tests, which change the environment between cases.
    """
    global __key  # noqa: PLW0603
    __key = None
