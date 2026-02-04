from types import SimpleNamespace

from spoolman.export import dump_as_csv, dump_as_json
from spoolman.database import spool as spool_db, filament as filament_db, vendor as vendor_db


async def _fake_csv(objects, buffer):
    buffer.write("a,b,c")


async def _fake_json(objects, buffer):
    buffer.write("[1]")


def test_export_spools_and_formats(client, monkeypatch):
    async def fake_find(db):
        return [SimpleNamespace(id=1)], 1

    monkeypatch.setattr(spool_db, "find", fake_find)
    monkeypatch.setattr("spoolman.api.v1.export.dump_as_csv", _fake_csv)
    monkeypatch.setattr("spoolman.api.v1.export.dump_as_json", _fake_json)

    r = client.get("/export/spools?fmt=csv")
    assert r.status_code == 200
    assert r.headers.get("content-type").startswith("text/csv")

    r = client.get("/export/spools?fmt=json")
    assert r.status_code == 200
    assert r.headers.get("content-type").startswith("application/json")


def test_export_filaments_and_vendors_formats(client, monkeypatch):
    async def fake_find(db):
        return [SimpleNamespace(id=1)], 1

    monkeypatch.setattr(filament_db, "find", fake_find)
    monkeypatch.setattr(vendor_db, "find", fake_find)
    monkeypatch.setattr("spoolman.api.v1.export.dump_as_csv", _fake_csv)
    monkeypatch.setattr("spoolman.api.v1.export.dump_as_json", _fake_json)

    r = client.get("/export/filaments?fmt=csv")
    assert r.status_code == 200
    assert r.headers.get("content-type").startswith("text/csv")

    r = client.get("/export/vendors?fmt=json")
    assert r.status_code == 200
    assert r.headers.get("content-type").startswith("application/json")
