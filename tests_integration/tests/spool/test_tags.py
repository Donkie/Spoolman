"""Integration tests: linking physical NFC/RFID tags to spools, and looking a spool up by one.

The point of the `tag` table is that one tag identifies exactly one thing, enforced by the
database rather than by whichever client wrote last. These tests pin that from both ends: the
409 that stops a second spool claiming a tag, and the normalization that stops the same physical
tag being linked twice under two spellings.
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
def _spool(filament_id: int, **kwargs: object) -> Iterator[dict[str, Any]]:
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id, **kwargs})
    assert_httpx_success(result)
    spool = result.json()
    try:
        yield spool
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


def _get_spool(spool_id: int) -> dict[str, Any]:
    result = httpx.get(f"{URL}/api/v1/spool/{spool_id}")
    assert_httpx_success(result)
    return result.json()


def test_link_tag(random_filament: dict[str, Any]):
    """Linking returns the stored tag and adds it to the spool."""
    uid = _uid()
    with _spool(random_filament["id"]) as spool:
        result = httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid, "format": "ntag"})
        assert_httpx_code(result, 201)

        tag = result.json()
        assert tag["uid"] == uid
        assert tag["format"] == "ntag"
        assert "added" in tag

        assert _get_spool(spool["id"])["tags"] == [tag]


def test_spool_with_no_tags_has_an_empty_list(random_filament: dict[str, Any]):
    """`tags` is always present, so a client never has to distinguish absent from empty."""
    with _spool(random_filament["id"]) as spool:
        assert spool["tags"] == []
        assert _get_spool(spool["id"])["tags"] == []


def test_link_tag_without_a_format(random_filament: dict[str, Any]):
    """Format is optional; a reader that only knows the UID can still link."""
    with _spool(random_filament["id"]) as spool:
        result = httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": _uid()})
        assert_httpx_code(result, 201)
        # exclude_none omits it rather than sending an explicit null.
        assert "format" not in result.json()


@pytest.mark.parametrize(
    "reported",
    ["{uid}", "{lower}", "{colons}", "{dashes}", "{spaces}"],
)
def test_uid_is_normalized_on_write(random_filament: dict[str, Any], reported: str):
    """Every shape a reader can report writes the same canonical UID."""
    uid = _uid()
    spelling = reported.format(
        uid=uid,
        lower=uid.lower(),
        colons=":".join(uid[i : i + 2] for i in range(0, len(uid), 2)),
        dashes="-".join(uid[i : i + 2] for i in range(0, len(uid), 2)).lower(),
        spaces=" ".join(uid[i : i + 2] for i in range(0, len(uid), 2)),
    )
    with _spool(random_filament["id"]) as spool:
        result = httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": spelling})
        assert_httpx_code(result, 201)
        assert result.json()["uid"] == uid


def test_link_is_idempotent(random_filament: dict[str, Any]):
    """Re-linking a tag to the spool that already holds it succeeds and adds nothing."""
    uid = _uid()
    with _spool(random_filament["id"]) as spool:
        for _ in range(3):
            assert_httpx_code(httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}), 201)

        tags = _get_spool(spool["id"])["tags"]
        assert len(tags) == 1
        assert tags[0]["uid"] == uid


def test_relinking_with_a_format_refines_the_stored_one(random_filament: dict[str, Any]):
    """A later scan generally knows more about the tag than the first one did."""
    uid = _uid()
    with _spool(random_filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()
        result = httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid, "format": "openprinttag"})
        assert_httpx_code(result, 201)

        tags = _get_spool(spool["id"])["tags"]
        assert len(tags) == 1
        assert tags[0]["format"] == "openprinttag"


def test_duplicate_uid_on_another_spool_is_a_conflict(random_filament: dict[str, Any]):
    """One tag, one spool. The conflicting spool's id comes back so a client can offer to move it."""
    uid = _uid()
    with _spool(random_filament["id"]) as first, _spool(random_filament["id"]) as second:
        httpx.post(f"{URL}/api/v1/spool/{first['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.post(f"{URL}/api/v1/spool/{second['id']}/tag", json={"uid": uid})
        assert_httpx_code(result, 409)
        assert result.json()["spool_id"] == first["id"]
        assert "message" in result.json()

        # The losing spool got nothing.
        assert _get_spool(second["id"])["tags"] == []


def test_conflict_is_detected_across_uid_spellings(random_filament: dict[str, Any]):
    """A different spelling of a linked tag is the same tag, so it conflicts.

    Normalization is what makes the unique index mean anything: without it, one physical tag
    could occupy three rows on three spools and no constraint would notice.
    """
    uid = _uid()
    with _spool(random_filament["id"]) as first, _spool(random_filament["id"]) as second:
        httpx.post(f"{URL}/api/v1/spool/{first['id']}/tag", json={"uid": uid}).raise_for_status()

        colons = ":".join(uid[i : i + 2] for i in range(0, len(uid), 2)).lower()
        result = httpx.post(f"{URL}/api/v1/spool/{second['id']}/tag", json={"uid": colons})
        assert_httpx_code(result, 409)
        assert result.json()["spool_id"] == first["id"]


def test_many_tags_on_one_spool(random_filament: dict[str, Any]):
    """A spool can carry a vendor tag and a copy of it on a blank sticker; a real case (#776)."""
    uids = sorted(_uid() for _ in range(3))
    with _spool(random_filament["id"]) as spool:
        for uid in uids:
            httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        assert sorted(tag["uid"] for tag in _get_spool(spool["id"])["tags"]) == uids


def test_unlink_tag(random_filament: dict[str, Any]):
    uid = _uid()
    with _spool(random_filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        assert_httpx_code(httpx.delete(f"{URL}/api/v1/spool/{spool['id']}/tag/{uid}"), 204)
        assert _get_spool(spool["id"])["tags"] == []


def test_unlink_accepts_any_uid_spelling(random_filament: dict[str, Any]):
    uid = _uid()
    with _spool(random_filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()
        assert_httpx_code(httpx.delete(f"{URL}/api/v1/spool/{spool['id']}/tag/{uid.lower()}"), 204)
        assert _get_spool(spool["id"])["tags"] == []


def test_unlinking_frees_the_uid(random_filament: dict[str, Any]):
    """After unlinking, another spool can take the tag -- the unique row really is gone."""
    uid = _uid()
    with _spool(random_filament["id"]) as first, _spool(random_filament["id"]) as second:
        httpx.post(f"{URL}/api/v1/spool/{first['id']}/tag", json={"uid": uid}).raise_for_status()
        httpx.delete(f"{URL}/api/v1/spool/{first['id']}/tag/{uid}").raise_for_status()

        assert_httpx_code(httpx.post(f"{URL}/api/v1/spool/{second['id']}/tag", json={"uid": uid}), 201)


def test_unlink_unknown_tag_is_404(random_filament: dict[str, Any]):
    with _spool(random_filament["id"]) as spool:
        assert_httpx_code(httpx.delete(f"{URL}/api/v1/spool/{spool['id']}/tag/{_uid()}"), 404)


def test_unlink_tag_belonging_to_another_spool_is_404(random_filament: dict[str, Any]):
    """A tag is only unlinkable from the spool that holds it."""
    uid = _uid()
    with _spool(random_filament["id"]) as first, _spool(random_filament["id"]) as second:
        httpx.post(f"{URL}/api/v1/spool/{first['id']}/tag", json={"uid": uid}).raise_for_status()

        assert_httpx_code(httpx.delete(f"{URL}/api/v1/spool/{second['id']}/tag/{uid}"), 404)
        assert len(_get_spool(first["id"])["tags"]) == 1


def test_link_to_unknown_spool_is_404():
    assert_httpx_code(httpx.post(f"{URL}/api/v1/spool/-1/tag", json={"uid": _uid()}), 404)


@pytest.mark.parametrize("bad", ["", "not-a-uid", "04A2B3G4", "!!!"])
def test_link_with_an_invalid_uid_is_rejected(random_filament: dict[str, Any], bad: str):
    """A UID is hexadecimal by definition; junk is a client bug, not a row worth storing."""
    with _spool(random_filament["id"]) as spool:
        result = httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": bad})
        # An empty UID fails Pydantic's min_length (422); the rest fail normalization (400).
        assert result.status_code in (400, 422), result.text


def test_deleting_a_spool_removes_its_tags(random_filament: dict[str, Any]):
    """Cascade: the tag row must go with the spool, or its UID would be permanently unusable."""
    uid = _uid()
    with _spool(random_filament["id"]) as doomed:
        httpx.post(f"{URL}/api/v1/spool/{doomed['id']}/tag", json={"uid": uid}).raise_for_status()
        httpx.delete(f"{URL}/api/v1/spool/{doomed['id']}").raise_for_status()

    with _spool(random_filament["id"]) as fresh:
        assert_httpx_code(httpx.post(f"{URL}/api/v1/spool/{fresh['id']}/tag", json={"uid": uid}), 201)


def test_find_spool_by_tag(random_filament: dict[str, Any]):
    """Answer the lookup the whole ecosystem has been working around: which spool is this tag."""
    uid = _uid()
    with _spool(random_filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.get(f"{URL}/api/v1/spool", params={"tag": uid})
        assert_httpx_success(result)

        found = result.json()
        assert len(found) == 1
        assert found[0]["id"] == spool["id"]
        assert result.headers["x-total-count"] == "1"


@pytest.mark.parametrize("style", ["lower", "colons", "dashes"])
def test_find_by_tag_normalizes_the_query(random_filament: dict[str, Any], style: str):
    """A reader querying with its own spelling finds the spool it linked."""
    uid = _uid()
    spellings = {
        "lower": uid.lower(),
        "colons": ":".join(uid[i : i + 2] for i in range(0, len(uid), 2)),
        "dashes": "-".join(uid[i : i + 2] for i in range(0, len(uid), 2)).lower(),
    }
    with _spool(random_filament["id"]) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        result = httpx.get(f"{URL}/api/v1/spool", params={"tag": spellings[style]})
        assert_httpx_success(result)
        assert [s["id"] for s in result.json()] == [spool["id"]]


def test_find_by_unknown_tag_is_empty():
    """An unknown tag is not an error; it is a tag nobody has linked yet."""
    result = httpx.get(f"{URL}/api/v1/spool", params={"tag": _uid()})
    assert_httpx_success(result)
    assert result.json() == []
    assert result.headers["x-total-count"] == "0"


@pytest.mark.parametrize("bad", ["not-a-uid", "04A2B3G4"])
def test_find_by_invalid_tag_is_400(bad: str):
    assert_httpx_code(httpx.get(f"{URL}/api/v1/spool", params={"tag": bad}), 400)


def test_find_by_tag_respects_allow_archived(random_filament: dict[str, Any]):
    """The tag filter behaves like every other filter: archived spools are hidden by default."""
    uid = _uid()
    with _spool(random_filament["id"], archived=True) as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        assert httpx.get(f"{URL}/api/v1/spool", params={"tag": uid}).json() == []

        result = httpx.get(f"{URL}/api/v1/spool", params={"tag": uid, "allow_archived": True})
        assert_httpx_success(result)
        assert [s["id"] for s in result.json()] == [spool["id"]]


def test_find_by_tag_combines_with_other_filters(random_filament: dict[str, Any]):
    """The tag join goes through the shared filter builder, so it composes and the count agrees."""
    uid = _uid()
    with _spool(random_filament["id"], location="Shelf T") as spool:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        matching = httpx.get(f"{URL}/api/v1/spool", params={"tag": uid, "location": "Shelf T", "limit": 10})
        assert_httpx_success(matching)
        assert [s["id"] for s in matching.json()] == [spool["id"]]
        assert matching.headers["x-total-count"] == "1"

        # A limit makes the count a separate query; it must agree with the rows.
        missing = httpx.get(f"{URL}/api/v1/spool", params={"tag": uid, "location": "Nowhere", "limit": 10})
        assert_httpx_success(missing)
        assert missing.json() == []
        assert missing.headers["x-total-count"] == "0"
