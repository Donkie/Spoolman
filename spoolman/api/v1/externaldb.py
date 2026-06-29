"""External database API."""

import logging
import re

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from spoolman.externaldb import ExternalFilament, ExternalMaterial, get_filaments_file, get_materials_file

router = APIRouter(
    prefix="/external",
    tags=["external"],
)


logger = logging.getLogger(__name__)


@router.get(
    "/filament",
    name="Get all external filaments",
    response_model_exclude_none=True,
    response_model=list[ExternalFilament],
)
async def filaments() -> FileResponse:
    """Get all external filaments."""
    return FileResponse(path=get_filaments_file(), media_type="application/json")


@router.get(
    "/material",
    name="Get all external materials",
    response_model_exclude_none=True,
    response_model=list[ExternalMaterial],
)
async def materials() -> FileResponse:
    """Get all external materials."""
    return FileResponse(path=get_materials_file(), media_type="application/json")


@router.get(
    "/profile/{profile_id}",
    name="Get external filament by 3D Filament Profiles ID",
    response_model_exclude_none=True,
)
async def profile(profile_id: str) -> dict | None:  # noqa: C901, PLR0912, PLR0915
    """Fetch filament data from 3dfilamentprofiles.com."""
    if not profile_id.isdigit():
        raise HTTPException(status_code=400, detail="Invalid profile ID; expected a numeric ID.")
    url = f"https://3dfilamentprofiles.com/filament/details/{profile_id}"
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, follow_redirects=True, headers=headers)
            response.raise_for_status()
            html = response.text
    except httpx.HTTPError as e:
        logger.exception("Failed to fetch filament profile %s", profile_id)
        raise HTTPException(status_code=400, detail="Failed to fetch filament profile") from e

    data = {}

    for line in html.splitlines():
        if '\\"brand_name\\":\\"' in line:
            brand_match = re.search(r'\\"brand_name\\":\\"([^"\\]+)\\"', line)
            if not brand_match or not brand_match.group(1).strip():
                continue

            data["manufacturer"] = brand_match.group(1).strip()

            material_match = re.search(r'\\"material\\":\\"([^"\\]+)\\"', line)
            if material_match:
                data["material"] = material_match.group(1)

            material_type_match = re.search(r'\\"material_type\\":\\"([^"\\]+)\\"', line)
            if material_type_match:
                data["material_type"] = material_type_match.group(1)

            color_match = re.search(r'\\"color\\":\\"([^"\\]+)\\"', line)
            if color_match:
                data["color"] = color_match.group(1)

            rgb_match = re.search(r'\\"rgb\\":\\"#([^"\\]+)\\"', line)
            if rgb_match:
                data["color_hex"] = rgb_match.group(1)

            density_match = re.search(r'\\"density\\":([\d\.]+)', line)
            if density_match:
                data["density"] = float(density_match.group(1))

            diameter_match = re.search(r'\\"diameter\\":([\d\.]+)', line)
            if diameter_match:
                data["diameter"] = float(diameter_match.group(1)) / 1000.0

            weight_match = re.search(r'\\"nominal_weight\\":([\d\.]+)', line)
            if weight_match:
                data["weight"] = float(weight_match.group(1))

            spool_weight_match = re.search(r'\\"spool_weight\\":([\d\.]+)', line)
            if spool_weight_match:
                data["spool_weight"] = float(spool_weight_match.group(1))

            temp_max_match = re.search(r'\\"temp_max\\":([\d\.]+)', line)
            temp_min_match = re.search(r'\\"temp_min\\":([\d\.]+)', line)
            if temp_max_match and temp_min_match:
                data["extruder_temp"] = (int(temp_max_match.group(1)) + int(temp_min_match.group(1))) // 2

            bed_temp_max_match = re.search(r'\\"bed_temp_max\\":([\d\.]+)', line)
            bed_temp_min_match = re.search(r'\\"bed_temp_min\\":([\d\.]+)', line)
            if bed_temp_max_match and bed_temp_min_match:
                data["bed_temp"] = (int(bed_temp_max_match.group(1)) + int(bed_temp_min_match.group(1))) // 2

            name_parts = []
            if "color" in data:
                name_parts.append(data["color"])
            if data.get("material_type"):
                name_parts.append(data["material_type"])
            if "material" in data:
                name_parts.append(data["material"])
            if name_parts:
                data["name"] = " ".join(name_parts)

            # Check for multi-color in the full HTML
            data_color_match = re.search(r'data-color="([^"]+)"', html)
            if data_color_match:
                color_hexes_raw = data_color_match.group(1).replace(" ", "").split(",")
                if len(color_hexes_raw) > 1:
                    data["color_hexes"] = [c.lstrip("#") for c in color_hexes_raw]
                    # By default use longitudinal for gradual or coaxial, since we
                    # can't tell, but coaxial is a good fallback for multi-color.
                    data["multi_color_direction"] = "coaxial"
                elif len(color_hexes_raw) == 1:
                    data["color_hex"] = color_hexes_raw[0].lstrip("#")

            return data

    raise HTTPException(status_code=404, detail="Filament profile information not found in HTML")
