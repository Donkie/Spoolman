from types import SimpleNamespace

from spoolman.database import filament as filament_db
from spoolman.database import spool as spool_db


def test_find_misc_endpoints_and_rename(client, monkeypatch):
    async def fake_find_materials(db):
        return ["PLA", "ABS"]

    async def fake_find_article_numbers(db):
        return ["123", "456"]

    async def fake_find_lot_numbers(db):
        return ["L1"]

    async def fake_find_locations(db):
        return ["Printer 1"]

    async def fake_rename(db, current_name, new_name):
        return None

    monkeypatch.setattr(filament_db, "find_materials", fake_find_materials)
    monkeypatch.setattr(filament_db, "find_article_numbers", fake_find_article_numbers)
    monkeypatch.setattr(spool_db, "find_lot_numbers", fake_find_lot_numbers)
    monkeypatch.setattr(spool_db, "find_locations", fake_find_locations)
    monkeypatch.setattr(spool_db, "rename_location", fake_rename)

    r = client.get("/material")
    assert r.status_code == 200
    assert r.json() == ["PLA", "ABS"]

    r = client.get("/article-number")
    assert r.status_code == 200
    assert r.json() == ["123", "456"]

    r = client.get("/lot-number")
    assert r.status_code == 200
    assert r.json() == ["L1"]

    r = client.get("/location")
    assert r.status_code == 200
    assert r.json() == ["Printer 1"]

    r = client.patch("/location/Old", json={"name": "New"})
    assert r.status_code == 200
    assert r.json() == "New"
