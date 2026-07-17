import type { Filament, Spool, Vendor } from '$lib/types';
import type { GroupField } from '$lib/api/types';
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
		location: s.location || m['library.noLocation'](),
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

// --- sort/filter menu metadata -------------------------------------------

export interface SortDef {
	key: string;
	labelKey: () => string;
	section: 'spool' | 'filament' | 'extra';
	unit?: string;
}

export function sortDefs(): SortDef[] {
	return [
		{ key: 'lastUsed', labelKey: m['spool.fields.lastUsed'], section: 'spool' },
		{ key: 'rem', labelKey: m['spool.fields.remainingWeight'], section: 'spool', unit: 'g' },
		{ key: 'price', labelKey: m['spool.fields.price'], section: 'spool' },
		{ key: 'reg', labelKey: m['spool.fields.registered'], section: 'spool' },
		{ key: 'lot', labelKey: m['spool.fields.lotNr'], section: 'spool' },
		{ key: 'mat', labelKey: m['filament.fields.material'], section: 'filament' },
		{ key: 'hue', labelKey: m['filament.fields.colorHex'], section: 'filament' },
		{ key: 'noz', labelKey: m['filament.fields.settingsExtruderTemp'], section: 'filament', unit: '°C' },
		{ key: 'dry', labelKey: m['library.sort.dryer'], section: 'extra' }
	];
}
