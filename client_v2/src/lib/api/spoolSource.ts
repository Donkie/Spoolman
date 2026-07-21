import type { Filament, MultiColorDirection, Spool, Vendor } from '$lib/types';
import type { GroupQuery, GroupSummary, Page, SpoolQuery } from './types';
import { getList, getJson, patchJson, postJson, putJson, HttpError } from './http';
import type { QueryParams } from './http';
import {
	mapFilament,
	mapGroup,
	mapSpool,
	mapVendor,
	spoolPatchToApi,
	filamentPatchToApi,
	vendorPatchToApi,
	colorFieldsToApi
} from './map';
import { inventory } from '$lib/stores/inventory.svelte';
import { filamentLabel } from '$lib/utils/library';
import type { EntityType } from './fields';
import { type ExternalFilament } from './external';
import { searchAll } from './search';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

// HTTP-backed data source against the real Spoolman API. It also populates the
// reactive cache with every entity it fetches, so detail views (which read the
// cache) have their data as soon as it's visible in the list.

export interface NewFilamentDraft {
	name: string;
	vendorName: string;
	material: string;
	density: number;
	diameter: number;
	weight?: number;
	spoolWeight?: number;
	/** One or more hex colors (with or without '#'); 2+ makes it multi-color. */
	colors?: string[];
	multiColorDirection?: MultiColorDirection;
	nozzleTemp?: number;
	bedTemp?: number;
	price?: number;
	articleNumber?: string;
	comment?: string;
}

// Map a filter chip prop → API query param. Values are quoted for exact match.
const FILTER_PARAM: Record<string, string> = {
	filament: 'filament.id',
	material: 'filament.material',
	vendor: 'filament.vendor.name',
	direction: 'filament.multi_color_direction',
	location: 'location',
	lot: 'lot_nr'
};

// Filters whose values are passed through verbatim rather than double-quoted for
// exact string match. `filament` filters by numeric id, which the API parses as
// an int and would reject if quoted. `direction` is passed verbatim so its empty
// value (single-color = no direction) hits the backend's NULL-match branch, which
// quoting would turn into an exact match on the literal empty string instead.
const UNQUOTED_FILTERS = new Set(['filament', 'direction']);

// A filter prop is either one of the fixed categories above or an extra-field
// filter whose prop is already the query param the backend expects — `extra.<key>`
// for spool fields, `filament.extra.<key>` / `filament.vendor.extra.<key>` for a
// spool's filament or vendor.
function filterParam(prop: string): string | undefined {
	return prop.includes('extra.') ? prop : FILTER_PARAM[prop];
}

function quote(v: string): string {
	return `"${v}"`;
}

function applyFilters(params: QueryParams, filters: Record<string, string[]>) {
	for (const [prop, values] of Object.entries(filters)) {
		const key = filterParam(prop);
		if (!key || !values.length) continue;
		const encode = UNQUOTED_FILTERS.has(prop) ? (v: string) => v : quote;
		params[key] = values.map(encode).join(',');
	}
}

function sortParam(sort: { field: string; dir: string }[]): string | undefined {
	return sort.length ? sort.map((s) => `${s.field}:${s.dir}`).join(',') : undefined;
}

function scopeParams(params: QueryParams, scope: SpoolQuery['groupScope']) {
	if (!scope) return;
	switch (scope.field) {
		case 'filament':
			params['filament.id'] = scope.key;
			break;
		case 'vendor':
			params['filament.vendor.id'] = scope.key === '' ? '-1' : scope.key;
			break;
		case 'material':
			params['filament.material'] = scope.key === '' ? '' : quote(scope.key);
			break;
		case 'location':
			params['location'] = scope.key === '' ? '' : quote(scope.key);
			break;
	}
}

/** Treat a 404 as "no such entity" (undefined); re-throw anything else. */
function swallow404(e: unknown): null {
	if (e instanceof HttpError && e.status === 404) return null;
	throw e;
}

function cacheSpools(raw: unknown[]): Spool[] {
	const spools = (raw as Json[]).map((s) => {
		if (s.filament) {
			inventory.upsertFilament(mapFilament(s.filament));
			if (s.filament.vendor) inventory.upsertVendor(mapVendor(s.filament.vendor));
		}
		return mapSpool(s);
	});
	inventory.upsertSpools(spools);
	return spools;
}

