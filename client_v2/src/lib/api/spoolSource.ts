import type { Filament, Spool, Vendor } from '$lib/types';
import type { GroupQuery, GroupSummary, Page, SpoolQuery } from './types';
import { getList, getJson, patchJson, postJson, putJson } from './http';
import type { QueryParams } from './http';
import {
	mapFilament,
	mapGroup,
	mapSpool,
	mapVendor,
	spoolPatchToApi,
	filamentPatchToApi,
	vendorPatchToApi
} from './map';
import { inventory } from '$lib/stores/inventory.svelte';
import { getExternalFilaments, type ExternalFilament } from './external';

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
	colorHex?: string;
	nozzleTemp?: number;
	bedTemp?: number;
	price?: number;
	articleNumber?: string;
	comment?: string;
}

// Map a filter chip prop → API query param. Values are quoted for exact match.
const FILTER_PARAM: Record<string, string> = {
	material: 'filament.material',
	vendor: 'filament.vendor.name',
	location: 'location',
	lot: 'lot_nr'
};

function quote(v: string): string {
	return `"${v}"`;
}

function applyFilters(params: QueryParams, filters: Record<string, string[]>) {
	for (const [prop, values] of Object.entries(filters)) {
		const key = FILTER_PARAM[prop];
		if (!key || !values.length) continue;
		params[key] = values.map(quote).join(',');
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

		const { items, total } = await getList('/spool/group', params);
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

		const { items, total } = await getList('/spool', params);
		return { items: cacheSpools(items), total };
	}

	async searchFilaments(query: string, limit = 8): Promise<Filament[]> {
		// The filament endpoint's name filter is `name` (not `filament.name`).
		const params: QueryParams = { limit, sort: 'name:asc' };
		if (query) params['name'] = query;
		const items = await getJson<Json[]>('/filament', params);
		const filaments = items.map((f) => {
			if (f.vendor) inventory.upsertVendor(mapVendor(f.vendor));
			return mapFilament(f);
		});
		inventory.upsertFilaments(filaments);
		return filaments;
	}

	async searchExternalFilaments(query: string, limit = 8): Promise<ExternalFilament[]> {
		const all = await getExternalFilaments();
		const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return [];
		const matches = all.filter((f) => {
			const hay = `${f.manufacturer} ${f.name} ${f.material}`.toLowerCase();
			return words.every((w) => hay.includes(w));
		});
		return matches.slice(0, limit);
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
			color_hex: draft.colorHex || undefined,
			settings_extruder_temp: draft.nozzleTemp || undefined,
			settings_bed_temp: draft.bedTemp || undefined,
			price: draft.price || undefined,
			article_number: draft.articleNumber || undefined,
			comment: draft.comment || undefined
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

	// --- writes -------------------------------------------------------------

	async saveSpool(id: number, patch: Partial<Spool>): Promise<void> {
		const updated = await patchJson<Json>(`/spool/${id}`, spoolPatchToApi(patch));
		inventory.upsertSpool(mapSpool(updated));
	}
	async archiveSpool(id: number): Promise<void> {
		await this.saveSpool(id, { archived: true });
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
