import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { EntityKind, Selection } from '$lib/types';
import { isGroupOrderable, defaultSortAsc } from '$lib/utils/library';
import { isDateFilterProp, parseDateFilter } from './dateFilter';
import { rememberedView, rememberView } from './viewPrefs';

// The Library view's entire query state lives in the URL — this module is the
// single place that translates between the query string and a typed
// LibraryState, and the only place that mutates it (always via a navigation).
//
// routes/+page.ts parses the URL into LibraryState with parseLibraryState();
// components read that state from `data` and change it by calling the nav
// helpers below, each of which rewrites the query string and navigates. The
// serialisation is canonical (defaults omitted), so an untouched view has a
// clean, bookmarkable URL and every distinct view maps to exactly one string.
//
// That stays true of the remembered view too (#1036): arriving on a URL that
// mentions neither grouping nor sort doesn't quietly parse the preference into
// the state, it navigates to the URL that spells the preference out (see
// rememberedViewHref and viewPrefs). The address bar keeps describing the view.

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

/** The params that spell out how the list is laid out, as opposed to what it
 *  holds. A URL naming none of them is the one that defers to the remembered
 *  view; naming any of them describes a view of its own, which is taken whole so
 *  a stored grouping never gets spliced onto a link's sort. */
const VIEW_PARAMS = ['group', 'sort', 'dir'];

const DEFAULTS = {
	group: 'filament' as GroupMode,
	sortKey: 'last_used',
	sortAsc: false,
	showArchived: false,
	page: 1,
	pageSize: 20
};

function parseFilters(raw: string[]): FilterChip[] {
	return (
		raw
			.map((entry) => {
				const i = entry.indexOf(':');
				if (i < 0) return null;
				return {
					prop: decodeURIComponent(entry.slice(0, i)),
					value: decodeURIComponent(entry.slice(i + 1))
				};
			})
			.filter((f): f is FilterChip => f !== null && f.prop !== '')
			// A date chip carries a range (or "never") in its value (see dateFilter). One
			// that doesn't parse is dropped rather than passed on: an unreadable chip would
			// narrow the list by a rule nothing on screen can explain, or be sent to the
			// backend as an invalid bound.
			.filter((f) => !isDateFilterProp(f.prop) || parseDateFilter(f.value) !== null)
	);
}

function parsePositiveInt(value: string | null, fallback: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Parse a URL's query params into the canonical Library state (the load fn's
 * job). A pure function of the URL, deliberately: SvelteKit caches and preloads
 * load results per URL, so a state that also depended on the remembered view
 * would be served stale after that preference changed (see rememberedViewHref).
 */
export function parseLibraryState(params: URLSearchParams): LibraryState {
	const group = params.get('group') as GroupMode | null;

	const sel = params.get('sel');
	const si = sel ? sel.indexOf(':') : -1;
	const kind = si > 0 ? (sel!.slice(0, si) as EntityKind) : null;
	const selection = kind && ENTITY_KINDS.includes(kind) ? { kind, id: sel!.slice(si + 1) } : null;

	const rawGroup = group && GROUP_MODES.includes(group) ? group : DEFAULTS.group;
	const sortKey = params.get('sort') ?? DEFAULTS.sortKey;
	const sortAsc = params.get('dir') === 'asc';
	// Enforce the grouped-view invariant: a group can only be ordered by a
	// group-orderable sort. A hand-crafted or stale URL pairing a grouping with a
	// per-spool sort renders flat, honouring the more specific sort intent. (Our
	// own mutators never emit such a pairing — see setSortKey/setGroup.)
	return {
		selection,
		group: isGroupOrderable(sortKey, rawGroup) ? rawGroup : 'none',
		sortKey,
		sortAsc,
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
 * Where entering the Library on `url` should actually land: the same view with
 * the remembered grouping and sort spelled out in the query string, or null when
 * the URL already describes a view (or there's nothing worth restoring). The
 * Library page navigates there on entry, replacing the history entry — see
 * routes/+page.svelte.
 *
 * Restoring the view by rewriting the URL, rather than by quietly parsing the
 * preference into the state, is what keeps the whole thing coherent. The address
 * bar always spells out what's on screen, so the view stays linkable; the load
 * function stays a pure function of the URL, so SvelteKit's per-URL load cache
 * can't serve a state built from a preference that has since changed; and every
 * distinct view keeps a distinct URL, so picking the *default* grouping is a real
 * navigation rather than a no-op against an unchanged bare URL.
 */
export function rememberedViewHref(url: URL): string | null {
	if (VIEW_PARAMS.some((p) => url.searchParams.has(p))) return null;

	const stored = rememberedView();
	if (!stored) return null;

	// A grouping that no longer exists is as good as nothing stored, and a view
	// that matches the shipped one is already what the bare URL means.
	const group = GROUP_MODES.includes(stored.group as GroupMode)
		? (stored.group as GroupMode)
		: DEFAULTS.group;
	if (
		group === DEFAULTS.group &&
		stored.sortKey === DEFAULTS.sortKey &&
		stored.sortAsc === DEFAULTS.sortAsc
	) {
		return null;
	}

	// Everything the URL *does* say (a selection, filters, archived spools) is
	// kept; only the layout comes from the preference.
	const state = parseLibraryState(url.searchParams);
	const qs = serializeState({ ...state, group, sortKey: stored.sortKey, sortAsc: stored.sortAsc });
	return `${url.pathname}?${qs}`;
}

/**
 * Navigate to a new Library state. `replace` swaps the current history entry
 * (used for search, so typing doesn't spam history); otherwise a new entry is
 * pushed so back/forward steps through views. keepFocus/noScroll keep the search
 * box focused and the list from jumping.
 */
function navigate(next: LibraryState, replace = false): void {
	// Remember the layout the user is navigating to, so returning to the Library
	// from another page restores it. Recorded here rather than in setGroup /
	// setSortKey so it always matches the view actually shown, including
	// setGroup's fallback to the default sort. Back/forward doesn't come through
	// here: stepping through history replays old views without redefining what
	// "the Library" means next time it's opened fresh.
	rememberView({ group: next.group, sortKey: next.sortKey, sortAsc: next.sortAsc });

	const qs = serializeState(next);
	// Both targets are base-path-independent: a bare `?query` resolves against the
	// current URL, and window.location.pathname already includes the base path.
	// eslint-disable-next-line svelte/no-navigation-without-resolve
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

/**
 * Set a filter that can only hold one value at a time, replacing whatever the
 * prop already carried. Date ranges work this way: two ranges on one field would
 * read as an intersection nobody asked for, and the API takes a single pair of
 * bounds per field anyway, so picking a new range means picking a new range.
 */
export function setFilter(prop: string, value: string): void {
	const s = currentState();
	const filters = [...s.filters.filter((f) => f.prop !== prop), { prop, value }];
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
	// libraryPath is `resolve('/')`, so the base path is already applied.
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	goto(`${libraryPath}?${p.toString()}`, { noScroll: true });
}