class HttpSpoolSource {
	async listGroups(query: GroupQuery): Promise<Page<GroupSummary>> {
		const params: QueryParams = {
			group_by: query.field,
			sort: sortParam(query.sort),
			limit: query.limit,
			offset: query.offset,
			allow_archived: query.allowArchived ? 'true' : undefined
		};
		applyFilters(params, query.filters);

		const { items, total } = await getList('/spool/group', params, query.signal);
		for (const g of items as Json[]) {
			if (g.filament) {
				inventory.upsertFilament(mapFilament(g.filament));
				if (g.filament.vendor) inventory.upsertVendor(mapVendor(g.filament.vendor));
			}
			if (g.vendor) inventory.upsertVendor(mapVendor(g.vendor));
		}
		return { items: (items as Json[]).map(mapGroup), total };
	}

	async listSpools(query: SpoolQuery): Promise<Page<Spool>> {
		const params: QueryParams = {
			sort: sortParam(query.sort),
			limit: query.limit,
			offset: query.offset,
			allow_archived: query.allowArchived ? 'true' : undefined
		};
		applyFilters(params, query.filters);
		scopeParams(params, query.groupScope);

		const { items, total } = await getList('/spool', params, query.signal);
		return { items: cacheSpools(items), total };
	}

	/**
	 * Load a batch of filaments for the label picker/preview, newest first, and
	 * cache them. Filament catalogs are far smaller than spool inventories, so a
	 * single generous page covers virtually every library; the label picker also
	 * has a search box for anything past the cap.
	 */
	async listFilaments(limit = 1000, signal?: AbortSignal): Promise<Filament[]> {
		const items = await getJson<Json[]>('/filament', { limit, sort: 'id:desc' }, signal);
		const filaments = items.map((f) => {
			if (f.vendor) inventory.upsertVendor(mapVendor(f.vendor));
			return mapFilament(f);
		});
		inventory.upsertFilaments(filaments);
		return filaments;
	}

	async searchFilaments(query: string, limit = 8): Promise<Filament[]> {
		const q = query.trim();
		if (!q) {
			// No query yet: browse a slice of the catalog (sorted by name) so the
			// picker has something to show as soon as it opens.
			const params: QueryParams = { limit, sort: 'name:asc' };
			const items = await getJson<Json[]>('/filament', params);
			const filaments = items.map((f) => {
				if (f.vendor) inventory.upsertVendor(mapVendor(f.vendor));
				return mapFilament(f);
			});
			inventory.upsertFilaments(filaments);
			return filaments;
		}
		// Reuse the cross-entity /search backend that powers the library search bar,
		// so the picker matches on name, material, article number, comment, extra
		// fields and colour — not just the filament name. We only want the filament
		// hits here (results already upsert into the reactive cache).
		const { filaments } = await searchAll(q, 20);
		return filaments.map((m) => m.entity).slice(0, limit);
	}

	async searchExternalFilaments(query: string, limit = 8): Promise<ExternalFilament[]> {
		// Filtering happens server-side (/external/filament/search) so the whole catalog
		// — thousands of entries — never has to be downloaded to the client.
		const q = query.trim();
		if (!q) return [];
		return getJson<ExternalFilament[]>('/external/filament/search', { query: q, limit });
	}

