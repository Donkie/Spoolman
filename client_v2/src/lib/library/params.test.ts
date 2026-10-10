import { afterEach, describe, expect, it, vi } from 'vitest';

// Where arriving at the Library should really land once the browser has a
// remembered view (#1036). The rule is that the URL wins whenever it says
// anything about the layout; only a URL mentioning neither grouping nor sorting
// is redirected to the one that spells the remembered view out.
//
// Returning an href — rather than folding the preference into parseLibraryState
// — is the whole design: the address bar has to keep describing what's on
// screen, or the view stops being linkable, SvelteKit's per-URL load cache
// starts serving states built from a preference that has since changed, and
// picking the default grouping stops being a navigation at all.
//
// The remembered view is read once and cached, so each case gets a fresh module
// registry with its own stored entry.

function stub(stored: string | null) {
	const store = new Map<string, string>();
	if (stored !== null) store.set('spoolman-v2-library-view', stored);
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v)
	});
}

async function hrefFor(stored: string | null, query: string) {
	vi.resetModules();
	stub(stored);
	const { rememberedViewHref } = await import('./params');
	return rememberedViewHref(new URL(`http://host/${query}`));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const GROUPED_BY_LOCATION = '{"group":"location","sort":"remaining_weight","asc":true}';

describe('rememberedViewHref', () => {
	it('spells the remembered view out for a URL that names none of it', async () => {
		expect(await hrefFor(GROUPED_BY_LOCATION, '')).toBe('/?group=location&sort=remaining_weight&dir=asc');
	});

	it('keeps what the URL does say about the contents', async () => {
		// Following a QR code or a dashboard link lands on `?sel=…`: the spool is
		// what's being asked for, the layout around it is still the user's.
		expect(await hrefFor(GROUPED_BY_LOCATION, '?sel=spool:12&arch=1')).toBe(
			'/?group=location&sort=remaining_weight&dir=asc&arch=1&sel=spool%3A12'
		);
	});

	it('leaves a URL that spells out the view alone, so a shared link travels intact', async () => {
		expect(await hrefFor(GROUPED_BY_LOCATION, '?group=vendor')).toBeNull();
	});

	it('leaves a partial one alone too, rather than mixing the two views', async () => {
		// `?sort=remaining_weight` means the sender chose that sort under the
		// shipped grouping; splicing the remembered grouping and direction in would
		// show neither view.
		expect(await hrefFor(GROUPED_BY_LOCATION, '?sort=remaining_weight')).toBeNull();
		expect(await hrefFor(GROUPED_BY_LOCATION, '?dir=asc')).toBeNull();
	});

	it('has nothing to do when nothing usable is stored', async () => {
		expect(await hrefFor(null, '')).toBeNull();
		expect(await hrefFor('not json', '')).toBeNull();
		// A grouping that no longer exists is as good as nothing stored.
		expect(await hrefFor('{"group":"colour","sort":"last_used","asc":false}', '')).toBeNull();
	});

	it('has nothing to do when the remembered view is the shipped one', async () => {
		// The bare URL already means exactly this, and redirecting to a query
		// string that encodes the defaults would only make it uglier.
		expect(await hrefFor('{"group":"filament","sort":"last_used","asc":false}', '')).toBeNull();
	});
});

describe('parseLibraryState', () => {
	it('reads the view from the URL alone, never from the stored preference', async () => {
		// The load function's purity is what SvelteKit's per-URL caching rests on:
		// a bare URL means the shipped view here, and the remembered one is applied
		// by navigating to a URL that says so.
		vi.resetModules();
		stub(GROUPED_BY_LOCATION);
		const { parseLibraryState } = await import('./params');

		expect(parseLibraryState(new URLSearchParams(''))).toMatchObject({
			group: 'filament',
			sortKey: 'last_used',
			sortAsc: false
		});
	});

	it('keeps a date filter whose range it can read', async () => {
		vi.resetModules();
		stub(null);
		const { parseLibraryState } = await import('./params');

		expect(parseLibraryState(new URLSearchParams('f=last_used%3A-24h..')).filters).toEqual([
			{ prop: 'last_used', value: '-24h..' }
		]);
	});

	it('drops a date filter it cannot read, rather than filtering by something invisible', async () => {
		// Hand-edited or written by an older/newer client. An unreadable range would
		// otherwise reach the API as a bad bound, or narrow the list by a rule the
		// chip can't spell out.
		vi.resetModules();
		stub(null);
		const { parseLibraryState } = await import('./params');

		expect(parseLibraryState(new URLSearchParams('f=last_used%3Ayesterday')).filters).toEqual([]);
		// Non-date filters are untouched by that rule.
		expect(parseLibraryState(new URLSearchParams('f=location%3AShelf A')).filters).toEqual([
			{ prop: 'location', value: 'Shelf A' }
		]);
	});

	it('keeps the grouped-view invariant over a remembered per-spool sort', async () => {
		// A stale entry can't be allowed to produce a grouped list ordered by
		// something that can't order groups, so the href it yields has to parse
		// back to a coherent view.
		const href = await hrefFor('{"group":"location","sort":"price","asc":true}', '');
		expect(href).toBe('/?group=location&sort=price&dir=asc');

		vi.resetModules();
		const { parseLibraryState } = await import('./params');
		expect(parseLibraryState(new URL(`http://host${href}`).searchParams)).toMatchObject({
			group: 'none',
			sortKey: 'price'
		});
	});
});

// The filament and manufacturer lists are sub-views of the Library, picked by
// `view`. They are entered fresh every time (the Library tab always lands on
// spools), so the spool view's remembered layout must never leak into them, and
// each has its own defaults that the URL omits.
describe('catalog views', () => {
	async function load() {
		vi.resetModules();
		stub(GROUPED_BY_LOCATION);
		return import('./params');
	}

	it('defaults to manufacturer sections, alphabetical', async () => {
		const { parseLibraryState } = await load();
		expect(parseLibraryState(new URLSearchParams('view=filaments'))).toMatchObject({
			view: 'filaments',
			group: 'vendor',
			sortKey: 'name',
			sortAsc: true
		});
		expect(parseLibraryState(new URLSearchParams('view=manufacturers'))).toMatchObject({
			view: 'manufacturers',
			group: 'none',
			sortKey: 'name',
			sortAsc: true
		});
	});

	it('falls back to spools for an unknown view', async () => {
		const { parseLibraryState } = await load();
		expect(parseLibraryState(new URLSearchParams('view=colours')).view).toBe('spools');
	});

	it('only takes the groupings and sorts the view offers', async () => {
		const { parseLibraryState } = await load();
		expect(
			parseLibraryState(new URLSearchParams('view=filaments&group=none&sort=last_used&dir=desc'))
		).toMatchObject({ group: 'none', sortKey: 'last_used', sortAsc: false });
		expect(parseLibraryState(new URLSearchParams('view=filaments&sort=filament.extra.shelf'))).toMatchObject({
			sortKey: 'filament.extra.shelf'
		});
		// A spool-only grouping or sort is not an option here, a filament's custom
		// field is not one in the manufacturer list, and that list has nothing to
		// group by at all.
		expect(parseLibraryState(new URLSearchParams('view=filaments&group=location&sort=price'))).toMatchObject({
			group: 'vendor',
			sortKey: 'name'
		});
		expect(
			parseLibraryState(new URLSearchParams('view=manufacturers&group=vendor&sort=filament.extra.shelf'))
		).toMatchObject({ group: 'none', sortKey: 'name' });
	});

	it('keeps filters on the spools themselves', async () => {
		const { parseLibraryState } = await load();
		const state = parseLibraryState(
			new URLSearchParams('view=filaments&f=material%3APLA&f=location%3AShelf&empty=1')
		);
		expect(state.filters).toEqual([
			{ prop: 'material', value: 'PLA' },
			{ prop: 'location', value: 'Shelf' }
		]);
		// Filaments with no spools are always listed here, so there's no toggle to carry.
		expect(state.showEmpty).toBe(false);
	});

	it('is left alone by the remembered spool view', async () => {
		expect(await hrefFor(GROUPED_BY_LOCATION, '?view=filaments')).toBeNull();
		expect(await hrefFor(GROUPED_BY_LOCATION, '?view=manufacturers&sel=vendor:3')).toBeNull();
	});

	it('links to a fresh catalog, omitting its own defaults', async () => {
		const { catalogHref } = await load();
		expect(catalogHref('filaments')).toBe('/?view=filaments');
		expect(catalogHref('filaments', [{ prop: 'vendor', value: 'Prusa:ment' }])).toBe(
			'/?view=filaments&f=vendor%3APrusa%253Ament'
		);
		expect(catalogHref('manufacturers')).toBe('/?view=manufacturers');
	});

	it('keeps the view when a row is selected', async () => {
		const { parseLibraryState, selectHrefFromState } = await load();
		const state = parseLibraryState(new URLSearchParams('view=filaments&group=none'));
		expect(selectHrefFromState(state, 'filament', '7')).toBe('?view=filaments&group=none&sel=filament%3A7');
	});
});
