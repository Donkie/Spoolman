"""Tests for SubscriptionTree's broadcast isolation.

Regression cover for a bug that predates the scan relay but is easiest to hit through it: one
subscriber that could not be written to used to abort the whole broadcast, so every other
subscriber in the same pool silently received nothing. On the shared tree that meant a browser
tab closing could stop Moonraker hearing about a spool.
"""

from datetime import datetime, timezone

import pytest
from starlette.websockets import WebSocketState

from spoolman.api.v1.models import Event
from spoolman.ws import SubscriptionTree


def _event() -> Event:
    """Build the smallest thing SubscriptionTree.send will serialize."""
    return Event(
        type="updated",
        resource="test",
        date=datetime(2026, 8, 13, 12, 0, 0, tzinfo=timezone.utc),
        payload=Event.model_construct(),
    )


class FakeWebSocket:
    """A websocket that records what it was sent, and can fail or claim to be disconnected."""

    def __init__(self, *, fail: bool = False, disconnected: bool = False) -> None:
        """Initialize a connected socket, optionally one that fails or is already gone."""
        self.sent: list[str] = []
        self.fail = fail
        state = WebSocketState.DISCONNECTED if disconnected else WebSocketState.CONNECTED
        self.client_state = state
        self.application_state = state
        self.client = None

    async def send_text(self, text: str) -> None:
        """Record the frame, or blow up the way a closing socket does."""
        if self.fail:
            # What starlette raises for a socket that started closing after the state check.
            raise RuntimeError("connection is closing")
        self.sent.append(text)


@pytest.mark.asyncio
async def test_a_failing_subscriber_does_not_starve_the_others():
    """The bug: the send raised, the loop aborted, and everyone after it got nothing."""
    tree = SubscriptionTree()
    healthy_before, broken, healthy_after = FakeWebSocket(), FakeWebSocket(fail=True), FakeWebSocket()
    for ws in (healthy_before, broken, healthy_after):
        tree.add(("spool",), ws)

    await tree.send(("spool",), _event())

    assert len(healthy_before.sent) == 1
    assert len(healthy_after.sent) == 1


@pytest.mark.asyncio
async def test_a_failing_subscriber_is_dropped():
    """Dropped rather than left to fail again on every subsequent event."""
    tree = SubscriptionTree()
    broken, healthy = FakeWebSocket(fail=True), FakeWebSocket()
    tree.add(("spool",), broken)
    tree.add(("spool",), healthy)

    await tree.send(("spool",), _event())
    await tree.send(("spool",), _event())

    assert len(healthy.sent) == 2
    assert tree.children["spool"].subscribers == {healthy}


@pytest.mark.asyncio
async def test_a_disconnected_subscriber_is_dropped_from_its_own_pool():
    """The drop has to happen on the node being walked, not wherever the remaining path points."""
    tree = SubscriptionTree()
    dead, healthy = FakeWebSocket(disconnected=True), FakeWebSocket()
    # Both subscribe at the ROOT, so send() meets them while `path` still has ("spool",) left
    # to walk. Removing via that path would look inside the "spool" child instead.
    tree.add((), dead)
    tree.add((), healthy)

    await tree.send(("spool",), _event())

    assert tree.subscribers == {healthy}
    assert len(healthy.sent) == 1


@pytest.mark.asyncio
async def test_broadcast_still_propagates_down_the_tree_after_a_failure():
    """A failure at one level must not cost the levels below it their event."""
    tree = SubscriptionTree()
    broken_root, deep = FakeWebSocket(fail=True), FakeWebSocket()
    tree.add((), broken_root)
    tree.add(("spool", "1"), deep)

    await tree.send(("spool", "1"), _event())

    assert len(deep.sent) == 1
