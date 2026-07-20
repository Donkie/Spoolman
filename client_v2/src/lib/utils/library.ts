import type { Filament, MultiColorDirection, Spool, Vendor } from '$lib/types';
import type { GroupField } from '$lib/api/types';
import type { FieldDef } from '$lib/api/fields';
import { pct, grams } from './format';
import * as m from '$lib/paraglide/messages';

// Client-side concerns ONLY: turning a spool into a row view-model, and the
// metadata that drives the sort/filter menus. Grouping, filtering, sorting,
// aggregation and pagination all happen server-side (see api/*).

interface Repo {
	spools: Spool[];
	filamentById(id: string): Filament | undefined;
	vendorOf(f: Filament): Vendor;
}

export interface SpoolVM {
	spool: Spool;
	filament: Filament;
	vendor: Vendor;
	idLabel: string;
	pctValue: number;
	low: boolean;
	remLabel: string;
	location: string;
	rightLabel: string;
}

/** Minimal shape a group header renders from (GroupSummary satisfies it). */
export interface GroupHeaderInfo {
	title: string;
	subtitle: string;
	badge: string;
	colors: string[];
	direction?: MultiColorDirection;
	meta: string;
}

export function spoolToVM(s: Spool, repo: Repo, lowThreshold: number): SpoolVM {
	const filament = repo.filamentById(s.filamentId)!;
	const vendor = repo.vendorOf(filament);
	const low = !s.unused && s.remaining <= lowThreshold;
	return {
		spool: s,
		filament,
		vendor,
		idLabel: '#' + s.id,
		pctValue: pct(s.remaining, s.initial),
		low,
		remLabel: grams(s.remaining) + ' g',
		// A spool without a location leaves the column blank rather than showing a
		// placeholder — the empty box reads more cleanly in a dense list.
		location: s.location ?? '',
		rightLabel: s.unused
			? m['library.unused']()
			: s.lastUsedLabel
				? m['library.usedAgo']({ time: s.lastUsedLabel })
				: m['library.inUse']()
	};
}

// --- contextual row identity ---------------------------------------------

/** How a spool row is being listed: flat, or nested under a group of some axis. */
export type RowContext = GroupField | 'flat';

export interface RowIdentity {
	title: string;
	sub: string;
}

/**
 * The two-line label a SpoolRow shows for its name column. In the flat view a
 * spool has to identify itself in full. Under a group, whatever the group axis
 * already implies (and shows in the sticky header) is redundant on every row and
 * only causes truncation — so we drop it and surface the part that actually
 * distinguishes this spool instead.
 */
export function rowIdentity(vm: SpoolVM, ctx: RowContext): RowIdentity {
	const { vendor, filament } = vm;
	const dims = `${filament.material} · ${filament.diameter} mm`;
	switch (ctx) {
		case 'vendor':
			// Header shows the manufacturer; identify by the filament alone.
			return { title: filament.name, sub: dims };
		case 'material':
			// Header shows the material; keep maker + name, drop the implied material.
			return { title: `${vendor.name} ${filament.name}`, sub: `${filament.diameter} mm` };
		case 'filament':
			// The whole filament (maker, name, material, colour) is in the header —
			// nothing about it distinguishes these spools, so identify the instance.
			return spoolIdentity(vm);
		case 'location':
		case 'flat':
		default:
			// Nothing about the filament is implied — show it in full.
			return { title: `${vendor.name} ${filament.name}`, sub: dims };
	}
}

/**
 * Distinguish spools of one and the same filament. They're identical except for
 * how they've been used — and #id, fill, weight and location already sit in their
 * own columns — so there's nothing to make a bold title out of. Lead with the
 * usage status as a quiet line; only a comment is worth promoting when present.
 */
function spoolIdentity(vm: SpoolVM): RowIdentity {
	if (vm.spool.comment) return { title: vm.spool.comment, sub: vm.rightLabel };
	return { title: '', sub: vm.rightLabel };
}

/**
 * A filament's human label, "<manufacturer> <name>" (e.g. "3DJAKE Dark Grey"),
 * matching how rows identify a filament elsewhere. Falls back to material or the
 * id when name/vendor are blank. Used by the filament filter menu and its chips.
 */
export function filamentLabel(filament: Filament, vendor: Vendor): string {
	const parts = [vendor.name, filament.name].map((s) => s?.trim()).filter(Boolean);
	if (parts.length) return parts.join(' ');
	return filament.material?.trim() || `#${filament.id}`;
}

