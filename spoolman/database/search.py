"""Cross-entity free-text / id / color search backing the /search endpoint.

Searches spools, filaments and vendors in one call and reports, per result, which
field matched. The query is split on whitespace into terms and a row must match
*every* term (each term may match a different field), so "bambu petg-cf" finds the
PETG-CF filaments of the Bambu Lab vendor. Text matching uses case-insensitive
``ilike`` so it works on all four supported databases. A purely numeric query also
matches a spool by its id, and a query that is a hex code or a CSS color name runs a
color-similarity search over filaments (reusing
:func:`spoolman.database.filament.find_by_color`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import InstrumentedAttribute, joinedload

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

# Upper bound on how many whitespace-separated terms we honor, so a pathological
# query can't turn into an arbitrarily large AND-of-ORs.
_MAX_TERMS = 8

# Extra-field types whose stored value is human-readable text worth searching.
_TEXT_EXTRA_TYPES = (ExtraFieldType.text, ExtraFieldType.choice)

# Rank buckets (lower sorts first). Each base is the rank of a prefix/exact hit on a
# field of that kind; a mere substring hit ranks one worse.
_RANK_ID_OR_COLOR = -1  # exact id / color-similarity match
_BASE_NATIVE = 0  # the entity's own text fields
_BASE_VENDOR = 2  # related vendor name (filaments only)
_BASE_EXTRA = 4  # extra-field text
_WEAK_PENALTY = 1


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


def _split_terms(q: str) -> list[str]:
    """Lower-cased, de-duplicated search terms, in query order."""
    terms: list[str] = []
    for raw in q.lower().split():
        if raw not in terms:
            terms.append(raw)
    return terms[:_MAX_TERMS]


def _classify_match(terms: list[str], fields: list[tuple[str, str | None, int]]) -> tuple[str, int] | None:
    """Return ``(match_field, rank)`` for a row, or ``None`` if some term doesn't match.

    ``fields`` are ordered ``(label, value, base_rank)`` triples. Every term must hit at
    least one field; the reported field is the single best hit across all terms, while
    the rank is the *worst* term's rank, so rows where everything matched strongly sort
    above rows that only just scraped by.
    """
    best: tuple[str, int] | None = None
    worst_rank = _RANK_ID_OR_COLOR
    for term in terms:
        term_best: tuple[str, int] | None = None
        for label, value, base in fields:
            if not value:
                continue
            v = value.lower()
            if term not in v:
                continue
            rank = base if v.startswith(term) else base + _WEAK_PENALTY
            if term_best is None or rank < term_best[1]:
                term_best = (label, rank)
        if term_best is None:
            return None
        worst_rank = max(worst_rank, term_best[1])
        if best is None or term_best[1] < best[1]:
            best = term_best
    if best is None:
        return None
    return best[0], worst_rank


def _term_clause(
    term: str,
    columns: list[InstrumentedAttribute],
    extra_exists: ColumnElement | None,
) -> ColumnElement:
    """Build the SQL predicate for a single term: it must appear in any searchable column."""
    clauses = [col.ilike(f"%{term}%") for col in columns]
    if extra_exists is not None:
        clauses.append(extra_exists)
    return or_(*clauses)


async def _text_extra_keys(db: AsyncSession, entity_type: EntityType) -> list[str]:
    """Keys of the entity's text/choice extra fields (the ones worth text-searching)."""
    fields = await get_extra_fields(db, entity_type)
    return [f.key for f in fields if f.field_type in _TEXT_EXTRA_TYPES]


def _extra_exists(
    field_model: type,
    owner_col: InstrumentedAttribute,
    owner_id_col: InstrumentedAttribute,
    keys: list[str],
    term: str,
) -> ColumnElement | None:
    """Build a correlated EXISTS matching ``term`` against the row's text/choice extra fields."""
    if not keys:
        return None
    return (
        select(1)
        .where(
            owner_col == owner_id_col,
            field_model.key.in_(keys),
            field_model.value.ilike(f"%{term}%"),
        )
        .exists()
    )


async def _extra_values(
    db: AsyncSession,
    field_model: type,
    owner_col: InstrumentedAttribute,
    keys: list[str],
    ids: list[int],
) -> dict[int, list[tuple[str, str | None, int]]]:
    """Fetch the searchable extra-field values of the given rows, as classifier fields."""
    if not keys or not ids:
        return {}
    stmt = select(owner_col, field_model.key, field_model.value).where(
        owner_col.in_(ids),
        field_model.key.in_(keys),
    )
    out: dict[int, list[tuple[str, str | None, int]]] = {}
    for owner_id, key, value in (await db.execute(stmt)).all():
        out.setdefault(owner_id, []).append((f"extra.{key}", value, _BASE_EXTRA))
    return out


async def _search_spools(db: AsyncSession, terms: list[str], limit: int) -> list[SpoolMatch]:
    native_fields = (
        ("comment", models.Spool.comment),
        ("location", models.Spool.location),
        ("lot_nr", models.Spool.lot_nr),
    )
    columns = [col for _, col in native_fields]
    keys = await _text_extra_keys(db, EntityType.spool)

    load = (joinedload(models.Spool.filament).joinedload(models.Filament.vendor),)
    stmt = (
        select(models.Spool)
        .where(
            and_(
                *(
                    _term_clause(
                        term,
                        columns,
                        _extra_exists(models.SpoolField, models.SpoolField.spool_id, models.Spool.id, keys, term),
                    )
                    for term in terms
                ),
            ),
        )
        .options(*load)
        .order_by(models.Spool.id)
        .limit(_CANDIDATE_CAP)
    )
    rows = (await db.execute(stmt)).unique().scalars().all()

    extras = await _extra_values(db, models.SpoolField, models.SpoolField.spool_id, keys, [s.id for s in rows])

    hits: dict[int, tuple[str, int]] = {}
    spools: dict[int, models.Spool] = {}
    for spool in rows:
        fields = [(label, getattr(spool, attr.key), _BASE_NATIVE) for label, attr in native_fields]
        fields.extend(extras.get(spool.id, []))
        classified = _classify_match(terms, fields)
        if classified is None:
            continue
        spools[spool.id] = spool
        hits[spool.id] = classified

    ordered = sorted(hits.items(), key=lambda kv: (kv[1][1], kv[0]))[:limit]
    return [SpoolMatch(spool=spools[sid], match_field=field) for sid, (field, _rank) in ordered]


