"""Vendor related endpoints."""

import asyncio
import logging
from typing import Annotated, Union

from fastapi import APIRouter, Body, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, SettingEvent, SettingResponse
from spoolman.database import setting
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError
from spoolman.settings import SETTINGS, parse_setting
from spoolman.ws import websocket_manager

router = APIRouter(
    prefix="/setting",
    tags=["setting"],
)

# ruff: noqa: D103,B008

logger = logging.getLogger(__name__)


@router.websocket(
    "",
    name="Listen to setting changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("setting",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("setting",), websocket)


@router.get(
    "/{key}",
    name="Get setting",
    description=(
        "Get a specific setting. If the setting has not been set, the default value will be returned."
        "A websocket is served on the same path to listen for changes to the setting. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    response_model=SettingResponse,
    responses={404: {"model": Message}, 299: {"model": SettingEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    key: str,
) -> Union[SettingResponse, JSONResponse]:
    try:
        definition = parse_setting(key)
    except ValueError as e:
        return JSONResponse(status_code=404, content=Message(message=str(e)).dict())

    try:
        db_item = await setting.get(db, definition)
        value = db_item.value
        is_set = True
    except ItemNotFoundError:
        value = definition.default
        is_set = False

    return SettingResponse(
        value=value,
        is_set=is_set,
        type=definition.type,
    )


@router.get(
    "/",
    name="Get all settings",
    description=("Get all settings, set or not. If the setting has not been set, 'value' will be the default value."),
    response_model_exclude_none=True,
    response_model=dict[str, SettingResponse],
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Union[dict[str, SettingResponse], JSONResponse]:
    settings: dict[str, SettingResponse] = {}

    # First get all settings that have been set.
    db_items = await setting.get_all(db)
    for db_item in db_items:
        try:
            definition = parse_setting(db_item.key)
        except ValueError:
            continue  # Ignore settings that have been removed.

        settings[db_item.key] = SettingResponse(
            value=db_item.value,
            is_set=True,
            type=definition.type,
        )

    # Then get all settings that have not been set.
    for settingdef in SETTINGS.values():
        if settingdef.key not in settings:
            settings[settingdef.key] = SettingResponse(
                value=settingdef.default,
                is_set=False,
                type=settingdef.type,
            )

    return settings


@router.websocket(
    "/{key}",
    name="Listen to setting changes",
)
async def notify(
    websocket: WebSocket,
    key: str,
) -> None:
    try:
        parse_setting(key)
    except ValueError as e:
        await websocket.close(code=4040, reason=str(e))
        return

    await websocket.accept()
    websocket_manager.connect(("setting", str(key)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("setting", str(key)), websocket)


@router.post(
    "/{key}",
    name="Set setting",
    description=(
        "Set the value of a setting. The body must match the JSON type of the setting. "
        "An empty body or a body containing only 'null' will reset the setting to its default value. "
        "The new value will be returned."
    ),
    response_model_exclude_none=True,
    response_model=SettingResponse,
    responses={404: {"model": Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    key: str,
    body: Annotated[str, Body()],
) -> Union[SettingResponse, JSONResponse]:
    try:
        definition = parse_setting(key)
    except ValueError as e:
        return JSONResponse(status_code=404, content=Message(message=str(e)).dict())

    if body and body != "null":
        try:
            definition.validate_type(body)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

        await setting.update(db=db, definition=definition, value=body)
        logger.info('Setting "%s" has been set to "%s".', key, body)
    else:
        await setting.delete(db=db, definition=definition)
        logger.info('Setting "%s" has been unset.', key)

    await db.commit()

    # Get the new value of the setting.
    try:
        db_item = await setting.get(db, definition)
        value = db_item.value
        is_set = True
    except ItemNotFoundError:
        value = definition.default
        is_set = False

    return SettingResponse(
        value=value,
        is_set=is_set,
        type=definition.type,
    )
