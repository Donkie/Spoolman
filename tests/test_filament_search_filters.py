"""Unit tests for the filament search-filter builder (PR #4, TESTING_CANDIDATES row 79).

Oracle: the documented search grammar — comma-separated terms; a quoted term is an
EXACT match across vendor.name/filament.name/material/article_number (plus filament.id
when numeric); an unquoted term is a FUZZY ilike across those columns plus the id cast
to text; empty terms are skipped. We assert the shape of the returned condition list and
the SQL each condition compiles to (the observable behavior fed into the query), not the
builder's internals.
"""

from sqlalchemy.dialects import sqlite
from sqlalchemy.sql.elements import ColumnElement

from spoolman.database.filament import _build_search_filters


def _sql(condition: ColumnElement) -> str:
    """Render one SQLAlchemy condition to literal SQLite SQL for assertions."""
    return str(condition.compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds": True}))


def _all_sql(conditions: list[ColumnElement]) -> str:
    return " ".join(_sql(c) for c in conditions)


def test_quoted_term_is_exact_match_across_four_columns():
    conditions = _build_search_filters('"PLA"')
    assert len(conditions) == 4  # vendor.name, filament.name, material, article_number
    joined = _all_sql(conditions)
    # Exact equality, never a fuzzy LIKE.
    assert "LIKE" not in joined.upper()
    assert joined.count("= 'PLA'") == 4
    # A non-numeric quoted term must NOT add an id condition.
    assert "filament.id" not in joined


def test_quoted_numeric_term_adds_an_id_equality():
    conditions = _build_search_filters('"12"')
    assert len(conditions) == 5  # the 4 string columns + id
    assert "filament.id = 12" in _all_sql(conditions)


def test_quoted_negative_numeric_term_takes_the_id_branch():
    # isdigit() is checked after lstrip("-"), so negative integers are numeric too.
    conditions = _build_search_filters('"-5"')
    assert "filament.id = -5" in _all_sql(conditions)


def test_unquoted_term_is_fuzzy_ilike_across_five_columns():
    conditions = _build_search_filters("red")
    assert len(conditions) == 5  # 4 string columns + cast(id AS text)
    joined = _all_sql(conditions).upper()
    # ilike renders as lower(col) LIKE lower('%red%') on sqlite.
    assert joined.count("LIKE") == 5
    assert "'%RED%'" in joined  # wildcards wrap the term
    assert "CAST(FILAMENT.ID AS" in joined  # id is matched as text, fuzzily


def test_multiple_terms_are_combined():
    # One quoted (4 conds) + one unquoted (5 conds).
    conditions = _build_search_filters('"PLA",red')
    assert len(conditions) == 9


def test_empty_and_blank_terms_are_skipped():
    assert _build_search_filters("") == []
    assert _build_search_filters(",,") == []
    # Trailing/leading commas produce no phantom conditions.
    assert len(_build_search_filters("red,")) == 5


def test_lone_quote_char_yields_empty_exact_match_conditions():
    # Documents an edge: a single '"' is treated as an (empty) quoted term.
    conditions = _build_search_filters('"')
    assert len(conditions) == 4
    assert "= ''" in _all_sql(conditions)
