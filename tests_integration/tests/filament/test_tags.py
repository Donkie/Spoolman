"""Integration tests: linking NFC/RFID tags to a filament type, and looking a filament up by one.

A tag identifies exactly one thing, and now that a filament can hold one as well as a spool can,
the cases worth pinning here are the ones that cross the two kinds: a UID a spool holds is taken
for every filament and the reverse, unlinking only works on what actually holds the tag, and
neither kind's lookup ever answers with the other. UID normalization and format refinement run
through the same code as spool tags and are pinned in spool/test_tags.py.
"""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_code, assert_httpx_success


def _uid() -> str:
    """Build a UID no other test in the session will produce. Hex, as a real UID is."""
    return uuid.uuid4().hex[:14].upper()


@contextmanager
def _filament() -> Iterator[dict[str, Any]]:
    result = httpx.post(f"{URL}/api/v1/filament", json={"density": 1.24, "diameter": 1.75})
    assert_httpx_success(result)
    filament = result.json()
    try:
        yield filament
    finally:
        httpx.delete(f"{URL}/api/v1/filament/{filament['id']}")


@contextmanager
def _spool(filament_id: int) -> Iterator[dict[str, Any]]:
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id})
    assert_httpx_success(result)
    spool = result.json()
    try:
        yield spool
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


def _get_filament(filament_id: int) -> dict[str, Any]:
    result = httpx.get(f"{URL}/api/v1/filament/{filament_id}")
    assert_httpx_success(result)
    return result.json()


def test_link_tag():
    """Linking returns the stored tag, normalized, and adds it to the filament."""
    uid = _uid()
    with _filament() as filament:
        result = httpx.post(
            f"{URL}/api/v1/filament/{filament['id']}/tag",
            json={"uid": uid.lower(), "format": "ntag"},
        )
        assert_httpx_code(result, 201)

        tag = result.json()
        assert tag["uid"] == uid
        assert tag["format"] == "ntag"
        assert _get_filament(filament["id"])["tags"] == [tag]


def test_filament_with_no_tags_has_an_empty_list():
    """`tags` is always present, on the create response as well as on a read."""
    with _filament() as filament:
        assert filament["tags"] == []
        assert _get_filament(filament["id"])["tags"] == []


def test_link_is_idempotent():
    uid = _uid()
    with _filament() as filament:
        for _ in range(3):
            assert_httpx_code(httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid}), 201)
        assert [tag["uid"] for tag in _get_filament(filament["id"])["tags"]] == [uid]


def test_duplicate_uid_on_another_filament_is_a_conflict():
    uid = _uid()
    with _filament() as first, _filament() as second:
        httpx.post(f"{URL}/api/v1/filament/{first['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.post(f"{URL}/api/v1/filament/{second['id']}/tag", json={"uid": uid})
        assert_httpx_code(result, 409)
        assert result.json()["filament_id"] == first["id"]
        assert result.json().get("spool_id") is None
        assert _get_filament(second["id"])["tags"] == []


def test_a_uid_a_spool_holds_cannot_be_linked_to_a_filament():
    """One tag, one thing, across kinds. The 409 names the spool so a client can offer the move."""
    uid = _uid()
    with _filament() as filament, _spool(filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid})
        assert_httpx_code(result, 409)
        assert result.json()["spool_id"] == spool["id"]
        assert result.json().get("filament_id") is None
        assert _get_filament(filament["id"])["tags"] == []


def test_a_uid_a_filament_holds_cannot_be_linked_to_a_spool():
    uid = _uid()
    with _filament() as filament, _spool(filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid})
        assert_httpx_code(result, 409)
        assert result.json()["filament_id"] == filament["id"]
        assert result.json().get("spool_id") is None


def test_unlink_tag():
    uid = _uid()
    with _filament() as filament:
        httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid}).raise_for_status()

        assert_httpx_code(httpx.delete(f"{URL}/api/v1/filament/{filament['id']}/tag/{uid.lower()}"), 204)
        assert _get_filament(filament["id"])["tags"] == []


