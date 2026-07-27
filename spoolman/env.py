"""Utilities for grabbing config from environment variables."""

import logging
import os
import subprocess
import sys
from datetime import datetime
from enum import Enum
from pathlib import Path
from urllib import parse

from platformdirs import user_data_dir

logger = logging.getLogger(__name__)


class DatabaseType(Enum):
    """The database type."""

    POSTGRES = "postgres"
    MYSQL = "mysql"
    SQLITE = "sqlite"
    COCKROACHDB = "cockroachdb"

    def to_drivername(self) -> str:
        """Get the drivername for the database type.

        Returns:
            str: The drivername.

        """
        if self is DatabaseType.POSTGRES:
            return "postgresql+asyncpg"
        if self is DatabaseType.MYSQL:
            return "mysql+aiomysql"
        if self is DatabaseType.SQLITE:
            return "sqlite+aiosqlite"
        if self is DatabaseType.COCKROACHDB:
            return "cockroachdb+asyncpg"
        raise ValueError(f"Unknown database type '{self}'.")


def get_database_type() -> DatabaseType | None:
    """Get the database type from environment variables.

    Returns None if no environment variable was set for the database type.

    Returns:
        Optional[DatabaseType]: The database type.

    """
    database_type = os.getenv("SPOOLMAN_DB_TYPE")
    if database_type is None:
        return None
    if database_type == "postgres":
        return DatabaseType.POSTGRES
    if database_type == "mysql":
        return DatabaseType.MYSQL
    if database_type == "sqlite":
        return DatabaseType.SQLITE
    if database_type == "cockroachdb":
        return DatabaseType.COCKROACHDB
    raise ValueError(f"Failed to parse SPOOLMAN_DB_TYPE variable: Unknown database type '{database_type}'.")


def get_host() -> str | None:
    """Get the DB host from environment variables.

    Returns None if no environment variable was set for the host.

    Returns:
        Optional[str]: The host.

    """
    return os.getenv("SPOOLMAN_DB_HOST")


def get_port() -> int | None:
    """Get the DB port from environment variables.

    Returns None if no environment variable was set for the port.

    Returns:
        Optional[str]: The port.

    """
    port = os.getenv("SPOOLMAN_DB_PORT")
    if port is None:
        return None
    try:
        return int(port)
    except ValueError as exc:
        raise ValueError(f"Failed to parse SPOOLMAN_DB_PORT variable: {exc!s}") from exc


def get_database() -> str | None:
    """Get the DB name from environment variables.

    Returns None if no environment variable was set for the name.

    Returns:
        Optional[str]: The name.

    """
    return os.getenv("SPOOLMAN_DB_NAME")


def get_query() -> dict[str, str] | None:
    """Get the DB query from environment variables.

    Returns None if no environment variable was set for the query.

    Returns:
        Optional[dict]: The query.

    """
    query = os.getenv("SPOOLMAN_DB_QUERY")
    if query is None:
        return None
    try:
        parsed_dict = parse.parse_qs(query, strict_parsing=True)
        return {key: value[0] for key, value in parsed_dict.items()}
    except ValueError as exc:
        raise ValueError(f"Failed to parse SPOOLMAN_DB_QUERY variable: {exc!s}") from exc


def get_username() -> str | None:
    """Get the DB username from environment variables.

    Returns None if no environment variable was set for the username.

    Returns:
        Optional[str]: The username.

    """
    return os.getenv("SPOOLMAN_DB_USERNAME")


def get_password() -> str | None:
    """Get the DB password from environment variables.

    Returns None if no environment variables were set for the password.

    Raises:
        ValueError: If it failed to read the password from a password file.

    Returns:
        Optional[str]: The password.

    """
    # First attempt: grab password from a file. This is the most secure way of storing passwords.
    file_path = os.getenv("SPOOLMAN_DB_PASSWORD_FILE")
    if file_path is not None:
        file = Path(file_path)
        if not file.exists() or not file.is_file():
            raise ValueError(
                "Failed to parse SPOOLMAN_DB_PASSWORD_FILE variable: "
                f'Database password file "{file_path}" does not exist.',
            )
        try:
            with file.open(encoding="utf-8") as f:
                return f.read()
        except OSError as exc:
            raise ValueError(
                "Failed to parse SPOOLMAN_DB_PASSWORD_FILE variable: "
                f'Failed to read password from file "{file_path}": {exc!s}.',
            ) from exc

    # Second attempt: grab directly from an environment variable.
    return os.getenv("SPOOLMAN_DB_PASSWORD")


