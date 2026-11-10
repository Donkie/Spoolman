"""Run alembic the way Spoolman does at startup, optionally the old way or killed partway.

harness.py runs this as a separate process, so that a kill takes down a real alembic run.

    python run_alembic.py [--legacy-schema] [--kill BEFORE|AFTER PREFIX N] <alembic arguments>

--legacy-schema creates tables the way Spoolman did before #797 was fixed, which on cockroachdb
means unique_rowid() IDs. --kill sends SIGKILL to this process right before or after it sends
the Nth statement starting with PREFIX, so the kill always lands at the same point, and the
database sees the connection drop mid-transaction just like after a power cut.
"""

import argparse
import os
import signal
from typing import Any

from alembic.config import main as alembic_main
from sqlalchemy import event
from sqlalchemy.engine import Engine

from spoolman.database import database


def use_legacy_schema() -> None:
    """Connect without the serial_normalization setting the cockroachdb fix added."""
    create_async_engine = database.create_async_engine

    def create_legacy_engine(*args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
        kwargs["connect_args"].pop("server_settings", None)
        return create_async_engine(*args, **kwargs)

    database.create_async_engine = create_legacy_engine


def kill_at(when: str, prefix: str, nth: int) -> None:
    """Kill this process at the nth statement starting with prefix."""
    seen = 0

    def maybe_kill(_conn: object, _cursor: object, statement: str, *_args: object) -> None:
        nonlocal seen
        if statement.startswith(prefix):
            seen += 1
            if seen == nth:
                os.kill(os.getpid(), signal.SIGKILL)

    event.listen(Engine, f"{when}_cursor_execute", maybe_kill)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--legacy-schema", action="store_true")
    parser.add_argument("--kill", nargs=3, metavar=("WHEN", "PREFIX", "N"))
    args, alembic_args = parser.parse_known_args()
    if args.legacy_schema:
        use_legacy_schema()
    if args.kill:
        when, prefix, nth = args.kill
        kill_at(when.lower(), prefix, int(nth))
    alembic_main(argv=alembic_args)
