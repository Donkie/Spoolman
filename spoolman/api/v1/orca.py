"""OrcaCloud integration endpoints."""

import json
import logging
import secrets
import time
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman import orca_cloud
from spoolman.api.v1.models import Message
from spoolman.database import filament as filament_db
from spoolman.database import setting as setting_db
from spoolman.database import vendor as vendor_db
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError
from spoolman.extra_fields import EntityType as ExtraEntityType
from spoolman.extra_fields import get_extra_fields
from spoolman.settings import SettingDefinition, SettingType

# ruff: noqa: D103

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/orca",
    tags=["orca"],
)

# ── In-memory OAuth session store ─────────────────────────────────────────────
# Keys are random session IDs; values hold PKCE state and the resolved tokens.
# Fine for single-instance home use; sessions are cleaned up after use.
_sessions: dict[str, dict] = {}

# ── Persisted OrcaCloud sign-in ───────────────────────────────────────────────
# Deliberately NOT registered via settings.register_setting(): that registry
# backs the public GET/POST /setting/ endpoints, which would otherwise expose
# these refresh/access tokens to anyone who can reach the API. Storing it
# through the same Setting table/DB row mechanism (unregistered key) keeps
# persistence but stays invisible to that generic surface — setting.py's
# get/update only need a SettingDefinition, not registry membership, and the
# /setting/ list/get endpoints silently skip unregistered keys.
_TOKEN_SETTING = SettingDefinition(key="orca_cloud_tokens", type=SettingType.OBJECT, default=json.dumps({}))


async def _load_tokens(db: AsyncSession) -> dict | None:
    """Return the persisted OrcaCloud tokens, or None if never connected."""
    try:
        row = await setting_db.get(db, _TOKEN_SETTING)
    except ItemNotFoundError:
        return None
    data = json.loads(row.value)
    return data or None


async def _save_tokens(db: AsyncSession, access_token: str, refresh_token: str, expires_in: int) -> None:
    payload = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": time.time() + expires_in,
    }
    await setting_db.update(db=db, definition=_TOKEN_SETTING, value=json.dumps(payload))
    await db.commit()


async def _get_valid_access_token(db: AsyncSession) -> str | None:
    """Return a usable OrcaCloud access token, refreshing it if it's expired.

    Returns None if Spoolman has never completed a sign-in, or if the stored
    refresh token has itself expired/been revoked (user needs to sign in
    again via Settings → OrcaCloud).
    """
    tokens = await _load_tokens(db)
    if not tokens:
        return None

    # Refresh a little early to avoid racing an in-flight request's expiry.
    if tokens["expires_at"] - 60 > time.time():
        return tokens["access_token"]

    try:
        refreshed = await orca_cloud.refresh_access_token(tokens["refresh_token"])
    except orca_cloud.OrcaAuthError:
        logger.warning("OrcaCloud token refresh failed — user will need to sign in again")
        return None

    await _save_tokens(db, refreshed["access_token"], refreshed["refresh_token"], refreshed["expires_in"])
    return refreshed["access_token"]


# ── Request / response models ──────────────────────────────────────────────────


class OrcaImportRequest(BaseModel):
    session_id: str | None = Field(
        None,
        description="OAuth session ID returned by /orca/auth/start, after /orca/auth/callback has completed it.",
    )
    access_token: str | None = Field(None, description="Raw OrcaCloud access token.")
    # If neither is given, falls back to the persisted sign-in from a prior /orca/auth/callback.


class OrcaImportResponse(BaseModel):
    created: int = Field(description="Number of new filament profiles created in Spoolman.")
    updated: int = Field(description="Number of existing filament profiles updated in Spoolman.")
    skipped: int = Field(description="Number of cloud profiles skipped (not filament profiles).")


class OrcaAuthStartResponse(BaseModel):
    auth_url: str = Field(description="URL to open in the browser for Google sign-in.")
    session_id: str = Field(description="Session ID to pass to /orca/auth/callback and /orca/import.")


class OrcaAuthCallbackRequest(BaseModel):
    session_id: str = Field(description="Session ID returned by /orca/auth/start.")
    callback_url: str = Field(
        description=(
            "The URL the browser landed on after sign-in completed (it will fail to load — "
            "that's expected). Copy it from the address bar."
        ),
    )


