"""Websocket functionality."""

import logging

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from spoolman.api.v1.models import Event

logger = logging.getLogger(__name__)


class SubscriptionTree:
    """Subscription tree.

    This is a tree structure that allows us to efficiently send messages to
    all websockets that are subscribed to a certain pool of events.

    You can subscribe to different levels of the tree, for example:
    - ("vendor", "1") will subscribe to events for vendor 1
    - ("vendor") will subscribe to events for all vendors
    - () will subscribe to events for all vendors, filaments and spools
    """

    def __init__(self) -> None:
        """Initialize."""
        self.children: dict[str, SubscriptionTree] = {}
        self.subscribers: set[WebSocket] = set()

    def add(self, path: tuple[str, ...], websocket: WebSocket) -> None:
        """Add a websocket to the subscription tree."""
        if len(path) == 0:
            self.subscribers.add(websocket)
        else:
            if path[0] not in self.children:
                self.children[path[0]] = SubscriptionTree()
            self.children[path[0]].add(path[1:], websocket)

    def remove(self, path: tuple[str, ...], websocket: WebSocket) -> None:
        """Remove a websocket from the subscription tree."""
        if len(path) == 0:
            self.subscribers.remove(websocket)
        elif path[0] in self.children:
            self.children[path[0]].remove(path[1:], websocket)

    async def send(self, path: tuple[str, ...], evt: Event) -> None:
        """Send a message to all websockets in this branch of the tree."""
        # Broadcast to all subscribers on this level.
        #
        # Every subscriber is isolated from every other one, which is load-bearing rather than
        # defensive. The state check below is not enough on its own: a socket can start closing
        # between it and the send, and starlette then raises ("connection is closing"). That
        # exception used to escape this loop, so ONE dying subscriber silently starved every
        # other subscriber in the pool -- on the shared tree that means a browser tab being
        # closed could stop Moonraker hearing about a spool. Iterating a snapshot matters for
        # the same reason: dropping a dead subscriber mutates the set being walked.
        for websocket in list(self.subscribers):
            if (
                websocket.client_state == WebSocketState.DISCONNECTED  # noqa: PLR1714
                or websocket.application_state == WebSocketState.DISCONNECTED
            ):
                # A bad disconnection may have occurred
                self._drop(websocket, path)
            elif (
                websocket.client_state == WebSocketState.CONNECTED
                and websocket.application_state == WebSocketState.CONNECTED
            ):
                try:
                    # exclude_none mirrors the REST endpoints' response_model_exclude_none=True so
                    # that websocket payloads and REST responses have an identical shape. Without
                    # this, unset fields arrive as explicit `null` over the websocket but are
                    # omitted over REST, which trips up clients that distinguish the two (e.g. the
                    # spool list's price fallback).
                    await websocket.send_text(evt.json(exclude_none=True))
                except Exception:  # noqa: BLE001 -- any write failure means this subscriber is gone
                    logger.debug("Dropping a subscriber that could not be written to", exc_info=True)
                    self._drop(websocket, path)

        # Send the message further down the tree
        if len(path) > 0 and path[0] in self.children:
            await self.children[path[0]].send(path[1:], evt)

    def _drop(self, websocket: WebSocket, path: tuple[str, ...]) -> None:
        """Drop a subscriber of THIS node that can no longer be written to.

        Deliberately not `self.remove(path, websocket)`: by the time send() is walking a node,
        `path` is the part of the route still to be traversed, not the pool the socket
        subscribed with, so `remove` would descend into a child and look in the wrong set --
        leaving the dead socket in place to fail again on the next event, and raising KeyError
        of its own. `discard` also makes the drop idempotent.
        """
        self.subscribers.discard(websocket)
        logger.info(
            "Forcing disconnection of client %s on pool %s",
            websocket.client.host if websocket.client else "?",
            ",".join(path),
        )


class WebsocketManager:
    """Websocket manager."""

    def __init__(self) -> None:
        """Initialize."""
        self.tree = SubscriptionTree()

    def connect(self, pool: tuple[str, ...], websocket: WebSocket) -> None:
        """Connect a websocket."""
        self.tree.add(pool, websocket)
        logger.info(
            "Client %s is now listening on pool %s",
            websocket.client.host if websocket.client else "?",
            ",".join(pool),
        )

    def disconnect(self, pool: tuple[str, ...], websocket: WebSocket) -> None:
        """Disconnect a websocket."""
        self.tree.remove(pool, websocket)
        logger.info(
            "Client %s has stopped listening on pool %s",
            websocket.client.host if websocket.client else "?",
            ",".join(pool),
        )

    async def send(self, pool: tuple[str, ...], evt: Event) -> None:
        """Send a message to all websockets in a pool."""
        await self.tree.send(pool, evt)


websocket_manager = WebsocketManager()

# Tag scans get their own manager, and therefore their own subscription tree, rather than a
# new resource in the one above.
#
# SubscriptionTree.send broadcasts to subscribers at every level along the path, and the root
# endpoint /api/v1/ subscribes with pool () -- "listen to any changes". Putting scans in the
# shared tree would push a novel resource into every existing root consumer's stream, which is
# an API v1 compatibility problem for no benefit: a scan is not a change to any data, and the
# clients that want scans want to filter them by reader rather than by entity.
#
# Pools here are (reader_id,) with () meaning "every reader", so the tree's propagate-along-the-
# path behaviour gives "follow all readers" for free.
scan_websocket_manager = WebsocketManager()