async def _search_filaments(
    db: AsyncSession,
    terms: list[str],
    limit: int,
    color_hits: list[FilamentMatch],
) -> list[FilamentMatch]:
    hits: dict[int, tuple[str, int]] = {}
    filaments: dict[int, models.Filament] = {}

    # Color matches (already ordered by closeness) claim the top rank; their relative
    # order is preserved below via `color_order`.
    for match in color_hits:
        fid = match.filament.id
        filaments[fid] = match.filament
        hits[fid] = (match.match_field, _RANK_ID_OR_COLOR)

    native_fields = (
        ("name", models.Filament.name),
        ("material", models.Filament.material),
        ("article_number", models.Filament.article_number),
        ("comment", models.Filament.comment),
    )
    # The vendor name is searched alongside the filament's own fields, so a query mixing
    # a manufacturer and a material ("bambu petg-cf") can satisfy one term from each.
    columns = [col for _, col in native_fields] + [models.Vendor.name]
    keys = await _text_extra_keys(db, EntityType.filament)

    load = (joinedload(models.Filament.vendor),)
    stmt = (
        select(models.Filament)
        .outerjoin(models.Filament.vendor)
        .where(
            and_(
                *(
                    _term_clause(
                        term,
                        columns,
                        _extra_exists(
                            models.FilamentField,
                            models.FilamentField.filament_id,
                            models.Filament.id,
                            keys,
                            term,
                        ),
                    )
                    for term in terms
                ),
            ),
        )
        .options(*load)
        .order_by(models.Filament.id)
        .limit(_CANDIDATE_CAP)
    )
    rows = (await db.execute(stmt)).unique().scalars().all()

    extras = await _extra_values(
        db,
        models.FilamentField,
        models.FilamentField.filament_id,
        keys,
        [f.id for f in rows],
    )

    for filament in rows:
        if filament.id in hits:
            continue  # color match already annotated this one
        fields = [(label, getattr(filament, attr.key), _BASE_NATIVE) for label, attr in native_fields]
        fields.append(("vendor.name", filament.vendor.name if filament.vendor else None, _BASE_VENDOR))
        fields.extend(extras.get(filament.id, []))
        classified = _classify_match(terms, fields)
        if classified is None:
            continue
        filaments[filament.id] = filament
        hits[filament.id] = classified

    # Color hits keep their supplied order; everyone else sorts by (rank, id).
    color_order = {m.filament.id: i for i, m in enumerate(color_hits)}
    ordered = sorted(
        hits.items(),
        key=lambda kv: (kv[1][1], color_order.get(kv[0], 0), kv[0]),
    )[:limit]
    return [FilamentMatch(filament=filaments[fid], match_field=field) for fid, (field, _rank) in ordered]


async def _search_vendors(db: AsyncSession, terms: list[str], limit: int) -> list[VendorMatch]:
    native_fields = (
        ("name", models.Vendor.name),
        ("comment", models.Vendor.comment),
    )
    columns = [col for _, col in native_fields]
    keys = await _text_extra_keys(db, EntityType.vendor)

    stmt = (
        select(models.Vendor)
        .where(
            and_(
                *(
                    _term_clause(
                        term,
                        columns,
                        _extra_exists(models.VendorField, models.VendorField.vendor_id, models.Vendor.id, keys, term),
                    )
                    for term in terms
                ),
            ),
        )
        .order_by(models.Vendor.id)
        .limit(_CANDIDATE_CAP)
    )
    rows = (await db.execute(stmt)).unique().scalars().all()

    extras = await _extra_values(db, models.VendorField, models.VendorField.vendor_id, keys, [v.id for v in rows])

    hits: dict[int, tuple[str, int]] = {}
    vendors: dict[int, models.Vendor] = {}
    for vendor in rows:
        fields = [(label, getattr(vendor, attr.key), _BASE_NATIVE) for label, attr in native_fields]
        fields.extend(extras.get(vendor.id, []))
        classified = _classify_match(terms, fields)
        if classified is None:
            continue
        vendors[vendor.id] = vendor
        hits[vendor.id] = classified

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
    matched_ids = await filament_db.find_by_color(
        db=db,
        color_query_hex=color_hex,
        similarity_threshold=threshold,
    )
    if not matched_ids:
        return []
    matched, _ = await filament_db.find(db=db, ids=matched_ids)
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
    terms = _split_terms(q)
    if not terms:
        return SearchResult(spools=[], filaments=[], vendors=[], is_color_query=False)

    color_hex = resolve_color(q)
    is_color_query = color_hex is not None

    color_hits = await _color_matches(db, color_hex, color_similarity_threshold, limit) if color_hex else []

    spools = await _search_spools(db, terms, limit)
    filaments = await _search_filaments(db, terms, limit, color_hits)
    vendors = await _search_vendors(db, terms, limit)

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
