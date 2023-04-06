"""Utilities for grabbing config from environment variables."""

import os
from enum import Enum
from pathlib import Path
from typing import Optional
from urllib import parse


class DatabaseType(Enum):
    """The database type."""

    POSTGRES = "postgres"
    MYSQL = "mysql"
    SQLITE = "sqlite"
    COCKROACHDB = "cockroachdb"

    def to_drivername(self: "DatabaseType") -> str:
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


def get_database_type() -> Optional[DatabaseType]:
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


def get_host() -> Optional[str]:
    """Get the DB host from environment variables.

    Returns None if no environment variable was set for the host.

    Returns:
        Optional[str]: The host.
    """
    return os.getenv("SPOOLMAN_DB_HOST")


def get_port() -> Optional[int]:
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
        raise ValueError(f"Failed to parse SPOOLMAN_DB_PORT variable: {str(exc)}") from exc


def get_database() -> Optional[str]:
    """Get the DB name from environment variables.

    Returns None if no environment variable was set for the name.

    Returns:
        Optional[str]: The name.
    """
    return os.getenv("SPOOLMAN_DB_NAME")


def get_query() -> Optional[dict[str, str]]:
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
        raise ValueError(f"Failed to parse SPOOLMAN_DB_QUERY variable: {str(exc)}") from exc


def get_username() -> Optional[str]:
    """Get the DB username from environment variables.

    Returns None if no environment variable was set for the username.

    Returns:
        Optional[str]: The username.
    """
    return os.getenv("SPOOLMAN_DB_USERNAME")


def get_password() -> Optional[str]:
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
                f'Failed to read password from file "{file_path}": {str(exc)}.',
            ) from exc

    # Second attempt: grab directly from an environment variable.
    return os.getenv("SPOOLMAN_DB_PASSWORD")
