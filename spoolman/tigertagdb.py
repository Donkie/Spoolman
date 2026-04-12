"""Functions for syncing data from the TigerTag external filament database."""

import datetime
import json
import logging
from typing import Optional
from urllib.parse import urljoin

import httpx
from pydantic import BaseModel
from scheduler.asyncio.scheduler import Scheduler

from spoolman import filecache
from spoolman.env import get_tigertag_api_url, get_tigertag_sync_interval, is_tigertag_enabled
from spoolman.externaldb import ExternalFilament

logger = logging.getLogger(__name__)

TIGERTAG_CACHE_FILE = "tigertag_filaments.json"
TIGERTAG_BRANDS_CACHE_FILE = "tigertag_brands.json"
TIGERTAG_MATERIALS_CACHE_FILE = "tigertag_materials.json"


class TigerTagBrand(BaseModel):
    """A brand/manufacturer from the TigerTag API."""

    id_brand: int
    name: str


class TigerTagMaterial(BaseModel):
    """A material/type from the TigerTag API."""

    id_type: int
    name: str
    density: Optional[float] = None


class TigerTagProduct(BaseModel):
    """A filament product from the TigerTag API."""

    id: int
    product_type: Optional[str] = None
    brand: Optional[str] = None
    title: Optional[str] = None
    material: Optional[str] = None
    color: Optional[str] = None
    color_info: Optional[dict] = None
    measure: Optional[str] = None
    sku: Optional[str] = None


def _parse_weight_from_measure(measure: Optional[str]) -> float:
    """Parse weight in grams from measure string like '1 kg' or '500 g'."""
    if not measure:
        return 1000.0
    measure = measure.strip().lower()
    try:
        if "kg" in measure:
            return float(measure.replace("kg", "").strip()) * 1000
        if "g" in measure:
            return float(measure.replace("g", "").strip())
    except ValueError:
        pass
    return 1000.0


def _to_external_filament(product: TigerTagProduct) -> ExternalFilament:
    """Convert a TigerTag product into an ExternalFilament."""
    manufacturer = product.brand or "Unknown"
    material = product.material or "Unknown"
    name = product.title or f"{manufacturer} {material}"
    weight = _parse_weight_from_measure(product.measure)

    # Clean up color hex - remove leading # and alpha channel if present
    color_hex = None
    if product.color:
        hex_str = product.color.lstrip("#")
        # TigerTag returns 8-char RGBA hex, Spoolman expects 6-char RGB
        if len(hex_str) == 8:
            hex_str = hex_str[:6]
        color_hex = hex_str

    return ExternalFilament(
        id=f"tigertag_{product.id}",
        manufacturer=manufacturer,
        name=name,
        material=material,
        density=1.24,
        weight=weight,
        diameter=1.75,
        color_hex=color_hex,
        source="tigertag",
    )


TIGERTAG_FILAMENT_TYPE_ID = 142
TIGERTAG_PAGE_SIZE = 50


async def _fetch_all_products(base_url: str) -> list[dict]:
    """Fetch all filament products from TigerTag API using pagination."""
    products_url = urljoin(base_url, "product/get/all")
    all_items: list[dict] = []
    page = 1

    async with httpx.AsyncClient() as client:
        while True:
            response = await client.post(
                products_url,
                json={"page": page, "per_page": TIGERTAG_PAGE_SIZE, "product_type_id": TIGERTAG_FILAMENT_TYPE_ID},
            )
            response.raise_for_status()
            data = response.json()
            items = data.get("items", [])
            all_items.extend(items)

            if data.get("nextPage") is None:
                break
            page = data["nextPage"]

    return all_items


async def _fetch_brands(base_url: str) -> list[dict]:
    """Fetch all brands from TigerTag API (GET, returns list with id/name)."""
    url = urljoin(base_url, "brand/get/all")
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        return data.get("items", data) if isinstance(data, dict) else data


async def _fetch_materials(base_url: str) -> list[dict]:
    """Fetch all filament materials from TigerTag API (GET, returns list with id/label/density)."""
    url = urljoin(base_url, "material/get/all")
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        return data.get("items", data) if isinstance(data, dict) else data


