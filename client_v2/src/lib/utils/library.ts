import type { Filament, Spool, Vendor } from '$lib/types';
import { pct } from './format';

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
	name: string;
	sub: string;
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
		name: `${vendor.name} ${filament.name}`,
		sub: `${filament.material} · ${filament.diameter} mm`,
		pctValue: pct(s.remaining, s.initial),
		low,
		remLabel: s.remaining + ' g',
		location: s.location || 'no location',
		rightLabel: s.unused ? 'unused' : s.lastUsedLabel ? 'used ' + s.lastUsedLabel + ' ago' : 'in use'
	};
}

// --- sort/filter menu metadata -------------------------------------------

export interface SortDef {
	key: string;
	label: string;
	section: 'Spool' | 'Filament' | 'Extra fields';
	unit?: string;
}

export function sortDefs(): SortDef[] {
	return [
		{ key: 'lastUsed', label: 'Last used', section: 'Spool' },
		{ key: 'rem', label: 'Remaining weight', section: 'Spool', unit: 'g' },
		{ key: 'price', label: 'Price', section: 'Spool' },
		{ key: 'reg', label: 'Registered', section: 'Spool' },
		{ key: 'lot', label: 'Lot №', section: 'Spool' },
		{ key: 'mat', label: 'Material', section: 'Filament' },
		{ key: 'hue', label: 'Color (hue)', section: 'Filament' },
		{ key: 'noz', label: 'Nozzle temp', section: 'Filament', unit: '°C' },
		{ key: 'dry', label: 'Dryer cycles', section: 'Extra fields' }
	];
}
