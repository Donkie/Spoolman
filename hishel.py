"""Top-level hishel shim for tests to ensure imports succeed and the package API used by Spoolman is available."""

class Controller:
    def __init__(self, allow_stale: bool = True):
        self.allow_stale = allow_stale


class AsyncFileStorage:
    def __init__(self, base_path=None):
        self.base_path = base_path


class AsyncInMemoryStorage:
    def __init__(self):
        pass


class _DummyResponse:
    def __init__(self, data: bytes = b""):
        self._data = data

    def raise_for_status(self):
        return None

    def read(self):
        return self._data


class AsyncCacheClient:
    def __init__(self, storage=None, controller=None):
        self.storage = storage
        self.controller = controller

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url: str):
        return _DummyResponse(b"[]")
