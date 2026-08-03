import type {
	Filament,
	FilamentPatch,
	MultiColorDirection,
	Spool,
	SpoolPatch,
	Vendor,
	VendorPatch
} from '$lib/types';
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

/**
 * Below this much used, a spool counts as untouched. `used_weight === 0` was too literal a
 * test: registering a spool by its measured weight computes `net + spool − measured`, and in
 * floating point a full 1 kg spool on a 128.11 g core lands on 2.3e-13 instead of 0. Such a
 * spool claimed to be in use the moment it was added (#986). A hundredth of a gram is under
 * any scale's resolution and under the display's, so nothing real is rounded away here — and
 * a negative used_weight (filament added back) falls on the unused side too, as it should.
 */
const USED_EPSILON_GRAMS = 0.01;

export function mapSpool(s: Json): Spool {
	const f: Json = s.filament ?? {};
	return {
		id: s.id,
		filamentId: String(f.id ?? ''),
		unused: (s.used_weight ?? 0) < USED_EPSILON_GRAMS,
		remaining: s.remaining_weight ?? 0,
		initial: s.initial_weight ?? f.weight ?? 0,
		initialOverride: s.initial_weight ?? undefined,
		usedWeight: s.used_weight ?? 0,
		location: s.location ?? '',
		lot: s.lot_nr ?? '',
		price: s.price ?? undefined,
		spoolWeight: s.spool_weight ?? undefined,
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
	let title: string;
	let subtitle: string;
	let badge = '';
	let colors: string[] = [];
	let direction: MultiColorDirection | undefined;
	// Filament groups carry their manufacturer separately from the subtitle text
	// so the header can render it as a link to the vendor (see GroupHeader).
	let vendorId: string | undefined;
	let vendorName: string | undefined;

	if (field === 'filament' && g.filament) {
		const f: Json = g.filament;
		title = f.name ?? '(unnamed filament)';
		subtitle = `${f.diameter} mm`;
		if (f.vendor) {
			vendorId = String(f.vendor.id);
			vendorName = f.vendor.name ?? '(unnamed manufacturer)';
		}
		badge = f.material ?? '';
		colors = colorsFromApi(f);
		direction = f.multi_color_direction ?? undefined;
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
		// extra.<key>: the key IS the value, and there is no entity to name the group.
		// The dashboard, which is what groups on these, titles them itself.
		title = g.key ?? '';
		subtitle = `${g.spool_count} spool${g.spool_count === 1 ? '' : 's'}`;
	}

	return {
		field,
		key: g.key ?? '',
		title,
		subtitle,
		badge,
		vendorId,
		vendorName,
		colors,
		direction,
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

export function spoolPatchToApi(patch: SpoolPatch): Json {
	const out: Json = {};
	// Re-pointing a spool at another filament. The API takes a numeric id and
	// rejects a null one, so an empty/absent value is left out of the request
	// entirely rather than sent as a clear.
	if ('filamentId' in patch && patch.filamentId) out.filament_id = Number(patch.filamentId);
	if ('location' in patch) out.location = patch.location ?? '';
	if ('lot' in patch) out.lot_nr = patch.lot ?? '';
	if ('price' in patch) out.price = patch.price ?? null;
	if ('firstUsed' in patch) out.first_used = patch.firstUsed ?? null;
	if ('lastUsed' in patch) out.last_used = patch.lastUsed ?? null;
	if ('comment' in patch) out.comment = patch.comment ?? '';
	if ('archived' in patch) out.archived = patch.archived;
	if ('remaining' in patch) out.remaining_weight = patch.remaining;
	// The spool's own full weight. `initial` is the effective one (the filament's
	// when the spool has none), so writing it is what turns the fallback into a
	// value the spool keeps for itself — which is the point when its filament changes.
	// A blank one travels as an explicit null: that is what hands the field back to
	// the filament, and `undefined` would be dropped by JSON.stringify instead.
	if ('initial' in patch) out.initial_weight = patch.initial ?? null;
	// Likewise the tare weight — blank means "use the filament's".
	if ('spoolWeight' in patch) out.spool_weight = patch.spoolWeight ?? null;
	if ('extra' in patch) out.extra = patch.extra;
	return out;
}

export function filamentPatchToApi(patch: FilamentPatch): Json {
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

export function vendorPatchToApi(patch: VendorPatch): Json {
	const out: Json = {};
	if ('name' in patch) out.name = patch.name;
	if ('emptyWeight' in patch) out.empty_spool_weight = patch.emptyWeight;
	if ('comment' in patch) out.comment = patch.comment ?? '';
	if ('extra' in patch) out.extra = patch.extra;
	return out;
}
