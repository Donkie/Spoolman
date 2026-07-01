"""Integration tests for the NFC lookup/encode/bind endpoints (TESTING_CANDIDATES rows 21-23).

These are the external-reader (Klipper/Moonraker) paths and run without NFC hardware.
Oracle: the documented end-to-end contract observed over HTTP + DB — encode a spool,
look it back up by the emitted payload, and bind a tag with the review-fixed
duplicate-binding rule. No bytes are hand-asserted; the codec round-trip and the DB
matching are exercised through the real endpoints.
"""

import asyncio
import base64

from httpx import AsyncClient

from spoolman.tigertag_codec import TigerTagData, encode_ntag213

FIL = "/api/v1/filament"
SPOOL = "/api/v1/spool"
NFC = "/api/v1/nfc"


async def _make_spool(client: AsyncClient, **filament_fields: object) -> int:
    fil = await client.post(FIL, json={"density": 1.24, "diameter": 1.75, **filament_fields})
    assert fil.status_code == 200, fil.text
    sp = await client.post(SPOOL, json={"filament_id": fil.json()["id"]})
    assert sp.status_code == 200, sp.text
    return sp.json()["id"]


async def test_encode_then_lookup_round_trips_to_the_same_spool(client: AsyncClient):
    spool_id = await _make_spool(client, name="Round Trip PLA", color_hex="ff8800", material="PLA")

    encoded = await client.post(f"{NFC}/encode", json={"spool_id": spool_id})
    assert encoded.status_code == 200
    payload = encoded.json()
    assert payload["success"] is True
    assert payload["binary_b64"]

    looked_up = await client.post(f"{NFC}/lookup", json={"raw_data_b64": payload["binary_b64"]})
    assert looked_up.status_code == 200
    body = looked_up.json()
    assert body["success"] is True
    assert body["tag_format"] == "tigertag"
    # The tag carries id_product == spool.id (no external_id), so the lookup resolves
    # back to the originating spool.
    assert body["spool_id"] == spool_id
    assert body["tag_data"]["color_hex"] == "ff8800"


async def test_encode_missing_spool_reports_failure(client: AsyncClient):
    resp = await client.post(f"{NFC}/encode", json={"spool_id": 999999})
    assert resp.status_code == 200
    assert resp.json()["success"] is False


async def test_lookup_requires_some_input(client: AsyncClient):
    resp = await client.post(f"{NFC}/lookup", json={})
    assert resp.status_code == 200
    assert resp.json()["success"] is False


async def test_lookup_unmatched_payload_reports_no_match(client: AsyncClient):
    # A well-formed but unbound tag: id_product points at a non-existent spool.
    raw = encode_ntag213(TigerTagData(id_tigertag=0x5BF59264, id_product=987654, timestamp=111))
    resp = await client.post(f"{NFC}/lookup", json={"raw_data_b64": base64.b64encode(raw).decode()})
    body = resp.json()
    assert body["success"] is True
    assert body["spool_id"] is None


async def test_bind_rejects_binding_a_tag_already_bound_to_another_spool(client: AsyncClient):
    spool_a = await _make_spool(client, name="A")
    spool_b = await _make_spool(client, name="B")

    first = await client.post(f"{NFC}/bind", json={"spool_id": spool_a, "id_product": 28, "timestamp": 123456})
    assert first.json()["success"] is True
    assert first.json()["nfc_tag_id"] == "tigertag_28_123456"

    # Same tag → different spool must be rejected (review-fixed invariant).
    clash = await client.post(f"{NFC}/bind", json={"spool_id": spool_b, "id_product": 28, "timestamp": 123456})
    assert clash.json()["success"] is False
    assert str(spool_a) in clash.json()["message"]

    # Re-binding the SAME spool to the SAME tag is idempotent (success, no error).
    again = await client.post(f"{NFC}/bind", json={"spool_id": spool_a, "id_product": 28, "timestamp": 123456})
    assert again.json()["success"] is True


async def test_bind_requires_product_and_timestamp(client: AsyncClient):
    spool_id = await _make_spool(client, name="Needs key")
    resp = await client.post(f"{NFC}/bind", json={"spool_id": spool_id})
    assert resp.json()["success"] is False


async def _spool_count(client: AsyncClient) -> int:
    resp = await client.get(SPOOL)
    assert resp.status_code == 200
    return len(resp.json())


def _unstable_tigertag_b64() -> str:
    # id_product == 0 and timestamp == 0: no nfc_tag_id, no external_id — the
    # format-specific matchers can never re-find a spool created from this tag,
    # so only the payload-hash guard prevents duplicates.
    raw = encode_ntag213(TigerTagData(id_tigertag=0x5BF59264, id_material=7, weight=750))
    return base64.b64encode(raw).decode()


async def test_auto_create_is_idempotent_per_payload(client: AsyncClient):
    payload = _unstable_tigertag_b64()
    before = await _spool_count(client)

    first = await client.post(f"{NFC}/lookup", json={"raw_data_b64": payload, "auto_create": True})
    body = first.json()
    assert body["success"] is True
    created_id = body["spool_id"]
    assert created_id is not None
    assert "auto-created" in body["message"]

    second = await client.post(f"{NFC}/lookup", json={"raw_data_b64": payload, "auto_create": True})
    body2 = second.json()
    assert body2["success"] is True
    assert body2["spool_id"] == created_id
    assert "auto-created" not in body2["message"]

    assert await _spool_count(client) == before + 1


async def test_concurrent_auto_creates_of_the_same_tag_make_one_spool(client: AsyncClient):
    payload = _unstable_tigertag_b64()
    before = await _spool_count(client)

    responses = await asyncio.gather(
        *(client.post(f"{NFC}/lookup", json={"raw_data_b64": payload, "auto_create": True}) for _ in range(5))
    )
    ids = {r.json()["spool_id"] for r in responses}
    assert len(ids) == 1
    assert None not in ids
    assert await _spool_count(client) == before + 1


async def test_create_from_tag_retry_returns_the_already_bound_spool(client: AsyncClient):
    # A stable tag identity (product + timestamp): a second create call (client
    # retry / double submit) must return the existing spool, not a duplicate.
    body = {"tag_type": "tigertag", "id_product": 41, "timestamp": 424242, "id_material": 7}
    before = await _spool_count(client)

    first = await client.post(f"{NFC}/create-from-tag", json=body)
    assert first.json()["success"] is True
    created_id = first.json()["spool_id"]

    retry = await client.post(f"{NFC}/create-from-tag", json=body)
    assert retry.json()["success"] is True
    assert retry.json()["spool_id"] == created_id

    assert await _spool_count(client) == before + 1
