import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient

from spoolman.api.v1 import router as api_router
from spoolman.database.database import get_db_session


class FakeAsyncSession:
    """Minimal fake async DB session to satisfy tests."""

    async def get(self, *args, **kwargs):
        return None

    async def commit(self):
        return None

    async def execute(self, *args, **kwargs):
        class _Result:
            def scalar_one_or_none(self):
                return None

            def scalars(self):
                return self

        return _Result()


@pytest.fixture(autouse=True)
def _override_db_dependency():
    async def fake_get_db_session():
        yield FakeAsyncSession()

    api_router.app.dependency_overrides[get_db_session] = fake_get_db_session
    yield
    api_router.app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
def client():
    # Don't raise server exceptions so we can assert on 500 responses in tests
    return TestClient(api_router.app, raise_server_exceptions=False)
