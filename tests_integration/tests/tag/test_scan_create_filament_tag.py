"""A tag linked to a filament counts as already linked, so `create: true` must not act on it.

A tag can identify a filament as well as a spool. Auto-create only ever fills in a tag that
is linked to nothing; it never overwrites or relinks one -- see test_scan_create.py.
"""

import base64
import uuid
from typing import Any

import httpx

from .._openprinttag_fixtures import MATERIAL_TYPE_PLA, MF_BRAND_NAME, MF_MATERIAL_TYPE, build_openprinttag
from ..conftest import URL, assert_httpx_success


def test_create_true_does_not_act_on_a_tag_linked_to_a_filament(random_filament: dict[str, Any]):
    uid = uuid.uuid4().hex[:14].upper()
    httpx.post(f"{URL}/api/v1/filament/{random_filament['id']}/tag", json={"uid": uid}).raise_for_status()
    spools_before = len(httpx.get(f"{URL}/api/v1/spool").json())

    payload = base64.b64encode(build_openprinttag({MF_MATERIAL_TYPE: MATERIAL_TYPE_PLA, MF_BRAND_NAME: "Prusament"}))
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": uid,
            "reader_id": f"reader-{uuid.uuid4().hex[:8]}",
            "format": "openprinttag",
            "payload_b64": payload.decode("ascii"),
            "create": True,
        },
    )
    assert_httpx_success(result)

    body = result.json()
    assert body["matched_filament_id"] == random_filament["id"]
    assert body["matched_spool_id"] is None
    assert body["created"] is False
    assert len(httpx.get(f"{URL}/api/v1/spool").json()) == spools_before
