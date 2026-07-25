"""OrcaCloud API client for fetching synced filament profiles."""

import base64
import hashlib
import json
import logging
import secrets
from http import HTTPStatus
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

ORCA_AUTH_URL = "https://auth.orcaslicer.com"
ORCA_API_URL = "https://api.orcaslicer.com"
# Supabase publishable key embedded in OrcaSlicer source (OrcaCloudServiceAgent.cpp)
ORCA_API_KEY = "sb_publishable_lvVe_whOi80SU9BPSxM1kA_tbt9AbR_"

# Loopback redirect target. Supabase's redirect_to allowlist on Orca's project
# only honors http://localhost:* URIs, so we can't point it at Spoolman's own
# origin. Nothing needs to listen on this port — the browser will fail to load
# it, and the user copies the resulting URL (which carries ?code=...) out of
# the address bar instead.
#
# 41172 matches auth_constants::LOOPBACK_PORT in OrcaSlicer's own
# OrcaCloudServiceAgent.cpp (also used by the Bambuddy project's confirmed-
# working third-party integration) — if the real OrcaSlicer desktop app is
# running at the same time, its own background listener on this port could in
# theory intercept our redirect first, but that's a real client conflict
# rather than an allowlist problem, and 41172 is the one value known to
# actually be allow-listed.
ORCA_CALLBACK_PORT = 41172
ORCA_CALLBACK_PATH = "/callback"

_HEADERS = {"apikey": ORCA_API_KEY, "Content-Type": "application/json"}


class OrcaAuthError(Exception):
    pass


# ── PKCE helpers ───────────────────────────────────────────────────────────────


def generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE OAuth flow."""
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


OAUTH_PROVIDERS = ("google", "apple")


def get_oauth_url(provider: str, code_challenge: str) -> str:
    """Build the OrcaCloud OAuth authorize URL for the given provider (google or apple).

    Deliberately does NOT send a "state" param: GoTrue uses that query param
    itself to store its own auth flow bookkeeping (redirect_to, code
    challenge reference, provider) and reads it back on the callback. A
    client-supplied state value collides with and corrupts that, and GoTrue
    rejects the callback with error_code=bad_oauth_state ("OAuth state not
    found or expired") — confirmed by a Supabase maintainer:
    https://github.com/supabase/auth/issues/1548#issuecomment-2102402926
    """
    params = {
        "provider": provider,
        "redirect_to": f"http://localhost:{ORCA_CALLBACK_PORT}{ORCA_CALLBACK_PATH}",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{ORCA_AUTH_URL}/auth/v1/authorize?{urlencode(params)}"


def parse_callback_url(callback_url: str) -> tuple[str | None, str | None]:
    """Extract (code, state) from a callback URL the user pasted back from their browser.

    Checks both the query string and the fragment — Supabase puts the PKCE
    code in the query string for this flow, but we tolerate a fragment too
    in case that ever changes.
    """
    parsed = urlparse(callback_url.strip())
    qsd = parse_qs(parsed.query)
    code = (qsd.get("code") or [None])[0]
    state = (qsd.get("state") or [None])[0]
    if not code:
        frag = parse_qs(parsed.fragment)
        code = (frag.get("code") or [None])[0]
        state = state or (frag.get("state") or [None])[0]
    return code, state


async def exchange_pkce_code(auth_code: str, code_verifier: str) -> dict[str, Any]:
    """Exchange a PKCE auth code for OrcaCloud access/refresh tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{ORCA_AUTH_URL}/auth/v1/token",
            params={"grant_type": "pkce"},
            headers=_HEADERS,
            json={"auth_code": auth_code, "code_verifier": code_verifier},
            timeout=30,
        )
    if resp.status_code != HTTPStatus.OK:
        raise OrcaAuthError(f"Token exchange failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_in": data.get("expires_in", 3600),
    }


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    """Exchange a refresh token for a new OrcaCloud access token.

    Supabase rotates refresh tokens on every use, so the caller must persist
    the new refresh_token returned here — the old one becomes invalid.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{ORCA_AUTH_URL}/auth/v1/token",
            params={"grant_type": "refresh_token"},
            headers=_HEADERS,
            json={"refresh_token": refresh_token},
            timeout=30,
        )
    if resp.status_code != HTTPStatus.OK:
        raise OrcaAuthError(f"Token refresh failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", refresh_token),
        "expires_in": data.get("expires_in", 3600),
    }


async def exchange_password(email: str, password: str) -> dict[str, Any]:
    """Exchange an OrcaCloud email/password for access/refresh tokens.

    Unlike the Google/Apple OAuth flow, this is a direct API call — no
    browser redirect or pasted-URL step needed.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{ORCA_AUTH_URL}/auth/v1/token",
            params={"grant_type": "password"},
            headers=_HEADERS,
            json={"email": email, "password": password},
            timeout=30,
        )
    if resp.status_code != HTTPStatus.OK:
        raise OrcaAuthError(f"Sign-in failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_in": data.get("expires_in", 3600),
    }


