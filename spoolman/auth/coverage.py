"""Proof that every API route carries a permission gate.

Gating routes one at a time is fail-open: forget one and it silently serves
unauthenticated traffic, and nothing tells you until someone notices. This module
inverts that. It walks the route table and raises if any route lacks a gate, so a
forgotten one stops the process at import rather than becoming a hole.

It runs at import of :mod:`spoolman.api.v1.router`, which is the earliest possible
moment -- nothing registers routes after that -- and means the failure happens before
uvicorn binds a port, before migrations run, and equally when the module is imported by
the docs generator or a test.
"""

import logging
from collections.abc import Iterator
from typing import Final

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, APIWebSocketRoute
from starlette.routing import BaseRoute

from spoolman.auth.dependencies import AUTH_LEVEL_ATTR
from spoolman.auth.levels import Level

logger = logging.getLogger(__name__)

WEBSOCKET_METHOD: Final = "WEBSOCKET"


def _walk(routes: list[BaseRoute]) -> Iterator[BaseRoute]:
    """Yield every route, descending into included routers.

    FastAPI does not flatten ``include_router`` into the parent's route list; it stores
    a wrapper object holding the original router. Iterating ``app.routes`` alone
    therefore sees only the handful of routes declared directly on the app and would
    declare everything else covered.

    Args:
        routes: The route list to walk.

    Yields:
        BaseRoute: Each concrete route.

    """
    for route in routes:
        nested = getattr(route, "original_router", None)
        if nested is not None:
            yield from _walk(nested.routes)
        else:
            yield route


def _gate_level(dependant: Dependant) -> Level | None:
    """Find the permission level a route's dependencies enforce.

    Reads ``dependant.dependencies`` rather than the route's raw ``dependencies``
    argument, so that a gate declared as a handler parameter counts too.

    Args:
        dependant: The route's resolved dependency tree.

    Returns:
        Optional[Level]: The level enforced, or None if no gate is present.

    """
    for sub in dependant.dependencies:
        level = getattr(sub.call, AUTH_LEVEL_ATTR, None)
        if level is not None:
            return level
        nested = _gate_level(sub)
        if nested is not None:
            return nested
    return None


def find_uncovered(app: FastAPI, allow: frozenset[tuple[str, str]]) -> tuple[list[str], dict[str, Level]]:
    """Sort an app's routes into gated and ungated.

    Args:
        app: The application to inspect.
        allow: Method and path pairs that are intentionally public.

    Returns:
        tuple: The ungated route descriptions, and the level of each gated route.

    """
    missing: list[str] = []
    covered: dict[str, Level] = {}

    for route in _walk(app.routes):
        if isinstance(route, APIWebSocketRoute):
            methods = (WEBSOCKET_METHOD,)
            level = getattr(route.endpoint, AUTH_LEVEL_ATTR, None)
        elif isinstance(route, APIRoute):
            # HEAD is added implicitly alongside GET and shares its gate.
            methods = tuple(sorted(method for method in route.methods if method != "HEAD"))
            level = _gate_level(route.dependant)
        else:
            # Starlette's own routes: /openapi.json, /docs, /docs/oauth2-redirect and
            # /redoc. They serve the schema, not data.
            continue

        for method in methods:
            if (method, route.path) in allow:
                continue
            if level is None:
                missing.append(f"{method} {route.path}")
            else:
                covered[f"{method} {route.path}"] = level

    return missing, covered


def assert_routes_covered(app: FastAPI, allow: frozenset[tuple[str, str]]) -> dict[str, Level]:
    """Raise unless every route on an app carries a permission gate.

    Args:
        app: The application to inspect.
        allow: Method and path pairs that are intentionally public.

    Raises:
        RuntimeError: If any route lacks a gate.

    Returns:
        dict: The level enforced on each gated route.

    """
    missing, covered = find_uncovered(app, allow)
    if missing:
        listed = "\n  ".join(sorted(missing))
        raise RuntimeError(
            "Some API routes have no authentication gate, which would serve them "
            "unauthenticated whenever authentication is enabled. Add a "
            "require_level dependency, or a ws_authenticated decorator for websockets, "
            f"or list the route as intentionally public:\n  {listed}",
        )
    return covered
