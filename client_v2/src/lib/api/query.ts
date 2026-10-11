import type { GroupField, GroupQuery, GroupSummary, Page, SortField, SpoolQuery } from './types';
import { isSpoolScopedFilter, type CatalogView, type LibraryState } from '$lib/library/params';
import { resolveSortField, resolveGroupSortField, catalogSortField } from '$lib/utils/library';
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

/**
 * Whether to ask for filaments that have no spools at all (#1092).
 *
 * Off unless the user asked for it (see params.showEmpty). Finding a spool to
 * print with is the daily job, and a filament you own none of cannot serve it;
 * how many such rows there would be depends on how big a catalogue you keep, so
 * it is not a default that can be right for everyone. Asked for once, it is
 * remembered (see viewPrefs).
 *
 * Even then it is only sent while every active filter is one the *filament* can
 * answer.
 *
 * Ask "which of these are at Shelf A" and a filament with no spools has no
 * answer: it isn't anywhere. Including it would flood that view with every
 * filament in the catalogue instead of showing the handful actually on the
 * shelf. The API says the same and rejects that combination outright, so this
 * is the client keeping off a 400 rather than a preference of its own; the two
 * lists of spool-scoped filters have to stay in step.
 *
 * Archived is not one of them: hiding archived spools is the default view, and
 * a filament whose only spools are archived genuinely has none to print with.
 */
function wantsEmptyGroups(state: LibraryState): boolean {
	return (
		state.showEmpty && state.group === 'filament' && !state.filters.some((f) => isSpoolScopedFilter(f.prop))
	);
}

/** Page-of-groups query (grouped mode). */
export function buildGroupQuery(state: LibraryState, signal?: AbortSignal): GroupQuery {
	const field = state.group as GroupField;
	const groupField = resolveGroupSortField(state.sortKey, state.group) ?? 'group.title';
	const dir = state.sortAsc ? 'asc' : 'desc';
	return {
		field,
		filters: currentFilters(state),
		sort: [{ field: groupField, dir }],
		allowArchived: state.showArchived,
		includeEmpty: wantsEmptyGroups(state),
		limit: state.pageSize,
		offset: (state.page - 1) * state.pageSize,
		lowThreshold: settings.lowThreshold,
		signal
	};
}

/**
 * Whether a catalog page lists the filaments (or manufacturers) with no spools
 * too. It does unless a filter asks about the spools themselves: a filament with
 * none can't be on Shelf A, and the API refuses the pairing (see wantsEmptyGroups).
 */
function catalogIncludesEmpty(state: LibraryState): boolean {
	return !state.filters.some((f) => isSpoolScopedFilter(f.prop));
}

/**
 * Page of a catalog sub-view: one group per filament (or manufacturer), those
 * with no spools included (see catalogIncludesEmpty), with the preview the row
 * draws from.
 */
export function buildCatalogQuery(state: LibraryState, signal?: AbortSignal): GroupQuery {
	const field = catalogSortField(state.view as CatalogView, state.sortKey) ?? 'group.title';
	const sort: SortField[] = [{ field, dir: state.sortAsc ? 'asc' : 'desc' }];
	// Manufacturer sections are runs of consecutive rows (see library/catalog), so
	// the manufacturer has to lead the order or a section would break apart.
	if (state.view === 'filaments' && state.group === 'vendor') {
		sort.unshift({ field: 'group.vendor_name', dir: 'asc' });
	}
	// Most orders tie a lot (every filament with no spools has 0 g and was never
	// used; many share a material), so the name settles ties instead of the
	// database's whim.
	if (field !== 'group.title') sort.push({ field: 'group.title', dir: 'asc' });
	return {
		field: state.view === 'manufacturers' ? 'vendor' : 'filament',
		filters: currentFilters(state),
		sort,
		allowArchived: state.showArchived,
		includeEmpty: catalogIncludesEmpty(state),
		preview: true,
		limit: state.pageSize,
		offset: (state.page - 1) * state.pageSize,
		lowThreshold: settings.lowThreshold,
		signal
	};
}

/**
 * The aggregates behind the manufacturer section headers on one page of the
 * filament catalog: the same filters, narrowed to the manufacturers on screen.
 * Including the empty ones whenever the page does is what makes the filament
 * count cover the same filaments as the rows under the header.
 */
export function buildVendorTotalsQuery(
	state: LibraryState,
	vendorIds: string[],
	signal?: AbortSignal
): GroupQuery {
	return {
		field: 'vendor',
		filters: { ...currentFilters(state), vendorId: vendorIds },
		sort: [],
		allowArchived: state.showArchived,
		includeEmpty: catalogIncludesEmpty(state),
		limit: vendorIds.length,
		offset: 0,
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

/**
 * Every row of a paged list, fetched `size` at a time: for views that need the
 * whole set (every dashboard card, every spool of one filament) without asking
 * the server for all of it in one response.
 */
export async function allPages<T>(
	size: number,
	fetchPage: (offset: number) => Promise<Page<T>>
): Promise<T[]> {
	const all: T[] = [];
	for (;;) {
		const page = await fetchPage(all.length);
		all.push(...page.items);
		if (page.items.length < size || all.length >= page.total) return all;
	}
}