def get_logging_level() -> int:
    """Get the logging level from environment variables.

    Returns "INFO" if no environment variable was set for the logging level.

    Returns:
        str: The logging level.

    """
    log_level_str = os.getenv("SPOOLMAN_LOGGING_LEVEL", "INFO").upper()
    if log_level_str == "DEBUG":
        return logging.DEBUG
    if log_level_str == "INFO":
        return logging.INFO
    if log_level_str == "WARNING":
        return logging.WARNING
    if log_level_str == "ERROR":
        return logging.ERROR
    if log_level_str == "CRITICAL":
        return logging.CRITICAL
    raise ValueError(f"Failed to parse SPOOLMAN_LOGGING_LEVEL variable: Unknown logging level '{log_level_str}'.")


def is_debug_mode() -> bool:
    """Get whether debug mode is enabled from environment variables.

    Returns False if no environment variable was set for debug mode.

    Returns:
        bool: Whether debug mode is enabled.

    """
    debug_mode = os.getenv("SPOOLMAN_DEBUG_MODE", "FALSE").upper()
    if debug_mode in {"FALSE", "0"}:
        return False
    if debug_mode in {"TRUE", "1"}:
        return True
    raise ValueError(f"Failed to parse SPOOLMAN_DEBUG_MODE variable: Unknown debug mode '{debug_mode}'.")


def is_cors_defined() -> bool:
    """Get whether CORS is enabled from environment variables.

    Returns False if no environment variable was set for CORS.
    Returns True otherwise

    Returns:
        bool: Whether CORS is enabled.

    """
    cors = os.getenv("SPOOLMAN_CORS_ORIGIN", "FALSE").upper()
    return cors not in {"FALSE", "0"}


def get_cors_origin() -> list[str] | None:
    """Get the CORS origin from environment variables.

    Returns None if no environment variable was set for the origin.

    Returns:
        Optional[str]: The origin.

    """
    cors = os.getenv("SPOOLMAN_CORS_ORIGIN")
    if cors is None:
        return None
    return cors.split(",")


def is_automatic_backup_enabled() -> bool:
    """Get whether automatic backup is enabled from environment variables.

    Returns True if no environment variable was set for automatic backup.

    Returns:
        bool: Whether automatic backup is enabled.

    """
    automatic_backup = os.getenv("SPOOLMAN_AUTOMATIC_BACKUP", "TRUE").upper()
    if automatic_backup in {"FALSE", "0"}:
        return False
    if automatic_backup in {"TRUE", "1"}:
        return True
    raise ValueError(
        f"Failed to parse SPOOLMAN_AUTOMATIC_BACKUP variable: Unknown automatic backup '{automatic_backup}'.",
    )


