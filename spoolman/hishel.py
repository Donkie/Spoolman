"""A minimal compatibility shim for tests to emulate the hishel API used by Spoolman.

This provides simple dummy classes used at import-time so unit tests don't depend on the installed
hishel implementation.
"""

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
        # Return a simple dummy response. Tests that need real responses should monkeypatch
        # methods that call out to network functionality.
        return _DummyResponse(b"[]")
