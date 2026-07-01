"""Unit tests for the pure CalVer derivation in spoolman.bump.

Oracle: a hand-written table of (now, current_version) -> expected version. The
function takes ``now`` as an argument, so no clock mocking is needed and the
expected values are independent of the implementation. Covers PR #8's CalVer
rewrite: patch increments within a month, resets on month/year rollover, and
starts at 0 for a missing/unparseable current version.
"""

from datetime import datetime, timezone

import pytest

from spoolman.bump import calver


def _at(year: int, month: int) -> datetime:
    """Build a UTC datetime at the given year/month (day/time are irrelevant)."""
    return datetime(year, month, 15, 12, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("now", "current", "expected"),
    [
        # Same calendar month as the current version -> patch increments.
        (_at(2026, 6), "2026.6.0", "2026.6.1"),
        (_at(2026, 6), "2026.6.7", "2026.6.8"),
        # New month -> patch resets to 0.
        (_at(2026, 7), "2026.6.3", "2026.7.0"),
        # New year -> patch resets to 0.
        (_at(2027, 1), "2026.12.4", "2027.1.0"),
        # First release / no current version -> patch 0.
        (_at(2026, 6), None, "2026.6.0"),
        # Unparseable current versions are treated as "no counter" -> patch 0.
        (_at(2026, 6), "not-a-version", "2026.6.0"),
        (_at(2026, 6), "2026.6", "2026.6.0"),
        (_at(2026, 6), "v2026.6.2", "2026.6.0"),
        # Whitespace around a valid version is tolerated.
        (_at(2026, 6), "  2026.6.1  ", "2026.6.2"),
    ],
)
def test_calver_derivation(now: datetime, current: str | None, expected: str):
    assert calver(now, current) == expected


def test_calver_month_is_not_zero_padded():
    # CalVer here uses the bare integer month (6, not 06), matching pyproject.
    assert calver(_at(2026, 6), None) == "2026.6.0"
    assert calver(_at(2026, 12), None) == "2026.12.0"


def test_calver_same_month_different_year_does_not_continue_counter():
    # Same month number but a different year must reset, not continue.
    assert calver(_at(2027, 6), "2026.6.9") == "2027.6.0"
