"""Runtime tests for case-insensitive text ordering in the shared sort helper."""

import pytest
import sqlalchemy

from spoolman.database.utils import SortOrder, order_by_clauses

ROWS = {1: ("Sunlu", 0), 2: ("eSUN", 10), 3: ("ESUN", 2), 4: ("Bambu", 50), 5: ("esun", 5)}


@pytest.mark.parametrize(
    ("order", "expected_ids"),
    [(SortOrder.ASC, [4, 3, 5, 2, 1]), (SortOrder.DESC, [1, 2, 5, 3, 4])],
    ids=["ascending", "descending"],
)
def test_order_by_clauses(order: SortOrder, expected_ids: list[int]) -> None:
    metadata = sqlalchemy.MetaData()
    filament = sqlalchemy.Table(
        "filament",
        metadata,
        sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
        sqlalchemy.Column("name", sqlalchemy.String(64)),
        sqlalchemy.Column("settings_extruder_temp", sqlalchemy.Integer),
    )
    engine = sqlalchemy.create_engine("sqlite://")
    metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            filament.insert(),
            [{"id": i, "name": name, "settings_extruder_temp": temp} for i, (name, temp) in ROWS.items()],
        )
        clauses = order_by_clauses([filament.c.name, filament.c.settings_extruder_temp], order)
        result = conn.execute(sqlalchemy.select(filament.c.id).order_by(*clauses))
        assert list(result.scalars()) == expected_ids
