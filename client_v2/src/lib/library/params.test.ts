import { afterEach, describe, expect, it, vi } from 'vitest';

// What a Library URL means once the browser has a remembered view (#1036): the
// URL still decides whenever it says anything about the layout, and only a URL
// that mentions neither grouping nor sorting defers to what the user was last
// looking at.
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

async function parseWith(stored: string | null, query: string) {
	vi.resetModules();
	stub(stored);
	const { parseLibraryState } = await import('./params');
	return parseLibraryState(new URLSearchParams(query));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const GROUPED_BY_LOCATION = '{"group":"location","sort":"remaining_weight","asc":true}';

describe('parseLibraryState with a remembered view', () => {
	it('restores the remembered layout for a URL that names none of it', () => {
		return expect(parseWith(GROUPED_BY_LOCATION, '')).resolves.toMatchObject({
			group: 'location',
			sortKey: 'remaining_weight',
			sortAsc: true
		});
	});

	it('still restores it alongside params that describe the contents, not the layout', async () => {
		// Following a QR code or a dashboard link lands on `?sel=…`: the spool is
		// what's being asked for, the layout around it is still the user's.
		const state = await parseWith(GROUPED_BY_LOCATION, 'sel=spool:12&arch=1');
		expect(state).toMatchObject({ group: 'location', showArchived: true });
		expect(state.selection).toEqual({ kind: 'spool', id: '12' });
	});

	it('lets a URL that spells out the view win, so a shared link travels intact', async () => {
		const state = await parseWith(GROUPED_BY_LOCATION, 'group=vendor');
		expect(state).toMatchObject({ group: 'vendor', sortKey: 'last_used', sortAsc: false });
	});

	it('takes the remembered view whole rather than mixing it into a partial URL', async () => {
		// `?sort=remaining_weight` alone means the sender chose that sort under the
		// shipped grouping, ascending left at its default; splicing the remembered
		// grouping and direction in would show neither view.
		const state = await parseWith(GROUPED_BY_LOCATION, 'sort=remaining_weight');
		expect(state).toMatchObject({
			group: 'filament',
			sortKey: 'remaining_weight',
			sortAsc: false
		});
	});

	it('falls back to the shipped view when nothing usable is stored', async () => {
		await expect(parseWith(null, '')).resolves.toMatchObject({
			group: 'filament',
			sortKey: 'last_used',
			sortAsc: false
		});
		// A grouping that no longer exists is as good as nothing stored.
		await expect(parseWith('{"group":"colour","sort":"last_used","asc":false}', '')).resolves.toMatchObject({
			group: 'filament'
		});
	});

	it('keeps the grouped-view invariant over a remembered per-spool sort', async () => {
		// Can't be stored by our own mutators, but a stale entry mustn't produce a
		// grouped list ordered by something that can't order groups.
		await expect(parseWith('{"group":"location","sort":"price","asc":true}', '')).resolves.toMatchObject({
			group: 'none',
			sortKey: 'price'
		});
	});
});
