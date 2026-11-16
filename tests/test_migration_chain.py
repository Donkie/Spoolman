"""Tests for the shape of the alembic migration chain.

Spoolman runs `alembic upgrade head` at startup, which refuses to run with more than one head. A
migration that branches off an older revision, e.g. one written before another migration got
merged, would only show up there. The CockroachDB ID migrations also have to stay back to back:
the second one expects the first to have renumbered every ID, see tests_integration/upgrade.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

ROOT = Path(__file__).resolve().parent.parent


def scripts() -> ScriptDirectory:
    """Load the migration scripts."""
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    return ScriptDirectory.from_config(config)


def test_migrations_form_a_single_chain():
    script_directory = scripts()
    assert len(script_directory.get_heads()) == 1
    assert len(script_directory.get_bases()) == 1
    assert all(len(revision.nextrev) <= 1 for revision in script_directory.walk_revisions())


def test_cockroachdb_id_migrations_are_back_to_back():
    assert scripts().get_revision("8b2f6a3c5d17").down_revision == "4e7c1b8d9f23"