	/**
	 * Import a SpoolmanDB filament into the local catalog (creating its vendor if
	 * needed), de-duplicated by external_id. Returns the local filament.
	 */
	async importExternalFilament(ext: ExternalFilament): Promise<Filament> {
		// Already imported?
		const existing = await getJson<Json[]>('/filament', { external_id: ext.id });
		if (existing.length) {
			if (existing[0].vendor) inventory.upsertVendor(mapVendor(existing[0].vendor));
			const f = mapFilament(existing[0]);
			inventory.upsertFilament(f);
			return f;
		}

		// Get-or-create the vendor (matched by external_id = manufacturer name).
		let vendorId: number;
		const vendors = await getJson<Json[]>('/vendor', { external_id: ext.manufacturer });
		if (vendors.length) {
			inventory.upsertVendor(mapVendor(vendors[0]));
			vendorId = vendors[0].id;
		} else {
			const created = await postJson<Json>('/vendor', {
				name: ext.manufacturer,
				external_id: ext.manufacturer
			});
			inventory.upsertVendor(mapVendor(created));
			vendorId = created.id;
		}

		const body: Json = {
			name: ext.name,
			material: ext.material,
			vendor_id: vendorId,
			density: ext.density,
			diameter: ext.diameter,
			weight: ext.weight,
			spool_weight: ext.spool_weight ?? undefined,
			settings_extruder_temp: ext.extruder_temp ?? undefined,
			settings_bed_temp: ext.bed_temp ?? undefined,
			external_id: ext.id
		};
		if (ext.color_hexes && ext.color_hexes.length) {
			body.multi_color_hexes = ext.color_hexes.map((h) => h.replace(/^#/, '')).join(',');
			if (ext.multi_color_direction) body.multi_color_direction = ext.multi_color_direction;
		} else if (ext.color_hex) {
			body.color_hex = ext.color_hex.replace(/^#/, '');
		}

		const created = await postJson<Json>('/filament', body);
		const f = mapFilament(created);
		inventory.upsertFilament(f);
		return f;
	}

	/** Find a vendor by (case-insensitive) name or create it; returns its id. */
	async getOrCreateVendor(name: string): Promise<number | undefined> {
		const trimmed = name.trim();
		if (!trimmed) return undefined;
		const all = await getJson<Json[]>('/vendor');
		const match = all.find((v) => (v.name ?? '').toLowerCase() === trimmed.toLowerCase());
		if (match) {
			inventory.upsertVendor(mapVendor(match));
			return match.id;
		}
		const created = await postJson<Json>('/vendor', { name: trimmed });
		inventory.upsertVendor(mapVendor(created));
		return created.id;
	}

	/** Create a brand-new filament (and its vendor if needed) from a draft. */
	async createFilament(draft: NewFilamentDraft): Promise<Filament> {
		const vendorId = await this.getOrCreateVendor(draft.vendorName);
		const body: Json = {
			name: draft.name || undefined,
			material: draft.material || undefined,
			vendor_id: vendorId,
			density: draft.density,
			diameter: draft.diameter,
			weight: draft.weight || undefined,
			spool_weight: draft.spoolWeight || undefined,
			settings_extruder_temp: draft.nozzleTemp || undefined,
			settings_bed_temp: draft.bedTemp || undefined,
			price: draft.price || undefined,
			article_number: draft.articleNumber || undefined,
			comment: draft.comment || undefined,
			...colorFieldsToApi(draft.colors, draft.multiColorDirection)
		};
		const created = await postJson<Json>('/filament', body);
		const f = mapFilament(created);
		inventory.upsertFilament(f);
		return f;
	}

	async listFilamentsByVendor(vendorId: string): Promise<Filament[]> {
		const items = await getJson<Json[]>('/filament', { 'vendor.id': vendorId });
		const filaments = items.map((f) => {
			if (f.vendor) inventory.upsertVendor(mapVendor(f.vendor));
			return mapFilament(f);
		});
		inventory.upsertFilaments(filaments);
		return filaments;
	}

	// --- single-entity fetches (deep links) ---------------------------------
	// The reactive cache is normally filled by the list/search/live paths, so a
	// deep link straight to an entity that isn't on the loaded page finds nothing.
	// These fetch one entity by id and upsert it (plus its embedded relations) so
	// the inspector resolves regardless of list state. A 404 (stale link, deleted
	// entity) resolves to undefined rather than throwing.

	async fetchSpool(id: number, signal?: AbortSignal): Promise<Spool | undefined> {
		const s = await getJson<Json | null>(`/spool/${id}`, {}, signal).catch(swallow404);
		return s ? cacheSpools([s])[0] : undefined;
	}
	async fetchFilament(id: string, signal?: AbortSignal): Promise<Filament | undefined> {
		const f = await getJson<Json | null>(`/filament/${id}`, {}, signal).catch(swallow404);
		if (!f) return undefined;
		if (f.vendor) inventory.upsertVendor(mapVendor(f.vendor));
		const filament = mapFilament(f);
		inventory.upsertFilament(filament);
		return filament;
	}
	async fetchVendor(id: string, signal?: AbortSignal): Promise<Vendor | undefined> {
		const v = await getJson<Json | null>(`/vendor/${id}`, {}, signal).catch(swallow404);
		if (!v) return undefined;
		const vendor = mapVendor(v);
		inventory.upsertVendor(vendor);
		return vendor;
	}

	// --- writes -------------------------------------------------------------

	async saveSpool(id: number, patch: Partial<Spool>): Promise<void> {
		const updated = await patchJson<Json>(`/spool/${id}`, spoolPatchToApi(patch));
		inventory.upsertSpool(mapSpool(updated));
	}
	async setSpoolArchived(id: number, archived: boolean): Promise<void> {
		await this.saveSpool(id, { archived });
	}
	/** Consume (or, if negative, add back) filament by length. */
	async useSpoolLength(id: number, length: number): Promise<Spool> {
		const updated = await putJson<Json>(`/spool/${id}/use`, { use_length: length });
		const spool = mapSpool(updated);
		inventory.upsertSpool(spool);
		return spool;
	}
	/** Consume (or, if negative, add back) filament by weight. */
	async useSpoolWeight(id: number, weight: number): Promise<Spool> {
		const updated = await putJson<Json>(`/spool/${id}/use`, { use_weight: weight });
		const spool = mapSpool(updated);
		inventory.upsertSpool(spool);
		return spool;
	}
	/** Consume filament based on the current gross (spool + filament) weight measurement. */
	async measureSpool(id: number, weight: number): Promise<Spool> {
		const updated = await putJson<Json>(`/spool/${id}/measure`, { weight });
		const spool = mapSpool(updated);
		inventory.upsertSpool(spool);
		return spool;
	}
	async saveFilament(id: string, patch: Partial<Filament>): Promise<void> {
		const updated = await patchJson<Json>(`/filament/${id}`, filamentPatchToApi(patch));
		inventory.upsertFilament(mapFilament(updated));
	}
	async saveVendor(id: string, patch: Partial<Vendor>): Promise<void> {
		const updated = await patchJson<Json>(`/vendor/${id}`, vendorPatchToApi(patch));
		inventory.upsertVendor(mapVendor(updated));
	}
	async createSpool(body: Json): Promise<Spool> {
		const created = await postJson<Json>('/spool', body);
		return cacheSpools([created])[0];
	}

	// --- filter option lists -----------------------------------------------

	async materials(): Promise<string[]> {
		return getJson<string[]>('/material');
	}
	/**
	 * Every filament as a `{ value: id, label }` option for the "filament" filter,
	 * so a spool listing can be narrowed to one specific filament (e.g. a given
	 * colour from a given manufacturer). Filaments are cached so the chosen chip
	 * can render its label from the reactive store.
	 */
	async filamentOptions(): Promise<{ value: string; label: string }[]> {
		const items = await getJson<Json[]>('/filament');
		const filaments = items.map((f) => {
			if (f.vendor) inventory.upsertVendor(mapVendor(f.vendor));
			return mapFilament(f);
		});
		inventory.upsertFilaments(filaments);
		return filaments
			.map((f) => ({ value: f.id, label: filamentLabel(f, inventory.vendorOf(f)) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}
	/** Distinct values currently stored for a scalar extra field (text/single-choice). */
	async extraFieldValues(entity: EntityType, key: string): Promise<string[]> {
		return getJson<string[]>(`/field/${entity}/${encodeURIComponent(key)}/values`);
	}
	async locations(): Promise<string[]> {
		return getJson<string[]>('/location');
	}
	/** Rename a location, moving every spool currently in it to the new name. */
	async renameLocation(current: string, next: string): Promise<void> {
		await patchJson<string>(`/location/${encodeURIComponent(current)}`, { name: next });
	}
	async lotNumbers(): Promise<string[]> {
		return getJson<string[]>('/lot-number');
	}
	async vendorNames(): Promise<string[]> {
		const vendors = await getJson<Json[]>('/vendor');
		inventory.upsertVendors(vendors.map(mapVendor));
		return vendors
			.map((v) => v.name)
			.filter(Boolean)
			.sort();
	}
}

export const spoolSource = new HttpSpoolSource();
