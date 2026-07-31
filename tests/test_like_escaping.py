"""Tests for LIKE wildcard escaping in search patterns."""

import pytest

from spoolman.database.utils import LIKE_ESCAPE, escape_like


def test_percent_is_escaped():
    """Otherwise a search for "%" matches every row."""
    assert escape_like("%") == f"{LIKE_ESCAPE}%"


def test_underscore_is_escaped():
    """Otherwise "PLA_Basic" also matches "PLAxBasic"."""
    assert escape_like("PLA_Basic") == f"PLA{LIKE_ESCAPE}_Basic"


def test_the_escape_character_is_escaped_first():
    """A literal escape char must not turn the following character into an escaped one."""
    assert escape_like(f"{LIKE_ESCAPE}%") == f"{LIKE_ESCAPE}{LIKE_ESCAPE}{LIKE_ESCAPE}%"


def test_ordinary_text_is_untouched():
    assert escape_like("Prusament Galaxy Black") == "Prusament Galaxy Black"


@pytest.mark.parametrize("term", ["100% silk", "a_b", "%_%", LIKE_ESCAPE, ""])
def test_escaping_is_idempotent_in_meaning(term: str):
    """Escaping never drops characters; the pattern only ever grows."""
    assert len(escape_like(term)) >= len(term)


def test_the_escape_character_is_not_a_backslash():
    """A backslash ESCAPE clause is ambiguous under MySQL/MariaDB string parsing."""
    assert LIKE_ESCAPE != "\\"
