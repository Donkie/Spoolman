import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { EntityKind, Selection } from '$lib/types';
import { isGroupOrderable, defaultSortAsc } from '$lib/utils/library';

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

	const rawGroup = group && GROUP_MODES.includes(group) ? group : DEFAULTS.group;
	const sortKey = params.get('sort') ?? DEFAULTS.sortKey;
	// Enforce the grouped-view invariant: a group can only be ordered by a
	// group-orderable sort. A hand-crafted or stale URL pairing a grouping with a
	// per-spool sort renders flat, honouring the more specific sort intent. (Our
	// own mutators never emit such a pairing — see setSortKey/setGroup.)
	return {
		selection,
		group: isGroupOrderable(sortKey, rawGroup) ? rawGroup : 'none',
		sortKey,
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
	const s = currentState();
	// A group can only be ordered three ways; if the active sort isn't one of
	// them, fall back to the default group ordering so the new view is coherent
	// rather than silently sorting only within groups.
	const keepSort = isGroupOrderable(s.sortKey, group);
	const sortKey = keepSort ? s.sortKey : DEFAULTS.sortKey;
	const sortAsc = keepSort ? s.sortAsc : DEFAULTS.sortAsc;
	navigate({ ...s, group, sortKey, sortAsc, page: DEFAULTS.page });
}

/** Pick a sort key; re-selecting the active key flips its direction. */
export function setSortKey(key: string): void {
	const s = currentState();
	const sortAsc = s.sortKey === key ? !s.sortAsc : defaultSortAsc(key);
	// A per-spool ranking can't order groups, so switch to the flat list where
	// the ranking is actually visible instead of reordering only within groups.
	const group = isGroupOrderable(key, s.group) ? s.group : 'none';
	navigate({ ...s, sortKey: key, sortAsc, group, page: DEFAULTS.page });
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

// --- href builders (the navigational twins of the mutators above) ----------
//
// The mutators navigate imperatively; these return the same target as a string
// so a plain `<a href>` can carry it. That's what makes list rows real links —
// middle-click / ctrl-click "open in new tab", "copy link address", hover
// preview — instead of `<button onclick>`. Links built from the current view
// yield a query *relative* to the Library page (where they're rendered), so
// they stay correct under any deploy base path; pass a reactive
// `page.url.searchParams` so each link tracks the live group/sort/filters.

/** Query string (with leading `?`) that applies `sel` on top of `state`. */
function selectQuery(state: LibraryState, kind: EntityKind, id: string): string {
	return `?${serializeState({ ...state, selection: { kind, id } })}`;
}

/** Href that opens `kind`/`id`'s inspector, merged into the current view. */
export function selectHref(params: URLSearchParams, kind: EntityKind, id: string): string {
	return selectQuery(parseLibraryState(params), kind, id);
}

/** Same as {@link selectHref} but from an already-parsed state (grouped rows). */
export function selectHrefFromState(state: LibraryState, kind: EntityKind, id: string): string {
	return selectQuery(state, kind, id);
}

/** Href for a given page number within an already-parsed state (pagination links). */
export function pageHrefFromState(state: LibraryState, page: number): string {
	return `?${serializeState({ ...state, page })}`;
}

/**
 * Absolute (base-aware) href that opens `kind`/`id` on the Library page from
 * anywhere — a bare selection with no other view state. Use this off the
 * Library page (a relative `?query` there would attach to the wrong path).
 */
export function libraryHref(kind: EntityKind, id: string): string {
	return `${resolve('/')}?sel=${kind}:${id}`;
}

/**
 * Href for a search result. The search box lives in the layout, so a result can
 * be picked from any route: on the Library page we merge into the current view
 * (preserving group/sort/filters); elsewhere we point at the Library root with
 * just the selection. Mirrors {@link openSearchResult}.
 */
export function searchResultHref(
	params: URLSearchParams,
	pathname: string,
	kind: EntityKind,
	id: string
): string {
	const libraryPath = resolve('/'); // `${base}/`
	const basePath = libraryPath.replace(/\/$/, ''); // base without trailing slash
	if (pathname === libraryPath || pathname === basePath || pathname === '/') {
		return selectHref(params, kind, id);
	}
	return libraryHref(kind, id);
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