// --- sort menu metadata ---------------------------------------------------

export interface SortDef {
	/** Backend sort field path — also the value stored in the URL's `sort` param. */
	key: string;
	labelKey: () => string;
	section: 'spool' | 'filament' | 'vendor' | 'extra';
	unit?: string;
	/**
	 * Group-aggregate field to order groups by in grouped mode, where the backend
	 * exposes one. Sorts without a group aggregate fall back to ordering groups by
	 * title (the within-group spool order still follows `key`).
	 */
	groupField?: string;
}

/**
 * The fixed sort fields, each keyed by the exact backend field path it maps to
 * (see the Spoolman /spool sort docs). This is the single source of truth for
 * both the sort menu (ListToolbar) and the query builders (api/query.ts) — they
 * must never drift, hence one list.
 */
export const FIXED_SORTS: SortDef[] = [
	// Spool
	{ key: 'last_used', labelKey: m['spool.fields.lastUsed'], section: 'spool', groupField: 'group.last_used' },
	{ key: 'first_used', labelKey: m['spool.fields.firstUsed'], section: 'spool' },
	{ key: 'registered', labelKey: m['spool.fields.registered'], section: 'spool' },
	{
		key: 'remaining_weight',
		labelKey: m['spool.fields.remainingWeight'],
		section: 'spool',
		unit: 'g',
		groupField: 'group.total_remaining'
	},
	{ key: 'used_weight', labelKey: m['spool.fields.usedWeight'], section: 'spool', unit: 'g' },
	{ key: 'price', labelKey: m['spool.fields.price'], section: 'spool' },
	{ key: 'location', labelKey: m['spool.fields.location'], section: 'spool' },
	{ key: 'lot_nr', labelKey: m['spool.fields.lotNr'], section: 'spool' },
	// Filament
	{ key: 'filament.name', labelKey: m['filament.fields.name'], section: 'filament' },
	{ key: 'filament.material', labelKey: m['filament.fields.material'], section: 'filament' },
	{ key: 'filament.color_hex', labelKey: m['filament.fields.colorHex'], section: 'filament' },
	{ key: 'filament.diameter', labelKey: m['filament.fields.diameter'], section: 'filament', unit: 'mm' },
	{ key: 'filament.density', labelKey: m['filament.fields.density'], section: 'filament' },
	{
		key: 'filament.settings_extruder_temp',
		labelKey: m['filament.fields.settingsExtruderTemp'],
		section: 'filament',
		unit: '°C'
	},
	{
		key: 'filament.settings_bed_temp',
		labelKey: m['filament.fields.settingsBedTemp'],
		section: 'filament',
		unit: '°C'
	},
	{ key: 'filament.weight', labelKey: m['filament.fields.weight'], section: 'filament', unit: 'g' },
	{ key: 'filament.price', labelKey: m['filament.fields.price'], section: 'filament' },
	// Vendor
	{ key: 'filament.vendor.name', labelKey: m['filament.fields.vendor'], section: 'vendor' }
];

const FIXED_SORT_KEYS = new Set(FIXED_SORTS.map((s) => s.key));

/**
 * All available sort options: the fixed fields above plus the spool's custom
 * extra fields (queried from the backend). Every extra-field type is sortable.
 */
export function sortDefs(extraSpoolFields: FieldDef[] = []): SortDef[] {
	const extra: SortDef[] = extraSpoolFields.map((f) => ({
		key: `extra.${f.key}`,
		labelKey: () => f.name,
		section: 'extra',
		unit: f.unit ?? undefined
	}));
	return [...FIXED_SORTS, ...extra];
}

/**
 * Resolve a URL sort key to a backend sort field. Fixed keys and `extra.*` keys
 * pass through unchanged (the backend safely ignores an unknown extra key);
 * anything else — e.g. a stale bookmarked key from an older client — falls back
 * to the default sort so we never send an invalid field (which would 400).
 */
export function resolveSortField(sortKey: string): string {
	if (FIXED_SORT_KEYS.has(sortKey) || sortKey.startsWith('extra.')) return sortKey;
	return 'last_used';
}

/** The group-aggregate ordering field for a sort key, if the backend supports one. */
export function resolveGroupSortField(sortKey: string): string | undefined {
	return FIXED_SORTS.find((s) => s.key === sortKey)?.groupField;
}
