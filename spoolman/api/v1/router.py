"""Router setup for the v1 version of the API."""

# ruff: noqa: D103

import asyncio
import logging

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from starlette.requests import Request
from starlette.responses import Response

from spoolman import env
from spoolman.auth.coverage import assert_routes_covered
from spoolman.auth.dependencies import require_level, ws_authenticated
from spoolman.auth.levels import Level
from spoolman.database.database import backup_global_db
from spoolman.exceptions import AuthenticationRequiredError, ItemNotFoundError, PermissionDeniedError
from spoolman.externaldb import get_external_db_name
from spoolman.ws import websocket_manager

from . import auth, export, externaldb, field, filament, models, other, search, setting, spool, vendor

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Spoolman REST API v1",
    version="1.0.0",
    description="""
    REST API for Spoolman.

    The API is served on the path `/api/v1/`.

    Some endpoints also serve a websocket on the same path. The websocket is used to listen for changes to the data
    that the endpoint serves. The websocket messages are JSON objects. Additionally, there is a root-level websocket
    endpoint that listens for changes to any data in the database.
    """,
)


@app.exception_handler(ItemNotFoundError)
async def itemnotfounderror_exception_handler(_request: Request, exc: ItemNotFoundError) -> Response:
    logger.debug(exc)
    return JSONResponse(
        status_code=404,
        content={"message": exc.args[0]},
    )


# The body shape matches models.Message, the same as every other error this API returns,
# rather than FastAPI's default {"detail": ...}. Handlers have to be registered on this
# app and not the outer one: Starlette resolves them from the mounted app that owns the
# route, which is why the handler above lives here too.
@app.exception_handler(AuthenticationRequiredError)
async def authenticationrequirederror_exception_handler(
    _request: Request,
    exc: AuthenticationRequiredError,
) -> Response:
    logger.debug(exc)
    return JSONResponse(
        status_code=401,
        content={"message": exc.args[0]},
    )


@app.exception_handler(PermissionDeniedError)
async def permissiondeniederror_exception_handler(_request: Request, exc: PermissionDeniedError) -> Response:
    logger.debug(exc)
    return JSONResponse(
        status_code=403,
        content={"message": exc.args[0]},
    )


# Add a general info endpoint
@app.get("/info", dependencies=[Depends(require_level(Level.READ))])
async def info() -> models.Info:
    """Return general info about the API."""
    return models.Info(
        version=env.get_version(),
        debug_mode=env.is_debug_mode(),
        automatic_backups=env.is_automatic_backup_enabled(),
        data_dir=str(env.get_data_dir().resolve()),
        logs_dir=str(env.get_logs_dir().resolve()),
        backups_dir=str(env.get_backups_dir().resolve()),
        db_type=str(env.get_database_type() or "sqlite"),
        external_db_name=get_external_db_name(),
        git_commit=env.get_commit_hash(),
        build_date=env.get_build_date(),
    )


# Add health check endpoint
@app.get("/health")
async def health() -> models.HealthCheck:
    """Return a health check."""
    return models.HealthCheck(status="healthy")


# Add endpoint for triggering a db backup
@app.post(
    "/backup",
    description="Trigger a database backup. Only applicable for SQLite databases.",
    response_model=models.BackupResponse,
    responses={500: {"model": models.Message}},
    dependencies=[Depends(require_level(Level.MANAGE))],
)
async def backup():  # noqa: ANN201
    """Trigger a database backup."""
    path = await backup_global_db()
    if path is None:
        return JSONResponse(
            status_code=500,
            content={"message": "Backup failed. See server logs for more information."},
        )
    return models.BackupResponse(path=str(path))


@app.websocket(
    "/",
    name="Listen to any changes",
)
@ws_authenticated(Level.READ)
async def notify(
    websocket: WebSocket,
) -> None:
    websocket_manager.connect((), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect((), websocket)


# Add routers
app.include_router(auth.router)
app.include_router(filament.router)
app.include_router(spool.router)
app.include_router(vendor.router)
app.include_router(setting.router)
app.include_router(field.router)
app.include_router(other.router)
app.include_router(externaldb.router)
app.include_router(export.router)
app.include_router(search.router)


# Routes that must stay reachable without credentials.
#
# /health is polled by container healthchecks and by the frontend test harness, and is
# the one endpoint that has to answer before anyone can possibly be signed in. The auth
# endpoints bootstrap a session, so requiring one would be circular; each performs its
# own checking. Everything else is gated.
PUBLIC_ROUTES = frozenset(
    {
        ("GET", "/health"),
        # Signing in is how a credential is obtained, so requiring one would be
        # circular. Each of these checks for itself: /setup refuses once an account
        # exists, /login throttles and verifies, /logout and /session are read-only
        # about the caller and answer honestly when there is no session.
        ("GET", "/auth/config"),
        ("POST", "/auth/setup"),
        ("POST", "/auth/login"),
        ("POST", "/auth/logout"),
        ("GET", "/auth/session"),
    },
)

# Proving coverage here, at import, is the point: a route added without a gate stops the
# process immediately rather than quietly serving unauthenticated traffic. This runs
# before uvicorn binds a port and before migrations, and equally when the module is
# imported by the docs generator or a test.
ROUTE_LEVELS = assert_routes_covered(app, PUBLIC_ROUTES)