# Curated list of OrcaSlicer filament profile fields that can be mapped to Spoolman extra fields.
# field_type values match Spoolman's ExtraFieldType enum.
ORCA_PROFILE_FIELDS: list[dict] = [
    {"key": "flow_ratio", "name": "Flow Ratio", "field_type": "float", "unit": None},
    {"key": "fan_min_speed", "name": "Min Fan Speed", "field_type": "integer", "unit": "%"},
    {"key": "fan_max_speed", "name": "Max Fan Speed", "field_type": "integer", "unit": "%"},
    {"key": "close_fan_the_first_x_layers", "name": "Close Fan First X Layers", "field_type": "integer", "unit": None},
    {"key": "full_fan_speed_layer", "name": "Full Fan Speed Layer", "field_type": "integer", "unit": None},
    {"key": "chamber_temperature", "name": "Chamber Temperature", "field_type": "integer", "unit": "°C"},
    {"key": "filament_max_volumetric_speed", "name": "Max Volumetric Speed", "field_type": "float", "unit": "mm³/s"},
    {"key": "filament_cost", "name": "Filament Cost", "field_type": "float", "unit": None},
    {
        "key": "filament_minimal_purge_on_wipe_tower",
        "name": "Min Purge on Wipe Tower",
        "field_type": "float",
        "unit": "g",
    },
    {"key": "filament_wipe_distance", "name": "Wipe Distance", "field_type": "float", "unit": "mm"},
    {"key": "filament_retraction_length", "name": "Retraction Length", "field_type": "float", "unit": "mm"},
    {"key": "filament_retract_speed", "name": "Retraction Speed", "field_type": "float", "unit": "mm/s"},
    {"key": "filament_deretraction_speed", "name": "Deretraction Speed", "field_type": "float", "unit": "mm/s"},
]


def encode_profile_value(raw_value: object, field_type: str) -> str | None:
    """Extract a value from a raw OrcaSlicer profile field and JSON-encode it for Spoolman storage."""
    if field_type in ("float", "float_range"):
        v = _first_float(raw_value)
        return json.dumps(v) if v is not None else None
    if field_type in ("integer", "integer_range"):
        v = _first_int(raw_value)
        return json.dumps(v) if v is not None else None
    if field_type == "boolean":
        s = _first_str(raw_value)
        if s is None:
            return None
        return json.dumps(s not in ("0", "false", ""))
    # text / choice
    s = _first_str(raw_value)
    return json.dumps(s) if s is not None else None


class OrcaFilamentProfile(BaseModel):
    orca_id: str  # cloud sync row UUID — internal identity, NOT the same as filament_id below
    name: str
    filament_id: str | None  # raw filament_id from profile content (e.g. "P6f52551") — OrcaSlicer's own base-preset id
    setting_id: str | None  # raw filament_settings_id from profile content
    vendor: str | None
    material: str | None
    density: float | None
    diameter: float | None
    extruder_temp: int | None
    bed_temp: int | None
    color_hex: str | None
    content: dict = {}  # full raw profile content for dynamic extra field population


def _first_str(val: object) -> str | None:
    """Return the first element of a list as a string, or the value itself if already a string."""
    if isinstance(val, list):
        return str(val[0]) if val else None
    if isinstance(val, str):
        return val or None
    return None


def _first_float(val: object) -> float | None:
    s = _first_str(val)
    if s is None:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _first_int(val: object) -> int | None:
    f = _first_float(val)
    return int(f) if f is not None else None


async def fetch_profiles(access_token: str) -> list[dict]:
    """Fetch all synced profiles from OrcaCloud, paginating via cursor."""
    profiles: list[dict] = []
    cursor: int | None = None
    reset_done = False
    auth_headers = {**_HEADERS, "Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        while True:
            params: dict = {}
            if cursor is not None:
                params["cursor"] = cursor

            resp = await client.get(
                f"{ORCA_API_URL}/api/v1/sync/pull",
                params=params,
                headers=auth_headers,
                timeout=30,
            )

            if resp.status_code == HTTPStatus.NOT_MODIFIED:
                break
            if resp.status_code == HTTPStatus.GONE:
                # Cursor expired — restart from the beginning (only once)
                if reset_done:
                    logger.error("OrcaCloud sync cursor expired again after reset, aborting")
                    break
                logger.warning("OrcaCloud sync cursor expired, restarting full sync")
                cursor = None
                reset_done = True
                continue

            resp.raise_for_status()
            data = resp.json()
            profiles.extend(data.get("upserts", []))
            next_cursor = data.get("next_cursor")
            if next_cursor is None or next_cursor == cursor:
                break
            cursor = next_cursor

    return profiles


def parse_filament_profile(profile: dict) -> OrcaFilamentProfile | None:
    """Parse a raw sync entry into an OrcaFilamentProfile.

    Returns None if the entry is not a filament profile.
    """
    content = profile.get("content", {})
    if not isinstance(content, dict):
        return None
    # Filament profiles always carry one of these keys; skip printer/process profiles
    if "filament_type" not in content and "filament_density" not in content:
        return None

    filament_id = _first_str(content.get("filament_id"))
    setting_id = _first_str(content.get("filament_settings_id"))
    name = (setting_id or profile.get("name") or "Unknown")[:64]
    vendor = _first_str(content.get("filament_vendor"))
    material = _first_str(content.get("filament_type"))
    density = _first_float(content.get("filament_density"))
    diameter = _first_float(content.get("filament_diameter"))

    extruder_temp = _first_int(content.get("nozzle_temperature")) or _first_int(
        content.get("nozzle_temperature_range_high")
    )
    bed_temp = _first_int(content.get("bed_temperature")) or _first_int(content.get("hot_plate_temp"))

    color_raw = _first_str(content.get("filament_colour"))
    color_hex = color_raw.lstrip("#").upper() if color_raw else None

    return OrcaFilamentProfile(
        orca_id=profile["id"],
        name=name,
        filament_id=filament_id,
        setting_id=setting_id,
        vendor=vendor,
        material=material,
        density=density,
        diameter=diameter,
        extruder_temp=extruder_temp,
        bed_temp=bed_temp,
        color_hex=color_hex,
        content=content,
    )
