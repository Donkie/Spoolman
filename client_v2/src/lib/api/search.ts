import type { SearchMatch, SearchResults } from './types';
import type { Filament, Spool, Vendor } from '$lib/types';
import { getJson } from './http';
import { mapFilament, mapSpool, mapVendor } from './map';
import { inventory } from '$lib/stores/inventory.svelte';

// Cross-entity search against GET /api/v1/search. Like the spool source, every
// entity it fetches is upserted into the reactive cache so that clicking a result
// (which opens its inspector) has the data ready immediately.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

const EMPTY: SearchResults = { spools: [], filaments: [], vendors: [], isColorQuery: false };

function mapSpoolHit(m: Json): SearchMatch<Spool> {
	const raw: Json = m.spool ?? {};
	if (raw.filament) {
		inventory.upsertFilament(mapFilament(raw.filament));
		if (raw.filament.vendor) inventory.upsertVendor(mapVendor(raw.filament.vendor));
	}
	const spool = mapSpool(raw);
	inventory.upsertSpool(spool);
	return { entity: spool, matchField: m.match_field };
}

function mapFilamentHit(m: Json): SearchMatch<Filament> {
	const raw: Json = m.filament ?? {};
	if (raw.vendor) inventory.upsertVendor(mapVendor(raw.vendor));
	const filament = mapFilament(raw);
	inventory.upsertFilament(filament);
	return { entity: filament, matchField: m.match_field };
}

function mapVendorHit(m: Json): SearchMatch<Vendor> {
	const vendor = mapVendor(m.vendor ?? {});
	inventory.upsertVendor(vendor);
	return { entity: vendor, matchField: m.match_field };
}

/**
 * Run a cross-entity search. `threshold` is the color-similarity threshold used
 * when the query is a color. Pass an AbortSignal to cancel a superseded request.
 */
export async function searchAll(
	query: string,
	threshold: number,
	signal?: AbortSignal
): Promise<SearchResults> {
	const q = query.trim();
	if (!q) return EMPTY;

	const data = await getJson<Json>('/search', { q, color_similarity_threshold: threshold }, signal);

	return {
		spools: (data.spools ?? []).map(mapSpoolHit),
		filaments: (data.filaments ?? []).map(mapFilamentHit),
		vendors: (data.vendors ?? []).map(mapVendorHit),
		isColorQuery: !!data.is_color_query
	};
}
