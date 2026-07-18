import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { EntityKind, Selection } from '$lib/types';

// The Library view's entire query state lives in the URL — this module is the
// single place that translates between the query string and a typed
// LibraryState, and the only place that mutates it (always via a navigation).
//
// routes/+page.ts parses the URL into LibraryState with parseLibraryState();
// components read that state from `data` and change it by calling the nav
// helpers below, each of which rewrites the query string and navigates. The
// serialisation is canonical (defaults omitted), so an untouched view has a
// clean, bookmarkable URL and every distinct view maps to exactly one string.

export type GroupMode = 'filament' | 'vendor' | 'material' | 'location' | 'none';

export interface FilterChip {
	prop: string;
	value: string;
}

export interface LibraryState {
	selection: Selection | null;
	group: GroupMode;
	sortKey: string;
	sortAsc: boolean;
	filters: FilterChip[];
	/** Include archived spools in the listing (and group aggregates). */
	showArchived: boolean;
	page: number;
	pageSize: number;
}

const GROUP_MODES: GroupMode[] = ['filament', 'vendor', 'material', 'location', 'none'];
const ENTITY_KINDS: EntityKind[] = ['spool', 'filament', 'vendor'];

const DEFAULTS = {
	group: 'filament' as GroupMode,
	sortKey: 'last_used',
	sortAsc: false,
	showArchived: false,
	page: 1,
	pageSize: 20
};

function parseFilters(raw: string[]): FilterChip[] {
	return raw
		.map((entry) => {
			const i = entry.indexOf(':');
			if (i < 0) return null;
			return {
				prop: decodeURIComponent(entry.slice(0, i)),
				value: decodeURIComponent(entry.slice(i + 1))
			};
		})
		.filter((f): f is FilterChip => f !== null && f.prop !== '');
}

function parsePositiveInt(value: string | null, fallback: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Parse a URL's query params into the canonical Library state (the load fn's job). */
export function parseLibraryState(params: URLSearchParams): LibraryState {
	const group = params.get('group') as GroupMode | null;

	const sel = params.get('sel');
	const si = sel ? sel.indexOf(':') : -1;
	const kind = si > 0 ? (sel!.slice(0, si) as EntityKind) : null;
	const selection = kind && ENTITY_KINDS.includes(kind) ? { kind, id: sel!.slice(si + 1) } : null;

	return {
		selection,
		group: group && GROUP_MODES.includes(group) ? group : DEFAULTS.group,
		sortKey: params.get('sort') ?? DEFAULTS.sortKey,
		sortAsc: params.get('dir') === 'asc',
		filters: parseFilters(params.getAll('f')),
		showArchived: params.get('arch') === '1',
		page: parsePositiveInt(params.get('page'), DEFAULTS.page),
		pageSize: parsePositiveInt(params.get('size'), DEFAULTS.pageSize)
	};
}

/**
 * Whether `kind`/`id` is the current selection, tested against a URLSearchParams
 * (pass a reactive `page.url.searchParams` so list rows re-highlight on
 * navigation). Keeps the `sel` encoding in one place.
 */
export function isSelected(params: URLSearchParams, kind: EntityKind, id: string): boolean {
	return params.get('sel') === `${kind}:${id}`;
}

/** Encode Library state back to a canonical query string (no leading `?`). */
function serializeState(s: LibraryState): string {
	const p = new URLSearchParams();
	if (s.group !== DEFAULTS.group) p.set('group', s.group);
	if (s.sortKey !== DEFAULTS.sortKey) p.set('sort', s.sortKey);
	if (s.sortAsc !== DEFAULTS.sortAsc) p.set('dir', s.sortAsc ? 'asc' : 'desc');
	// Encode prop and value separately so a `:` inside either (locations, lot
	// numbers) survives the round-trip.
	for (const f of s.filters) {
		p.append('f', `${encodeURIComponent(f.prop)}:${encodeURIComponent(f.value)}`);
	}
	if (s.showArchived !== DEFAULTS.showArchived) p.set('arch', s.showArchived ? '1' : '0');
	if (s.page !== DEFAULTS.page) p.set('page', String(s.page));
	if (s.pageSize !== DEFAULTS.pageSize) p.set('size', String(s.pageSize));
	if (s.selection) p.set('sel', `${s.selection.kind}:${s.selection.id}`);
	return p.toString();
}

/** Current Library state read straight off the address bar (for the nav helpers). */
function currentState(): LibraryState {
	return parseLibraryState(new URLSearchParams(window.location.search));
}

/**
 * Navigate to a new Library state. `replace` swaps the current history entry
 * (used for search, so typing doesn't spam history); otherwise a new entry is
 * pushed so back/forward steps through views. keepFocus/noScroll keep the search
 * box focused and the list from jumping.
 */
function navigate(next: LibraryState, replace = false): void {
	const qs = serializeState(next);
	goto(qs ? `?${qs}` : window.location.pathname, {
		replaceState: replace,
		keepFocus: true,
		noScroll: true
	});
}

// --- mutators (each preserves the old ui-store semantics) ------------------

export function setGroup(group: GroupMode): void {
	navigate({ ...currentState(), group, page: DEFAULTS.page });
}

/** Pick a sort key; re-selecting the active key flips its direction. */
export function setSortKey(key: string): void {
	const s = currentState();
	const sortAsc = s.sortKey === key ? !s.sortAsc : false;
	navigate({ ...s, sortKey: key, sortAsc, page: DEFAULTS.page });
}

export function toggleFilter(prop: string, value: string): void {
	const s = currentState();
	const has = s.filters.some((f) => f.prop === prop && f.value === value);
	const filters = has
		? s.filters.filter((f) => !(f.prop === prop && f.value === value))
		: [...s.filters, { prop, value }];
	navigate({ ...s, filters, page: DEFAULTS.page });
}

export function setShowArchived(showArchived: boolean): void {
	navigate({ ...currentState(), showArchived, page: DEFAULTS.page });
}

export function removeFilter(prop: string, value: string): void {
	const s = currentState();
	const filters = s.filters.filter((f) => !(f.prop === prop && f.value === value));
	navigate({ ...s, filters, page: DEFAULTS.page });
}

export function setPage(page: number): void {
	navigate({ ...currentState(), page });
}

export function setPageSize(pageSize: number): void {
	navigate({ ...currentState(), pageSize, page: DEFAULTS.page });
}

export function select(kind: EntityKind, id: string): void {
	navigate({ ...currentState(), selection: { kind, id } });
}

export function clearSelection(): void {
	navigate({ ...currentState(), selection: null });
}

/**
 * Open a search result's inspector on the Library page. The search box lives in
 * the layout, so a result can be picked from any route: when already on the
 * Library page we merge the selection into the current view (preserving its
 * group/sort/filters); otherwise we navigate to the Library root with just the
 * selection.
 */
export function openSearchResult(kind: EntityKind, id: string): void {
	const libraryPath = resolve('/'); // `${base}/`
	const basePath = libraryPath.replace(/\/$/, ''); // base without trailing slash
	const path = window.location.pathname;
	if (path === libraryPath || path === basePath || path === '/') {
		select(kind, id);
		return;
	}
	const p = new URLSearchParams();
	p.set('sel', `${kind}:${id}`);
	goto(`${libraryPath}?${p.toString()}`, { noScroll: true });
}
