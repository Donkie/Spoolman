import type { Filament, MultiColorDirection, Spool, Vendor } from '$lib/types';
import type { GroupSummary } from './types';
import { formatDurationShort, formatShortDate } from '$lib/utils/datetime';

// Map between the Spoolman API JSON shape and the client's domain types.
// The API uses integer ids and snake_case; the client uses string ids for
// filament/vendor (so ids compose into keys) and camelCase.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export function colorsFromApi(f: Json | undefined): string[] {
	if (!f) return [];
	if (f.multi_color_hexes) {
		return String(f.multi_color_hexes)
			.split(',')
			.filter(Boolean)
			.map((h) => '#' + h.replace(/^#/, ''));
	}
	if (f.color_hex) return ['#' + String(f.color_hex).replace(/^#/, '')];
	return [];
}

export function mapVendor(v: Json): Vendor {
	return {
		id: String(v.id),
		name: v.name ?? '(unnamed manufacturer)',
		emptyWeight: v.empty_spool_weight ?? 0,
		comment: v.comment ?? '',
		externalId: v.external_id ?? undefined,
		registeredLabel: formatShortDate(v.registered),
		extra: v.extra ?? {}
	};
}

export function mapFilament(f: Json): Filament {
	return {
		id: String(f.id),
		vendorId: f.vendor ? String(f.vendor.id) : '',
		name: f.name ?? '(unnamed filament)',
		material: f.material ?? '',
		colors: colorsFromApi(f),
		multiColorDirection: f.multi_color_direction ?? undefined,
		diameter: f.diameter ?? 0,
		density: f.density ?? 0,
		nozzleTemp: f.settings_extruder_temp ?? 0,
		bedTemp: f.settings_bed_temp ?? 0,
		weight: f.weight ?? 0,
		spoolWeight: f.spool_weight ?? undefined,
		price: f.price ?? 0,
		articleNumber: f.article_number ?? undefined,
		comment: f.comment ?? '',
		externalId: f.external_id ?? undefined,
		registeredLabel: formatShortDate(f.registered),
		extra: f.extra ?? {}
	};
}

export function mapSpool(s: Json): Spool {
	const f: Json = s.filament ?? {};
	return {
		id: s.id,
		filamentId: String(f.id ?? ''),
		unused: (s.used_weight ?? 0) === 0,
		remaining: s.remaining_weight ?? 0,
		initial: s.initial_weight ?? f.weight ?? 0,
		location: s.location ?? '',
		lot: s.lot_nr ?? '',
		price: s.price ?? undefined,
		firstUsed: s.first_used ?? undefined,
		lastUsed: s.last_used ?? undefined,
		firstUsedLabel: formatShortDate(s.first_used),
		lastUsedLabel: formatDurationShort(s.last_used),
		registered: s.registered ?? undefined,
		registeredLabel: formatShortDate(s.registered),
		archived: s.archived ?? false,
		comment: s.comment ?? '',
		extra: s.extra ?? {}
	};
}

export function mapGroup(g: Json): GroupSummary {
	const field = g.group_by as GroupSummary['field'];
	let title = '';
	let subtitle = '';
	let badge = '';
	let colors: string[] = [];

	if (field === 'filament' && g.filament) {
		const f: Json = g.filament;
		title = f.name ?? '(unnamed filament)';
		subtitle = `${f.vendor?.name ?? 'No manufacturer'} · ${f.diameter} mm`;
		badge = f.material ?? '';
		colors = colorsFromApi(f);
	} else if (field === 'vendor' && g.vendor) {
		title = g.vendor.name ?? '(unnamed manufacturer)';
		subtitle = `${g.spool_count} spool${g.spool_count === 1 ? '' : 's'}`;
	} else if (field === 'material') {
		title = g.key ?? 'No material';
		subtitle = `${g.spool_count} spool${g.spool_count === 1 ? '' : 's'}`;
	} else if (field === 'location') {
		title = g.key ?? 'No location';
		subtitle = `${g.in_use_count} in use`;
	} else {
		title = g.key ?? '';
	}

	return {
		field,
		key: g.key ?? '',
		title,
		subtitle,
		badge,
		colors,
		spoolCount: g.spool_count ?? 0,
		inUseCount: g.in_use_count ?? 0,
		unusedCount: (g.spool_count ?? 0) - (g.in_use_count ?? 0),
		totalRemaining: g.total_remaining_weight ?? 0,
		hasStock: (g.spool_count ?? 0) > 0,
		lastUsedLabel: formatDurationShort(g.last_used),
		lastUsedSort: 0
	};
}

// --- domain patch → API request body -------------------------------------

/**
 * Build the API's colour fields from a domain colour list + direction. The
 * backend keys single- and multi-colour filaments differently and rejects
 * having both set, so we pick one branch by colour count and null out the
 * other keys (important when switching an existing filament between the two).
 */
export function colorFieldsToApi(
	colors: string[] | undefined,
	direction: MultiColorDirection | undefined
): Json {
	const hexes = (colors ?? []).map((c) => c.trim().replace(/^#/, '')).filter(Boolean);
	if (hexes.length > 1) {
		return {
			color_hex: null,
			multi_color_hexes: hexes.join(','),
			multi_color_direction: direction ?? 'coaxial'
		};
	}
	return { color_hex: hexes[0] ?? null, multi_color_hexes: null, multi_color_direction: null };
}

export function spoolPatchToApi(patch: Partial<Spool>): Json {
	const out: Json = {};
	if ('location' in patch) out.location = patch.location ?? '';
	if ('lot' in patch) out.lot_nr = patch.lot ?? '';
	if ('price' in patch) out.price = patch.price ?? null;
	if ('firstUsed' in patch) out.first_used = patch.firstUsed ?? null;
	if ('lastUsed' in patch) out.last_used = patch.lastUsed ?? null;
	if ('comment' in patch) out.comment = patch.comment ?? '';
	if ('archived' in patch) out.archived = patch.archived;
	if ('remaining' in patch) out.remaining_weight = patch.remaining;
	if ('extra' in patch) out.extra = patch.extra;
	return out;
}

export function filamentPatchToApi(patch: Partial<Filament>): Json {
	const out: Json = {};
	if ('name' in patch) out.name = patch.name;
	if ('material' in patch) out.material = patch.material;
	// Colours and direction always travel together (the inspector pushes both), so
	// keying off `colors` keeps the single/multi request self-consistent.
	if ('colors' in patch) Object.assign(out, colorFieldsToApi(patch.colors, patch.multiColorDirection));
	if ('diameter' in patch) out.diameter = patch.diameter;
	if ('density' in patch) out.density = patch.density;
	if ('weight' in patch) out.weight = patch.weight;
	// Blank means "no tare weight known" — send an explicit null to clear it.
	if ('spoolWeight' in patch) out.spool_weight = patch.spoolWeight ?? null;
	if ('nozzleTemp' in patch) out.settings_extruder_temp = patch.nozzleTemp;
	if ('bedTemp' in patch) out.settings_bed_temp = patch.bedTemp;
	if ('price' in patch) out.price = patch.price;
	if ('articleNumber' in patch) out.article_number = patch.articleNumber ?? '';
	if ('comment' in patch) out.comment = patch.comment ?? '';
	if ('extra' in patch) out.extra = patch.extra;
	return out;
}

export function vendorPatchToApi(patch: Partial<Vendor>): Json {
	const out: Json = {};
	if ('name' in patch) out.name = patch.name;
	if ('emptyWeight' in patch) out.empty_spool_weight = patch.emptyWeight;
	if ('comment' in patch) out.comment = patch.comment ?? '';
	if ('extra' in patch) out.extra = patch.extra;
	return out;
}
