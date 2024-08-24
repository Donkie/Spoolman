"""A file-based cache system for reading/writing files."""

from pathlib import Path

from spoolman.env import get_cache_dir


def get_file(name: str) -> Path:
    """Get the path to a file in the cache dir."""
    return get_cache_dir() / name


def update_file(name: str, data: bytes) -> None:
    """Update a file if it differs from the given data."""
    path = get_file(name)
    if path.exists() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def get_file_contents(name: str) -> bytes:
    """Get the contents of a file."""
    path = get_file(name)
    return path.read_bytes()