def test_unlinking_frees_the_uid_for_a_spool():
    """The unique row really is gone, so the tag can move to the other kind."""
    uid = _uid()
    with _filament() as filament, _spool(filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid}).raise_for_status()
        httpx.delete(f"{URL}/api/v1/filament/{filament['id']}/tag/{uid}").raise_for_status()

        assert_httpx_code(httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}), 201)


def test_unlinking_a_spools_tag_from_its_filament_is_404():
    """A tag is only unlinkable from what holds it, and a spool's tag is not its filament's."""
    uid = _uid()
    with _filament() as filament, _spool(filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        assert_httpx_code(httpx.delete(f"{URL}/api/v1/filament/{filament['id']}/tag/{uid}"), 404)
        result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
        assert_httpx_success(result)
        assert [tag["uid"] for tag in result.json()["tags"]] == [uid]


def test_link_to_unknown_filament_is_404():
    assert_httpx_code(httpx.post(f"{URL}/api/v1/filament/-1/tag", json={"uid": _uid()}), 404)


@pytest.mark.parametrize("bad", ["", "not-a-uid", "04A2B3G4"])
def test_link_with_an_invalid_uid_is_rejected(bad: str):
    with _filament() as filament:
        result = httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": bad})
        # An empty UID fails Pydantic's min_length (422); the rest fail normalization (400).
        assert result.status_code in (400, 422), result.text


def test_deleting_a_filament_removes_its_tags():
    """Cascade: the tag row must go with the filament, or its UID would be permanently unusable."""
    uid = _uid()
    with _filament() as doomed:
        httpx.post(f"{URL}/api/v1/filament/{doomed['id']}/tag", json={"uid": uid}).raise_for_status()
        httpx.delete(f"{URL}/api/v1/filament/{doomed['id']}").raise_for_status()

    with _filament() as fresh:
        assert_httpx_code(httpx.post(f"{URL}/api/v1/filament/{fresh['id']}/tag", json={"uid": uid}), 201)


def test_spools_embed_their_filaments_tags():
    """Each spool carries its filament, and the filament's tags come with it, on get and on find."""
    uid = _uid()
    with _filament() as filament, _spool(filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid}).raise_for_status()

        got = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
        assert_httpx_success(got)
        assert [tag["uid"] for tag in got.json()["filament"]["tags"]] == [uid]
        assert got.json()["tags"] == []

        found = httpx.get(f"{URL}/api/v1/spool", params={"filament.id": filament["id"]})
        assert_httpx_success(found)
        assert [[tag["uid"] for tag in s["filament"]["tags"]] for s in found.json()] == [[uid]]


def test_find_filament_by_tag():
    uid = _uid()
    with _filament() as filament:
        httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.get(f"{URL}/api/v1/filament", params={"tag": uid.lower(), "limit": 10})
        assert_httpx_success(result)
        assert [f["id"] for f in result.json()] == [filament["id"]]
        # A limit makes the count a separate query; it must agree with the rows.
        assert result.headers["x-total-count"] == "1"


def test_find_by_tag_does_not_cross_kinds():
    """A spool's tag finds no filament, and a filament's tag finds no spool."""
    spool_uid, filament_uid = _uid(), _uid()
    with _filament() as filament, _spool(filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": spool_uid}).raise_for_status()
        httpx.post(f"{URL}/api/v1/filament/{filament['id']}/tag", json={"uid": filament_uid}).raise_for_status()

        filaments = httpx.get(f"{URL}/api/v1/filament", params={"tag": spool_uid})
        assert_httpx_success(filaments)
        assert filaments.json() == []

        spools = httpx.get(f"{URL}/api/v1/spool", params={"tag": filament_uid, "allow_archived": True})
        assert_httpx_success(spools)
        assert spools.json() == []


def test_find_by_unknown_tag_is_empty():
    result = httpx.get(f"{URL}/api/v1/filament", params={"tag": _uid()})
    assert_httpx_success(result)
    assert result.json() == []


@pytest.mark.parametrize("bad", ["not-a-uid", "04A2B3G4"])
def test_find_by_invalid_tag_is_400(bad: str):
    assert_httpx_code(httpx.get(f"{URL}/api/v1/filament", params={"tag": bad}), 400)
