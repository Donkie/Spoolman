import type { GroupField, GroupQuery, GroupSummary, SortField, SpoolQuery } from './types';
import type { LibraryState } from '$lib/library/params';
import { resolveSortField, resolveGroupSortField } from '$lib/utils/library';
import { settings } from '$lib/stores/settings.svelte';

// Translates the URL-borne LibraryState into concrete /spool and /spool/group
// queries. The UI sort key IS the backend field path now (see FIXED_SORTS in
// utils/library.ts, the single source of truth for sortable fields); the
// resolvers there guard against stale/unknown keys and supply group aggregates.

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
export function buildGroupQuery(state: LibraryState, signal?: AbortSignal): GroupQuery {
	const field = state.group as GroupField;
	const groupField = resolveGroupSortField(state.sortKey) ?? 'group.title';
	const dir = groupField === 'group.title' ? 'asc' : state.sortAsc ? 'asc' : 'desc';
	return {
		field,
		filters: currentFilters(state),
		sort: [{ field: groupField, dir }],
		allowArchived: state.showArchived,
		limit: state.pageSize,
		offset: (state.page - 1) * state.pageSize,
		lowThreshold: settings.lowThreshold,
		signal
	};
}

/** Spools of one group, ordered by the chosen Sort. */
export function buildScopedSpoolQuery(
	state: LibraryState,
	group: GroupSummary,
	limit: number,
	offset: number,
	signal?: AbortSignal
): SpoolQuery {
	const within = resolveSortField(state.sortKey);
	const sort: SortField[] = [
		{ field: within, dir: state.sortAsc ? 'asc' : 'desc' },
		{ field: 'id', dir: 'asc' }
	];
	return {
		filters: currentFilters(state),
		sort,
		groupScope: { field: group.field, key: group.key },
		allowArchived: state.showArchived,
		limit,
		offset,
		lowThreshold: settings.lowThreshold,
		signal
	};
}

/** Flat page-of-spools query (group=none). */
export function buildFlatSpoolQuery(state: LibraryState, signal?: AbortSignal): SpoolQuery {
	const sort: SortField[] = [
		{ field: resolveSortField(state.sortKey), dir: state.sortAsc ? 'asc' : 'desc' },
		{ field: 'id', dir: 'asc' }
	];
	return {
		filters: currentFilters(state),
		sort,
		allowArchived: state.showArchived,
		limit: state.pageSize,
		offset: (state.page - 1) * state.pageSize,
		lowThreshold: settings.lowThreshold,
		signal
	};
}
