"""The permission level scale.

Three ordered levels gate the API: ``read`` covers every GET and websocket
subscription, ``edit`` adds modification of existing records, and ``manage`` adds
creation and deletion.

``PUT /spool/{id}/use`` deliberately sits at ``edit`` rather than ``manage``: it is
Moonraker's and OctoPrint's hot path, so a printer can be given an ``edit`` credential
that tracks filament usage but cannot delete anything.
"""

from enum import StrEnum


class Level(StrEnum):
    """A permission level."""

    READ = "read"
    EDIT = "edit"
    MANAGE = "manage"


# Ranks are kept in a separate mapping rather than expressed with comparison operators
# on Level itself. StrEnum inherits str's operators, so defining __lt__/__ge__ would
# silently shadow string ordering and give "edit" < "manage" a second, alphabetical
# meaning that happens to agree here and would stop agreeing the moment a level is
# renamed. Callers use covers() instead.
_RANKS: dict[Level, int] = {
    Level.READ: 0,
    Level.EDIT: 1,
    Level.MANAGE: 2,
}


def covers(actual: Level, required: Level) -> bool:
    """Check whether a level satisfies a requirement.

    Args:
        actual: The level held.
        required: The level demanded.

    Returns:
        bool: True if `actual` is at least as permissive as `required`.

    """
    return _RANKS[actual] >= _RANKS[required]


def parse_level(value: str) -> Level:
    """Parse a level name.

    Args:
        value: The level name, case-insensitive.

    Raises:
        ValueError: If the name is not a known level.

    Returns:
        Level: The parsed level.

    """
    try:
        return Level(value.strip().lower())
    except ValueError as exc:
        known = ", ".join(level.value for level in Level)
        raise ValueError(f"Unknown permission level '{value}'. Expected one of: {known}.") from exc
