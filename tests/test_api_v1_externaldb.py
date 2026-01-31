import json

def test_external_filaments_and_materials_return_files(client, tmp_path, monkeypatch):
    fil_path = tmp_path.joinpath("filaments.json")
    fil_path.write_text(json.dumps([{"id": 1}]))
    mat_path = tmp_path.joinpath("materials.json")
    mat_path.write_text(json.dumps([{"id": 2}]))

    monkeypatch.setattr("spoolman.api.v1.externaldb.get_filaments_file", lambda: str(fil_path))
    monkeypatch.setattr("spoolman.api.v1.externaldb.get_materials_file", lambda: str(mat_path))

    r = client.get("/external/filament")
    assert r.status_code == 200

    r = client.get("/external/material")
    assert r.status_code == 200
