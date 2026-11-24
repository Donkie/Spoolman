"""Tests for how the CockroachDB renumbering migration updates the saved spool orders (#797).

The web UI saves custom spool orders as lists of spool IDs in two settings. Those IDs went
through JavaScript numbers, so the unsafe ones are stored rounded to the nearest double, and the
migration has to find them anyway.
"""

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory

ROOT = Path(__file__).resolve().parent.parent

# Loaded through alembic, since the file name can't be imported.
_config = Config(str(ROOT / "alembic.ini"))
_config.set_main_option("script_location", str(ROOT / "migrations"))
migration = ScriptDirectory.from_config(_config).get_revision("4e7c1b8d9f23").module

# Old ID -> new ID, as the migration renumbers them.
SPOOL_IDS = {2**53: 7, 2**53 + 1: 8, 1134663890672549889: 9, 2**63 - 1: 10}

# What the web UI saved for those IDs: the nearest double, in JavaScript's shortest digits. The
# first two are the same number.
SAVED = {
    2**53: 9007199254740992,
    2**53 + 1: 9007199254740992,
    1134663890672549889: 1134663890672549900,
    2**63 - 1: 9223372036854776000,
}


def remap(saved: object) -> object:
    return migration.remap_spool_ids(saved, SPOOL_IDS)


def test_rounded_ids_are_found():
    """A rounded ID is a different int than the real one, so it has to be compared as a float."""
    assert SAVED[1134663890672549889] != float(1134663890672549889)
    saved = {"shelf 1": [SAVED[1134663890672549889], 4, SAVED[2**63 - 1]]}
    assert remap(saved) == {"shelf 1": [9, 4, 10]}


def test_ids_that_round_to_the_same_number_all_take_its_place():
    """The web UI showed both spools under one ID, so both go where it was, in their old order."""
    assert remap({"": [3, SAVED[2**53], 4]}) == {"": [3, 7, 8, 4]}


def test_new_ids_go_in_once_per_list():
    """The web UI can save the shared ID once for each of its spools, the rest stays as saved."""
    assert remap({"": [SAVED[2**53], 5, SAVED[2**53 + 1], 5]}) == {"": [7, 8, 5, 5]}


def test_ids_that_were_not_renumbered_stay():
    """Safe IDs, and IDs of spools deleted since, including unsafe ones right next to a real one."""
    saved = {"shelf": [4, 2**53 - 1, 1152921504606859300, SAVED[1134663890672549889] + 256], "Regál ü": []}
    assert remap(saved) == saved


def test_keys_and_anything_but_ids_in_lists_stay():
    """Keys are names even when they look like IDs, and only the numbers in lists are spool IDs."""
    rounded = SAVED[2**63 - 1]
    saved = {
        str(rounded): [rounded],
        "location": {str(rounded): [[rounded], {"x": rounded}]},
        "other": [True, None, str(rounded), 1.5, float(rounded), 10**400],
        "number": rounded,
    }
    assert remap(saved) == {
        str(rounded): [10],
        "location": {str(rounded): [[10], {"x": rounded}]},
        "other": [True, None, str(rounded), 1.5, 10, 10**400],
        "number": rounded,
    }


@pytest.mark.parametrize(
    ("saved", "written"),
    [
        ('{"Regál ü": [9223372036854776000, 4]}', '{"Regál ü":[10,4]}'),  # the way JSON.stringify() writes it
        ('{"shelf": [4]}', '{"shelf": [4]}'),  # nothing to remap, so it isn't rewritten
        ("[9223372036854776000]", "[9223372036854776000]"),  # not a spool order
        ('{"shelf": [9223372036854776000', '{"shelf": [9223372036854776000'),  # not JSON
    ],
)
def test_only_spool_orders_with_renumbered_ids_are_written(saved: str, written: str):
    """Nothing else is written, and last_updated stays, since no user changed anything."""
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE setting (key VARCHAR(64) PRIMARY KEY, value TEXT, last_updated DATETIME)"))
        conn.execute(
            sa.text("INSERT INTO setting VALUES (:key, :value, '2024-05-04')"),
            [{"key": "dashboard_spoolorders", "value": saved}, {"key": "base_url", "value": "[9223372036854776000]"}],
        )
        migration.remap_spool_orders(conn, SPOOL_IDS)
        assert conn.execute(sa.text("SELECT * FROM setting ORDER BY key")).all() == [
            ("base_url", "[9223372036854776000]", "2024-05-04"),
            ("dashboard_spoolorders", written, "2024-05-04"),
        ]