class OrcaAuthStatusResponse(BaseModel):
    status: str = Field(description="'complete' or 'error'.")
    message: str | None = Field(None, description="Error message if status is 'error'.")


class OrcaProfileField(BaseModel):
    key: str
    name: str
    field_type: str
    unit: str | None = None


class OrcaConnectionStatusResponse(BaseModel):
    connected: bool = Field(description="Whether Spoolman has a stored OrcaCloud sign-in it can reuse.")


class OrcaFilamentProfileSummary(BaseModel):
    orca_id: str = Field(description="Cloud sync row UUID — identity for the picker, NOT the orca_filament_id value.")
    filament_id: str | None = Field(
        None,
        description="Raw filament_id from profile content, for the orca_filament_id extra field.",
    )
    setting_id: str | None = Field(None, description="Raw filament_settings_id, for the orca_setting_id extra field.")
    name: str
    vendor: str | None = None
    material: str | None = None
    color_hex: str | None = None
    content: dict = Field(
        default_factory=dict,
        description=(
            "Full raw OrcaSlicer profile content, so a client can match it against whatever "
            "extra fields the user has defined (same key-matching /orca/import uses), without "
            "Spoolman itself deciding which fields to write."
        ),
    )


class OrcaPasswordLoginRequest(BaseModel):
    email: str
    password: str


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get(
    "/profile-fields",
    summary="List mappable OrcaSlicer filament profile fields",
    description=(
        "Returns a curated list of OrcaSlicer filament profile fields that can be mapped to "
        "Spoolman extra fields. Once an extra field key matches a profile field key, the import "
        "endpoint will automatically populate it from the OrcaSlicer profile data."
    ),
)
async def get_profile_fields() -> list[OrcaProfileField]:
    return [OrcaProfileField(**f) for f in orca_cloud.ORCA_PROFILE_FIELDS]


@router.post(
    "/auth/start",
    response_model=OrcaAuthStartResponse,
    responses={400: {"model": Message}},
    summary="Start Google/Apple OAuth login flow",
    description=(
        "Generates PKCE parameters and returns the OrcaCloud sign-in URL for the given provider "
        "('google' or 'apple', default 'google'). Open the URL in the browser and complete "
        "sign-in. It will redirect to a localhost:41172 URL that fails to load — that's "
        "expected, nothing needs to be listening there. Copy that URL from the address bar and "
        "pass it to /orca/auth/callback."
    ),
)
async def auth_start(provider: str = "google") -> OrcaAuthStartResponse | JSONResponse:
    if provider not in orca_cloud.OAUTH_PROVIDERS:
        return JSONResponse(
            status_code=400,
            content={"message": f"Unknown provider {provider!r}. Must be one of {orca_cloud.OAUTH_PROVIDERS}."},
        )

    session_id = secrets.token_hex(16)
    code_verifier, code_challenge = orca_cloud.generate_pkce()

    _sessions[session_id] = {
        "code_verifier": code_verifier,
        "status": "pending",
        "access_token": None,
        "error": None,
    }

    auth_url = orca_cloud.get_oauth_url(provider, code_challenge)
    return OrcaAuthStartResponse(auth_url=auth_url, session_id=session_id)


