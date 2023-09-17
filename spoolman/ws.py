"""Websocket functionality."""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebsocketManager:
    """Websocket manager."""

    def __init__(self) -> None:
        """Initialize."""
        self.connections: dict[str, set[WebSocket]] = {}

    def connect(self, pool: tuple[str, ...], websocket: WebSocket) -> None:
        """Connect a websocket."""
        pool_str = ",".join(pool)
        if pool_str not in self.connections:
            self.connections[pool_str] = set()
        self.connections[pool_str].add(websocket)
        logger.info(
            "Client %s is now listening on pool %s",
            websocket.client.host if websocket.client else "?",
            pool_str,
        )

    def disconnect(self, pool: tuple[str, ...], websocket: WebSocket) -> None:
        """Disconnect a websocket."""
        pool_str = ",".join(pool)
        if pool_str in self.connections:
            self.connections[pool_str].remove(websocket)
        logger.info(
            "Client %s has stopped listening on pool %s",
            websocket.client.host if websocket.client else "?",
            pool_str,
        )

    async def send(self, pool: tuple[str, ...], message: str) -> None:
        """Send a message to all websockets in a pool."""
        pool_str = ",".join(pool)
        if pool_str in self.connections:
            for websocket in self.connections[pool_str]:
                await websocket.send_text(message)


websocket_manager = WebsocketManager()