def get_data_dir() -> Path:
    """Get the data directory.

    Returns:
        Path: The data directory.

    """
    env_data_dir = os.getenv("SPOOLMAN_DIR_DATA")
    if env_data_dir is not None:
        data_dir = Path(env_data_dir)
    else:
        data_dir = Path(user_data_dir("spoolman"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_logs_dir() -> Path:
    """Get the logs directory.

    Returns:
        Path: The logs directory.

    """
    env_logs_dir = os.getenv("SPOOLMAN_DIR_LOGS")
    if env_logs_dir is not None:
        logs_dir = Path(env_logs_dir)
    else:
        logs_dir = get_data_dir()
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir


def get_backups_dir() -> Path:
    """Get the backups directory.

    Returns:
        Path: The backups directory.

    """
    env_backups_dir = os.getenv("SPOOLMAN_DIR_BACKUPS")
    if env_backups_dir is not None:
        backups_dir = Path(env_backups_dir)
    else:
        backups_dir = get_data_dir().joinpath("backups")
    backups_dir.mkdir(parents=True, exist_ok=True)
    return backups_dir


def get_cache_dir() -> Path:
    """Get the cache directory."""
    return get_data_dir() / "cache"


def get_version() -> str:
    """Get the version of the package.

    Returns:
        str: The version.

    """
    # Read version from pyproject.toml, don't use pkg_resources because it requires the package to be installed
    with Path("pyproject.toml").open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("version ="):
                return line.split('"')[1]
    return "unknown"


def get_commit_hash() -> str | None:
    """Get the latest commit hash of the package.

    Can end with "-dirty" if there are uncommitted changes.

    Returns:
        Optional[str]: The commit hash.

    """
    # Read commit has from build.txt
    # commit is written as GIT_COMMIT=<hash> in build.txt
    build_file = Path("build.txt")
    if not build_file.exists():
        return None
    with build_file.open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("GIT_COMMIT="):
                return line.split("=")[1].strip()
    return None


def get_build_date() -> datetime | None:
    """Get the build date of the package.

    Returns:
        Optional[datetime.datetime]: The build date.

    """
    # Read build date has from build.txt
    # build date is written as BUILD_DATE=<hash> in build.txt
    build_file = Path("build.txt")
    if not build_file.exists():
        return None
    with build_file.open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("BUILD_DATE="):
                try:
                    return datetime.fromisoformat(line.split("=")[1].strip())
                except ValueError:
                    return None
    return None


def can_write_to_data_dir() -> bool:
    """Check if the data directory is writable."""
    try:
        test_file = get_data_dir().joinpath("test.txt")
        test_file.touch()
        test_file.unlink()
    except:  # noqa: E722
        return False
    return True


def chown_dir(path: str) -> bool:
    """Try to chown the data directory to the current user."""
    if os.name == "nt":
        return False

    try:
        uid = os.getuid()
        gid = os.getgid()
        subprocess.run(["chown", "-R", f"{uid}:{gid}", path], check=True)  # noqa: S607
    except:  # noqa: E722
        return False
    return True


def check_write_permissions() -> None:
    """Verify that the data directory is writable, crash with a helpful error message if not."""
    if not can_write_to_data_dir():
        # If windows we can't fix the permissions, so just crash
        if os.name == "nt":
            logger.error("Data directory is not writable.")
            sys.exit(1)

        # Try fixing it by chowning the directory to the current user
        logger.warning("Data directory is not writable, trying to fix it...")
        if not chown_dir(str(get_data_dir())) or not can_write_to_data_dir():
            uid = os.getuid()
            gid = os.getgid()

            logger.error(
                (
                    "Data directory is not writable. "
                    'Please run "sudo chown -R %s:%s /path/to/spoolman/datadir" on the host OS.'
                ),
                uid,
                gid,
            )
            sys.exit(1)


def is_docker() -> bool:
    """Check if we are running in a docker container."""
    return Path("/.dockerenv").exists()


def is_data_dir_mounted() -> bool:
    """Check if the data directory is mounted as a shfs."""
    # "mount" will give us a list of all mounted filesystems
    mounts = subprocess.run("mount", check=True, stdout=subprocess.PIPE, text=True)  # noqa: S607
    data_dir = str(get_data_dir().resolve())
    return any(data_dir in line for line in mounts.stdout.splitlines())


def is_metrics_enabled() -> bool:
    """Get whether collect prometheus metrics at database is enabled.

        Returns False if no environment variable was set for collect metrics.

    Returns:
        bool: Whether collect metrics is enabled.

    """
    metrics_enabled = os.getenv("SPOOLMAN_METRICS_ENABLED", "FALSE").upper()
    if metrics_enabled in {"FALSE", "0"}:
        return False
    if metrics_enabled in {"TRUE", "1"}:
        return True
    raise ValueError(
        f"Failed to parse SPOOLMAN_METRICS_ENABLED variable: Unknown metrics enabled '{metrics_enabled}'.",
    )


def get_base_path() -> str:
    """Get the base path.

    This is formated so that it always starts with a /, and does not end with a /

    Returns:
        str: The base path.

    """
    path = os.getenv("SPOOLMAN_BASE_PATH", "")
    if len(path) == 0:
        return ""

    # Ensure it starts with / and does not end with /
    return "/" + path.strip("/")


def is_legacy_client_enabled() -> bool:
    """Get whether the legacy (React) client should be served instead of the new one.

    The new Svelte client is served by default. Set SPOOLMAN_LEGACY_CLIENT to TRUE/1 to
    fall back to the old React client.

    Returns:
        bool: Whether the legacy client is enabled.

    """
    legacy_client = os.getenv("SPOOLMAN_LEGACY_CLIENT", "FALSE").upper()
    if legacy_client in {"FALSE", "0"}:
        return False
    if legacy_client in {"TRUE", "1"}:
        return True
    raise ValueError(
        f"Failed to parse SPOOLMAN_LEGACY_CLIENT variable: Unknown value '{legacy_client}'.",
    )


#
# Authentication.
#
# All of the below are opt-in: with SPOOLMAN_AUTH_ENABLED unset, the request path is
# identical to an instance built before authentication existed.
#


def _parse_bool(name: str, default: str) -> bool:
    """Parse a TRUE/FALSE/1/0 environment variable.

    The older boolean accessors in this module each inline this logic with a bespoke
    error message that users quote in bug reports, so they are deliberately left alone.
    New variables use this helper.

    Args:
        name: The environment variable to read.
        default: The value to assume when the variable is unset.

    Raises:
        ValueError: If the variable is set to something other than TRUE/FALSE/1/0.

    Returns:
        bool: The parsed value.

    """
    value = os.getenv(name, default).upper()
    if value in {"FALSE", "0"}:
        return False
    if value in {"TRUE", "1"}:
        return True
    raise ValueError(f"Failed to parse {name} variable: Unknown value '{value}'.")


def _read_env_or_file(name: str) -> str | None:
    """Read a secret from ``<name>_FILE`` if set, falling back to ``<name>``.

    Follows the same two-step convention as :func:`get_password`, with one deliberate
    difference: the file contents are stripped. A key or token file is almost always
    produced by a shell redirect, which appends a newline, and an unstripped trailing
    newline would silently yield a different secret than the one the operator wrote.

    Args:
        name: The base environment variable name, without the ``_FILE`` suffix.

    Raises:
        ValueError: If the file is missing or cannot be read.

    Returns:
        Optional[str]: The secret, or None if neither variable is set.

    """
    file_path = os.getenv(name + "_FILE")
    if file_path is not None:
        file = Path(file_path)
        if not file.exists() or not file.is_file():
            raise ValueError(
                f'Failed to parse {name}_FILE variable: File "{file_path}" does not exist.',
            )
        try:
            with file.open(encoding="utf-8") as f:
                return f.read().strip()
        except OSError as exc:
            raise ValueError(
                f'Failed to parse {name}_FILE variable: Failed to read from file "{file_path}": {exc!s}.',
            ) from exc

    return os.getenv(name)


def is_auth_enabled() -> bool:
    """Get whether authentication is enforced.

    Returns False if no environment variable was set, which keeps zero-config boot and
    every existing integration working untouched.

    Returns:
        bool: Whether authentication is enabled.

    """
    return _parse_bool("SPOOLMAN_AUTH_ENABLED", "FALSE")


def get_secret_key() -> str | None:
    """Get the configured server secret key.

    Returns None when neither SPOOLMAN_SECRET_KEY nor SPOOLMAN_SECRET_KEY_FILE is set,
    in which case a key is generated and persisted in the data directory instead. See
    :mod:`spoolman.auth.secret`.

    Returns:
        Optional[str]: The secret key, or None if unset.

    """
    return _read_env_or_file("SPOOLMAN_SECRET_KEY")


def get_trusted_proxies() -> list[str]:
    """Get the reverse proxies whose forwarding headers may be believed.

    Accepts a comma-separated list of IP addresses or CIDR networks. Empty by default,
    which means X-Forwarded-For and X-Forwarded-Proto are never trusted.

    Returns:
        list[str]: The trusted proxy addresses or networks.

    """
    proxies = os.getenv("SPOOLMAN_TRUSTED_PROXIES", "")
    return [entry.strip() for entry in proxies.split(",") if entry.strip()]


def is_metrics_public() -> bool:
    """Get whether the metrics endpoint stays reachable without credentials.

    Only consulted when authentication is enabled; with authentication off, metrics are
    public regardless.

    Returns:
        bool: Whether metrics are public.

    """
    return _parse_bool("SPOOLMAN_METRICS_PUBLIC", "FALSE")


def get_metrics_token() -> str | None:
    """Get the shared token that grants access to the metrics endpoint.

    Returns:
        Optional[str]: The metrics token, or None if unset.

    """
    return _read_env_or_file("SPOOLMAN_METRICS_TOKEN")


def get_cookie_secure_override() -> bool | None:
    """Get the operator's override for the Secure flag on session cookies.

    Defaults to AUTO, which derives the flag from the request scheme. An override is
    needed only for proxies that do not set X-Forwarded-Proto. Guessing True on a
    plain-HTTP LAN deployment would make the browser discard the cookie and break login
    with no visible error, so the automatic path never assumes HTTPS.

    Raises:
        ValueError: If set to something other than AUTO/TRUE/FALSE/1/0.

    Returns:
        Optional[bool]: True or False to force the flag, None to derive it.

    """
    value = os.getenv("SPOOLMAN_COOKIE_SECURE", "AUTO").upper()
    if value == "AUTO":
        return None
    if value in {"FALSE", "0"}:
        return False
    if value in {"TRUE", "1"}:
        return True
    raise ValueError(f"Failed to parse SPOOLMAN_COOKIE_SECURE variable: Unknown value '{value}'.")