async def _sync_tigertag() -> None:
    logger.info("Syncing TigerTag DB.")

    base_url = get_tigertag_api_url()

    try:
        # Fetch all filament products via paginated API
        products_list = await _fetch_all_products(base_url)

        # Parse products
        products = [TigerTagProduct(**p) for p in products_list]

        # Convert to ExternalFilament format
        filaments = [_to_external_filament(p) for p in products]

        # Cache to local file
        filaments_json = json.dumps(
            [f.model_dump(exclude_none=True) for f in filaments],
            ensure_ascii=False,
        )
        filecache.update_file(TIGERTAG_CACHE_FILE, filaments_json.encode("utf-8"))

        logger.info("TigerTag DB synced. Filaments: %d", len(filaments))

    except Exception:
        logger.exception("Failed to sync TigerTag DB")

    # Fetch and cache brands (id_brand -> name mapping)
    try:
        brands_list = await _fetch_brands(base_url)
        filecache.update_file(TIGERTAG_BRANDS_CACHE_FILE, json.dumps(brands_list, ensure_ascii=False).encode("utf-8"))
        logger.info("TigerTag brands synced: %d", len(brands_list))
    except Exception:
        logger.exception("Failed to sync TigerTag brands")

    # Fetch and cache materials (id_type -> name mapping)
    try:
        materials_list = await _fetch_materials(base_url)
        filecache.update_file(
            TIGERTAG_MATERIALS_CACHE_FILE, json.dumps(materials_list, ensure_ascii=False).encode("utf-8"),
        )
        logger.info("TigerTag materials synced: %d", len(materials_list))
    except Exception:
        logger.exception("Failed to sync TigerTag materials")


def get_tigertag_filaments_file():
    """Get the path to the cached TigerTag filaments file."""
    return filecache.get_file(TIGERTAG_CACHE_FILE)


def lookup_brand_name(id_brand: int) -> Optional[str]:
    """Look up a brand name by its TigerTag numeric ID from the cached brand list.

    Brand API returns: [{"id": 19961, "name": "Rosa3D", "type_ids": [142]}, ...]
    """
    try:
        data = json.loads(filecache.get_file_contents(TIGERTAG_BRANDS_CACHE_FILE))
        for entry in data:
            if entry.get("id") == id_brand:
                return entry.get("name")
    except Exception:
        logger.debug("Could not look up TigerTag brand %d from cache", id_brand)
    return None


def lookup_material_name(id_material: int) -> Optional[str]:
    """Look up a material name by its TigerTag numeric ID from the cached material list.

    Material API returns: [{"id": 38219, "label": "PLA", "density": 1.24, ...}, ...]
    """
    try:
        data = json.loads(filecache.get_file_contents(TIGERTAG_MATERIALS_CACHE_FILE))
        for entry in data:
            if entry.get("id") == id_material:
                return entry.get("label")
    except Exception:
        logger.debug("Could not look up TigerTag material %d from cache", id_material)
    return None


def lookup_material_density(id_material: int) -> Optional[float]:
    """Look up material density by its TigerTag numeric ID from the cached material list."""
    try:
        data = json.loads(filecache.get_file_contents(TIGERTAG_MATERIALS_CACHE_FILE))
        for entry in data:
            if entry.get("id") == id_material:
                density = entry.get("density")
                if density is not None:
                    return float(density)
    except Exception:
        logger.debug("Could not look up TigerTag material density %d from cache", id_material)
    return None


async def lookup_product_by_tag(nfc_tag_uid: str, id_product: int) -> Optional[ExternalFilament]:
    """Look up a TigerTag product via the real-time API using tag UID + product_id.

    The tag stores a small product_id (e.g. 28) which is different from the API's
    internal database ID (billions). The single-product endpoint requires both the
    tag's hardware UID and the product_id to resolve to a full product record.

    Returns an ExternalFilament if found, None otherwise.
    """
    if not is_tigertag_enabled():
        return None

    base_url = get_tigertag_api_url()
    url = urljoin(base_url, "product/get")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params={"uid": nfc_tag_uid, "product_id": id_product}, timeout=5.0)
            response.raise_for_status()
            data = response.json()

        product = TigerTagProduct(**data)
        ext = _to_external_filament(product)
        logger.info("TigerTag API resolved product_id=%d → %s (%s)", id_product, ext.name, ext.manufacturer)
        return ext
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.debug("TigerTag product_id=%d not found via API (uid=%s)", id_product, nfc_tag_uid)
        else:
            logger.warning("TigerTag API error for product_id=%d: %s", id_product, e)
    except Exception:
        logger.debug("TigerTag API lookup failed for product_id=%d", id_product, exc_info=True)
    return None


def schedule_tasks(scheduler: Scheduler) -> None:
    """Schedule TigerTag sync tasks.

    Args:
        scheduler: The scheduler to use for scheduling tasks.

    """
    if not is_tigertag_enabled():
        logger.info("TigerTag integration is disabled. Skipping sync.")
        return

    logger.info("Scheduling TigerTag DB sync.")

    # Run once on startup
    scheduler.once(datetime.timedelta(seconds=0), _sync_tigertag)  # type: ignore[arg-type]

    sync_interval = get_tigertag_sync_interval()
    if sync_interval > 0:
        scheduler.cyclic(datetime.timedelta(seconds=sync_interval), _sync_tigertag)  # type: ignore[arg-type]
    else:
        logger.info("TigerTag sync interval is 0, skipping periodic sync.")
