"""Concurrent first-time saves of one setting key must not 500.

Regression guard for a race observed in the CI e2e run: `setting.update` uses
``db.merge`` (SELECT then INSERT/UPDATE), so two concurrent saves of a key that
does not exist yet can both miss the SELECT and both INSERT, and the loser died
with ``UNIQUE constraint failed: setting.key``. The endpoint now retries once on
IntegrityError, turning the loser's merge into an UPDATE.
"""

import asyncio
import json

from httpx import AsyncClient

HEADERS = {"content-type": "application/json"}


async def test_concurrent_first_time_setting_saves_all_succeed(client: AsyncClient):
    responses = await asyncio.gather(
        *(client.post("/api/v1/setting/currency", content=json.dumps(json.dumps("USD")), headers=HEADERS) for _ in range(5)),
    )
    assert [r.status_code for r in responses] == [200] * 5

    result = await client.get("/api/v1/setting/currency")
    assert result.status_code == 200
    body = result.json()
    assert body["is_set"] is True
    assert json.loads(body["value"]) == "USD"