@router.post(
    "/auth/callback",
    response_model=OrcaAuthStatusResponse,
    responses={400: {"model": Message}, 401: {"model": Message}},
    summary="Complete Google OAuth login using a pasted callback URL",
    description=(
        "Extracts the auth code from the callback URL the user copied out of their browser's "
        "address bar, and exchanges it for an OrcaCloud access token. On success, the session "
        "is ready for /orca/import, and the sign-in is also persisted so /orca/profiles can "
        "reuse it later without going through this flow again."
    ),
)
async def auth_callback(
    body: OrcaAuthCallbackRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrcaAuthStatusResponse | JSONResponse:
    session = _sessions.get(body.session_id)
    if session is None:
        return JSONResponse(status_code=400, content={"message": "Session not found or already used."})

    code, _state = orca_cloud.parse_callback_url(body.callback_url)
    if not code:
        return JSONResponse(
            status_code=400,
            content={"message": "No auth code found in that URL — make sure you copied the full address."},
        )
    # _state is GoTrue's own opaque state value, not one we generated (see
    # get_oauth_url) — nothing to compare it against.

    try:
        tokens = await orca_cloud.exchange_pkce_code(code, session["code_verifier"])
    except orca_cloud.OrcaAuthError as exc:
        session["status"] = "error"
        session["error"] = str(exc)
        return JSONResponse(status_code=401, content={"message": str(exc)})

    session["access_token"] = tokens["access_token"]
    session["status"] = "complete"
    await _save_tokens(db, tokens["access_token"], tokens["refresh_token"], tokens["expires_in"])
    return OrcaAuthStatusResponse(status="complete")


@router.post(
    "/auth/password",
    response_model=OrcaAuthStatusResponse,
    responses={401: {"model": Message}},
    summary="Sign in to OrcaCloud with email and password",
    description=(
        "Direct email/password sign-in — unlike Google/Apple, this is a single API call with no "
        "browser redirect or pasted-URL step. On success, persists the connection the same way "
        "as /orca/auth/callback."
    ),
)
async def auth_password(
    body: OrcaPasswordLoginRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrcaAuthStatusResponse | JSONResponse:
    try:
        tokens = await orca_cloud.exchange_password(body.email, body.password)
    except orca_cloud.OrcaAuthError as exc:
        return JSONResponse(status_code=401, content={"message": str(exc)})

    await _save_tokens(db, tokens["access_token"], tokens["refresh_token"], tokens["expires_in"])
    return OrcaAuthStatusResponse(status="complete")


@router.get(
    "/auth/status",
    summary="Check whether Spoolman has a stored OrcaCloud sign-in",
    description=(
        "Reports whether a previous /orca/auth/callback has left a reusable sign-in persisted, "
        "so callers (e.g. a profile picker) can tell whether /orca/profiles will work without "
        "prompting the user to go through Settings → OrcaCloud first."
    ),
)
async def auth_status(db: Annotated[AsyncSession, Depends(get_db_session)]) -> OrcaConnectionStatusResponse:
    tokens = await _load_tokens(db)
    return OrcaConnectionStatusResponse(connected=tokens is not None)


@router.get(
    "/profiles",
    response_model=list[OrcaFilamentProfileSummary],
    responses={401: {"model": Message}},
    summary="List synced OrcaCloud filament profiles",
    description=(
        "Fetches the user's synced OrcaCloud filament profiles using the persisted sign-in from "
        "a prior /orca/auth/callback. Intended for a picker UI to fill in a single filament's "
        "orca_filament_id/orca_setting_id extra fields, as an alternative to the bulk /orca/import."
    ),
)
async def list_profiles(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[OrcaFilamentProfileSummary] | JSONResponse:
    access_token = await _get_valid_access_token(db)
    if access_token is None:
        return JSONResponse(
            status_code=401,
            content={"message": "Not connected to OrcaCloud. Sign in from Settings → OrcaCloud first."},
        )

    raw_profiles = await orca_cloud.fetch_profiles(access_token)
    summaries: list[OrcaFilamentProfileSummary] = []
    for raw in raw_profiles:
        profile = orca_cloud.parse_filament_profile(raw)
        if profile is None:
            continue
        summaries.append(
            OrcaFilamentProfileSummary(
                orca_id=profile.orca_id,
                filament_id=profile.filament_id,
                setting_id=profile.setting_id,
                name=profile.name,
                vendor=profile.vendor,
                material=profile.material,
                color_hex=profile.color_hex,
                content=profile.content,
            ),
        )
    return summaries


@router.delete(
    "/auth",
    summary="Forget the stored OrcaCloud sign-in",
    description=(
        "Clears the persisted access/refresh token. You'll need to sign in again before "
        "/orca/profiles or /orca/import will work without passing an explicit access_token."
    ),
)
async def auth_disconnect(db: Annotated[AsyncSession, Depends(get_db_session)]) -> Message:
    try:
        await setting_db.delete(db=db, definition=_TOKEN_SETTING)
        await db.commit()
    except ItemNotFoundError:
        pass
    return Message(message="Disconnected from OrcaCloud.")


@router.post(
    "/import",
    response_model=OrcaImportResponse,
    responses={400: {"model": Message}, 401: {"model": Message}},
    summary="Import filament profiles from OrcaCloud",
    description=(
        "Fetches all synced filament profiles and imports them into Spoolman, creating or "
        "updating a filament for EVERY synced profile. This is a bulk, all-or-nothing action — "
        "for linking one profile to one existing filament, use GET /orca/profiles with a picker "
        "UI instead. Pass a session_id from a completed /orca/auth/callback, or a raw "
        "access_token directly; if neither is given, falls back to the persisted sign-in. "
        "Profiles are matched by their Orca UUID (external_id 'orca:{uuid}') — existing ones are "
        "updated, new ones created. Any defined filament extra field whose key matches an "
        "OrcaSlicer profile content key is populated automatically."
    ),
)
async def import_from_orca(
    body: OrcaImportRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrcaImportResponse | JSONResponse:
    # Resolve access token from whichever auth method was used
    if body.access_token:
        access_token = body.access_token
    elif body.session_id:
        session = _sessions.pop(body.session_id, None)
        if session is None:
            return JSONResponse(status_code=400, content={"message": "Session not found or already used."})
        if session["status"] != "complete" or not session["access_token"]:
            return JSONResponse(status_code=401, content={"message": session.get("error") or "OAuth login incomplete."})
        access_token = session["access_token"]
    else:
        access_token = await _get_valid_access_token(db)
        if access_token is None:
            return JSONResponse(
                status_code=401,
                content={"message": "Not connected to OrcaCloud. Sign in from Settings → OrcaCloud first."},
            )

    return await _do_import(access_token, db)


def _build_profile_extras(profile: orca_cloud.OrcaFilamentProfile, defined_field_map: dict) -> dict[str, str]:
    """Build the extra-field values for a profile: its Orca IDs plus defined fields matching profile content."""
    orca_extras: dict[str, str] = {}
    if profile.filament_id is not None:
        orca_extras["orca_filament_id"] = profile.filament_id
    if profile.setting_id is not None:
        orca_extras["orca_setting_id"] = profile.setting_id

    for field_key, field_def in defined_field_map.items():
        if field_key in orca_extras:
            continue
        raw_val = profile.content.get(field_key)
        if raw_val is None:
            continue
        encoded = orca_cloud.encode_profile_value(raw_val, field_def.field_type.value)
        if encoded is not None:
            orca_extras[field_key] = encoded

    return orca_extras


async def _do_import(access_token: str, db: AsyncSession) -> OrcaImportResponse:
    raw_profiles = await orca_cloud.fetch_profiles(access_token)
    logger.info("Fetched %d profiles from OrcaCloud", len(raw_profiles))

    defined_fields = await get_extra_fields(db, ExtraEntityType.filament)
    defined_field_map = {f.key: f for f in defined_fields}

    created = updated = skipped = 0

    for raw in raw_profiles:
        profile = orca_cloud.parse_filament_profile(raw)
        if profile is None:
            skipped += 1
            continue

        external_id = f"orca:{profile.orca_id}"
        density = profile.density or 1.24
        diameter = profile.diameter or 1.75
        orca_extras = _build_profile_extras(profile, defined_field_map)

        vendor_id: int | None = None
        if profile.vendor:
            vendors, _ = await vendor_db.find(db=db, name=profile.vendor)
            vendor_id = vendors[0].id if vendors else (await vendor_db.create(db=db, name=profile.vendor)).id

        existing, _ = await filament_db.find(db=db, external_id=external_id)

        if existing:
            merged_extras = {f.key: f.value for f in existing[0].extra}
            merged_extras.update(orca_extras)
            await filament_db.update(
                db=db,
                filament_id=existing[0].id,
                data={
                    "name": profile.name,
                    "vendor_id": vendor_id,
                    "material": profile.material,
                    "density": density,
                    "diameter": diameter,
                    "settings_extruder_temp": profile.extruder_temp,
                    "settings_bed_temp": profile.bed_temp,
                    "color_hex": profile.color_hex,
                    "extra": merged_extras,
                },
            )
            updated += 1
        else:
            await filament_db.create(
                db=db,
                name=profile.name,
                vendor_id=vendor_id,
                material=profile.material,
                density=density,
                diameter=diameter,
                settings_extruder_temp=profile.extruder_temp,
                settings_bed_temp=profile.bed_temp,
                color_hex=profile.color_hex,
                external_id=external_id,
                extra=orca_extras,
            )
            created += 1

    logger.info("OrcaCloud import: %d created, %d updated, %d skipped", created, updated, skipped)
    return OrcaImportResponse(created=created, updated=updated, skipped=skipped)
