"""Cross-entity free-text / id / color search backing the /search endpoint.

Searches spools, filaments and vendors in one call and reports, per result, which
field matched. Text matching uses case-insensitive ``ilike`` so it works on all four
supported databases. A purely numeric query also matches a spool by its id, and a
query that is a hex code or a CSS color name runs a color-similarity search over
filaments (reusing :func:`spoolman.database.filament.find_by_color`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import or_, select
from sqlalchemy.orm import joinedload

from spoolman.colors import resolve_color
from spoolman.database import filament as filament_db
from spoolman.database import models
from spoolman.extra_field_registry import EntityType, ExtraFieldType, get_extra_fields
from spoolman.math import delta_e, hex_to_rgb, rgb_to_lab

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# How many candidate rows to pull per entity before ranking and trimming to `limit`.
# The search box only needs the top handful; this bound keeps ranking cheap while
# still letting prefix matches win over substring ones within a generous window.
_CANDIDATE_CAP = 200

# Extra-field types whose stored value is human-readable text worth searching.
_TEXT_EXTRA_TYPES = (ExtraFieldType.text, ExtraFieldType.choice)

# Rank buckets (lower sorts first).
_RANK_ID_OR_COLOR = -1  # exact id / color-similarity match
_RANK_STRONG = 0  # native field prefix/exact text match
_RANK_WEAK = 1  # native field substring text match
_RANK_EXTRA = 2  # extra-field text match


@dataclass
class SpoolMatch:
    spool: models.Spool
    match_field: str


@dataclass
class FilamentMatch:
    filament: models.Filament
    match_field: str


@dataclass
class VendorMatch:
    vendor: models.Vendor
    match_field: str


@dataclass
class SearchResult:
    spools: list[SpoolMatch]
    filaments: list[FilamentMatch]
    vendors: list[VendorMatch]
    is_color_query: bool


def _classify_match(q_lower: str, fields: list[tuple[str, str | None]]) -> tuple[str, int] | None:
    """Given ordered ``(label, value)`` pairs, return ``(label, rank)`` for the best match.

    A prefix/exact hit outranks a mere substring hit. Returns ``None`` if nothing matched
    (shouldn't happen for rows the SQL ``ilike`` already selected, but stays defensive).
    """
    weak: tuple[str, int] | None = None
    for label, value in fields:
        if not value:
            continue
        v = value.lower()
        if q_lower in v:
            if v == q_lower or v.startswith(q_lower):
                return label, _RANK_STRONG
            if weak is None:
                weak = (label, _RANK_WEAK)
    return weak


async def _text_extra_keys(db: AsyncSession, entity_type: EntityType) -> list[str]:
    """Keys of the entity's text/choice extra fields (the ones worth text-searching)."""
    fields = await get_extra_fields(db, entity_type)
    return [f.key for f in fields if f.field_type in _TEXT_EXTRA_TYPES]


async def _search_spools(db: AsyncSession, q: str, limit: int) -> list[SpoolMatch]:
    q_lower = q.lower()
    # id -> (match_field, rank); spool object filled in afterwards.
    hits: dict[int, tuple[str, int]] = {}
    spools: dict[int, models.Spool] = {}

    load = (joinedload(models.Spool.filament).joinedload(models.Filament.vendor),)

    native_fields = (
        ("comment", models.Spool.comment),
        ("location", models.Spool.location),
        ("lot_nr", models.Spool.lot_nr),
    )
    stmt = (
        select(models.Spool)
        .where(or_(*(col.ilike(f"%{q}%") for _, col in native_fields)))
        .options(*load)
        .order_by(models.Spool.id)
        .limit(_CANDIDATE_CAP)
    )
    rows = (await db.execute(stmt)).unique().scalars().all()
    for spool in rows:
        classified = _classify_match(
            q_lower,
            [(label, getattr(spool, attr.key)) for label, attr in native_fields],
        )
        if classified is None:
            continue
        spools[spool.id] = spool
        hits[spool.id] = classified

    # Extra-field (text/choice) matches.
    keys = await _text_extra_keys(db, EntityType.spool)
    if keys:
        estmt = (
            select(models.SpoolField.spool_id, models.SpoolField.key)
            .where(models.SpoolField.key.in_(keys))
            .where(models.SpoolField.value.ilike(f"%{q}%"))
            .limit(_CANDIDATE_CAP)
        )
        need: list[int] = []
        for spool_id, key in (await db.execute(estmt)).all():
            if spool_id not in hits:
                hits[spool_id] = (f"extra.{key}", _RANK_EXTRA)
                need.append(spool_id)
        if need:
            fetch = select(models.Spool).where(models.Spool.id.in_(need)).options(*load)
            for spool in (await db.execute(fetch)).unique().scalars().all():
                spools[spool.id] = spool

    ordered = sorted(hits.items(), key=lambda kv: (kv[1][1], kv[0]))[:limit]
    return [SpoolMatch(spool=spools[sid], match_field=field) for sid, (field, _rank) in ordered]


async def _search_filaments(
    db: AsyncSession,
    q: str,
    limit: int,
    color_hits: list[FilamentMatch],
) -> list[FilamentMatch]:
    q_lower = q.lower()
    hits: dict[int, tuple[str, int]] = {}
    filaments: dict[int, models.Filament] = {}

    # Color matches (already ordered by closeness) claim the top rank; their relative
    # order is preserved below via `color_order`.
    for match in color_hits:
        fid = match.filament.id
        filaments[fid] = match.filament
        hits[fid] = (match.match_field, _RANK_ID_OR_COLOR)

    load = (joinedload(models.Filament.vendor),)
    native_fields = (
        ("name", models.Filament.name),
        ("material", models.Filament.material),
        ("article_number", models.Filament.article_number),
        ("comment", models.Filament.comment),
    )
    stmt = (
        select(models.Filament)
        .where(or_(*(col.ilike(f"%{q}%") for _, col in native_fields)))
        .options(*load)
        .order_by(models.Filament.id)
        .limit(_CANDIDATE_CAP)
    )
    for filament in (await db.execute(stmt)).unique().scalars().all():
        if filament.id in hits:
            continue  # color match already annotated this one
        classified = _classify_match(
            q_lower,
            [(label, getattr(filament, attr.key)) for label, attr in native_fields],
        )
        if classified is None:
            continue
        filaments[filament.id] = filament
        hits[filament.id] = classified

    keys = await _text_extra_keys(db, EntityType.filament)
    if keys:
        estmt = (
            select(models.FilamentField.filament_id, models.FilamentField.key)
            .where(models.FilamentField.key.in_(keys))
            .where(models.FilamentField.value.ilike(f"%{q}%"))
            .limit(_CANDIDATE_CAP)
        )
        need: list[int] = []
        for filament_id, key in (await db.execute(estmt)).all():
            if filament_id not in hits:
                hits[filament_id] = (f"extra.{key}", _RANK_EXTRA)
                need.append(filament_id)
        if need:
            fetch = select(models.Filament).where(models.Filament.id.in_(need)).options(*load)
            for filament in (await db.execute(fetch)).unique().scalars().all():
                filaments[filament.id] = filament

    # Color hits keep their supplied order; everyone else sorts by (rank, id).
    color_order = {m.filament.id: i for i, m in enumerate(color_hits)}
    ordered = sorted(
        hits.items(),
        key=lambda kv: (kv[1][1], color_order.get(kv[0], 0), kv[0]),
    )[:limit]
    return [FilamentMatch(filament=filaments[fid], match_field=field) for fid, (field, _rank) in ordered]


async def _search_vendors(db: AsyncSession, q: str, limit: int) -> list[VendorMatch]:
    q_lower = q.lower()
    hits: dict[int, tuple[str, int]] = {}
    vendors: dict[int, models.Vendor] = {}

    native_fields = (
        ("name", models.Vendor.name),
        ("comment", models.Vendor.comment),
    )
    stmt = (
        select(models.Vendor)
        .where(or_(*(col.ilike(f"%{q}%") for _, col in native_fields)))
        .order_by(models.Vendor.id)
        .limit(_CANDIDATE_CAP)
    )
    for vendor in (await db.execute(stmt)).unique().scalars().all():
        classified = _classify_match(
            q_lower,
            [(label, getattr(vendor, attr.key)) for label, attr in native_fields],
        )
        if classified is None:
            continue
        vendors[vendor.id] = vendor
        hits[vendor.id] = classified

    keys = await _text_extra_keys(db, EntityType.vendor)
    if keys:
        estmt = (
            select(models.VendorField.vendor_id, models.VendorField.key)
            .where(models.VendorField.key.in_(keys))
            .where(models.VendorField.value.ilike(f"%{q}%"))
            .limit(_CANDIDATE_CAP)
        )
        need: list[int] = []
        for vendor_id, key in (await db.execute(estmt)).all():
            if vendor_id not in hits:
                hits[vendor_id] = (f"extra.{key}", _RANK_EXTRA)
                need.append(vendor_id)
        if need:
            fetch = select(models.Vendor).where(models.Vendor.id.in_(need))
            for vendor in (await db.execute(fetch)).unique().scalars().all():
                vendors[vendor.id] = vendor

    ordered = sorted(hits.items(), key=lambda kv: (kv[1][1], kv[0]))[:limit]
    return [VendorMatch(vendor=vendors[vid], match_field=field) for vid, (field, _rank) in ordered]


def _filament_color_distance(filament: models.Filament, query_lab: list[float]) -> float:
    """Smallest CIELAB delta-E between the query color and any of the filament's colors."""
    if filament.color_hex is not None:
        colors = [filament.color_hex]
    elif filament.multi_color_hexes is not None:
        colors = filament.multi_color_hexes.split(",")
    else:
        return float("inf")
    return min(delta_e(query_lab, rgb_to_lab(hex_to_rgb(color))) for color in colors)


async def _color_matches(db: AsyncSession, color_hex: str, threshold: float, limit: int) -> list[FilamentMatch]:
    """Color-similar filaments, closest first."""
    matched = await filament_db.find_by_color(
        db=db,
        color_query_hex=color_hex,
        similarity_threshold=threshold,
    )
    query_lab = rgb_to_lab(hex_to_rgb(color_hex))
    matched.sort(key=lambda f: _filament_color_distance(f, query_lab))
    return [FilamentMatch(filament=f, match_field="color") for f in matched[:limit]]


async def search(
    *,
    db: AsyncSession,
    query: str,
    color_similarity_threshold: float = 20.0,
    limit: int = 20,
) -> SearchResult:
    """Run a cross-entity search for ``query`` and return categorized, annotated results."""
    q = query.strip()
    if not q:
        return SearchResult(spools=[], filaments=[], vendors=[], is_color_query=False)

    color_hex = resolve_color(q)
    is_color_query = color_hex is not None

    color_hits = await _color_matches(db, color_hex, color_similarity_threshold, limit) if color_hex else []

    spools = await _search_spools(db, q, limit)
    filaments = await _search_filaments(db, q, limit, color_hits)
    vendors = await _search_vendors(db, q, limit)

    # Numeric query: surface the spool with that exact id at the very top.
    if q.isdigit():
        spool_id = int(q)
        spool = await db.get(
            models.Spool, spool_id, options=[joinedload(models.Spool.filament).joinedload(models.Filament.vendor)]
        )
        if spool is not None:
            spools = [m for m in spools if m.spool.id != spool_id]  # drop weaker text match
            spools.insert(0, SpoolMatch(spool=spool, match_field="id"))
            spools = spools[:limit]

    return SearchResult(spools=spools, filaments=filaments, vendors=vendors, is_color_query=is_color_query)
