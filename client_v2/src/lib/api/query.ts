import type { GroupField, GroupQuery, GroupSummary, SortField, SpoolQuery } from './types';
import type { LibraryState } from '$lib/library/params';
import { settings } from '$lib/stores/settings.svelte';

// The ONLY place that maps UI sort keys / group modes to API field paths.
// Field names here match the Spoolman spool/group endpoints exactly. The
// LibraryState comes from the URL (see lib/library/params.ts).

const SORT_FIELD: Record<string, string> = {
	lastUsed: 'last_used',
	rem: 'remaining_weight',
	price: 'price',
	reg: 'registered',
	lot: 'lot_nr',
	mat: 'filament.material',
	hue: 'filament.color_hex',
	noz: 'filament.settings_extruder_temp',
	dry: 'extra.dryer_cycles'
};

// Group-level ordering: map the chosen Sort to a group aggregate where the
// backend supports it, otherwise order groups by title.
const GROUP_SORT_FIELD: Record<string, string> = {
	rem: 'group.total_remaining',
	lastUsed: 'group.last_used'
};

/** True when the list should page GROUPS (grouping on). */
export function isGroupedMode(state: LibraryState): boolean {
	return state.group !== 'none';
}

function currentFilters(state: LibraryState): Record<string, string[]> {
	const filters: Record<string, string[]> = {};
	for (const f of state.filters) (filters[f.prop] ??= []).push(f.value);
	return filters;
}

/** Page-of-groups query (grouped mode). */
export function buildGroupQuery(state: LibraryState): GroupQuery {
	const field = state.group as GroupField;
	const groupField = GROUP_SORT_FIELD[state.sortKey] ?? 'group.title';
	const dir = groupField === 'group.title' ? 'asc' : state.sortAsc ? 'asc' : 'desc';
	return {
		field,
		filters: currentFilters(state),
		search: state.query.trim() || undefined,
		sort: [{ field: groupField, dir }],
		limit: state.pageSize,
		offset: (state.page - 1) * state.pageSize,
		lowThreshold: settings.lowThreshold
	};
}

/** Spools of one group, ordered by the chosen Sort. */
export function buildScopedSpoolQuery(state: LibraryState, group: GroupSummary, limit: number): SpoolQuery {
	const within = SORT_FIELD[state.sortKey] ?? 'last_used';
	const sort: SortField[] = [
		{ field: within, dir: state.sortAsc ? 'asc' : 'desc' },
		{ field: 'id', dir: 'asc' }
	];
	return {
		filters: currentFilters(state),
		sort,
		search: state.query.trim() || undefined,
		groupScope: { field: group.field, key: group.key },
		limit,
		offset: 0,
		lowThreshold: settings.lowThreshold
	};
}

/** Flat page-of-spools query (group=none). */
export function buildFlatSpoolQuery(state: LibraryState): SpoolQuery {
	const sort: SortField[] = [
		{ field: SORT_FIELD[state.sortKey] ?? 'last_used', dir: state.sortAsc ? 'asc' : 'desc' },
		{ field: 'id', dir: 'asc' }
	];
	return {
		filters: currentFilters(state),
		sort,
		search: state.query.trim() || undefined,
		limit: state.pageSize,
		offset: (state.page - 1) * state.pageSize,
		lowThreshold: settings.lowThreshold
	};
}
