import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStoredView, rememberView } from './viewPrefs';

// The stored view is the only piece of Library state that doesn't come from the
// URL (#1036), so it's also the only piece that can arrive malformed — from an
// older release, a hand-edited localStorage, or a half-written entry. Anything
// it can't vouch for has to come back as "nothing remembered", because the
// caller turns it straight into the view the user sees.

describe('parseStoredView', () => {
	it('reads back a stored view', () => {
		expect(parseStoredView('{"group":"location","sort":"name","asc":true}')).toEqual({
			group: 'location',
			sortKey: 'name',
			sortAsc: true,
			showEmpty: false,
			showLotNumbers: false
		});
	});

	it('reads back the show-no-spools flag when one was stored', () => {
		expect(parseStoredView('{"group":"filament","sort":"name","asc":true,"empty":true}')).toEqual({
			group: 'filament',
			sortKey: 'name',
			sortAsc: true,
			showEmpty: true,
			showLotNumbers: false
		});
	});

	it('treats an entry written before the flag existed as having it off', () => {
		// Every browser that used the Library before #1092 holds a three-field entry.
		// Rejecting those would throw away a grouping the user picked long ago, the
		// first time they loaded a build that knows about the flag.
		expect(parseStoredView('{"group":"location","sort":"name","asc":false}')?.showEmpty).toBe(false);
	});

	it('has nothing to restore for a browser that never stored one', () => {
		expect(parseStoredView(null)).toBeNull();
		expect(parseStoredView('')).toBeNull();
	});

	it('rejects entries that aren’t a complete view', () => {
		expect(parseStoredView('not json')).toBeNull();
		expect(parseStoredView('null')).toBeNull();
		expect(parseStoredView('"location"')).toBeNull();
		expect(parseStoredView('{"group":"location"}')).toBeNull();
		// A direction stored as a string would make every sort ascending.
		expect(parseStoredView('{"group":"location","sort":"name","asc":"true"}')).toBeNull();
	});

	it('passes an unknown grouping through for the parser to judge', () => {
		// Validating the enum here would duplicate params.GROUP_MODES; the round
		// trip through parseLibraryState is what decides a grouping still exists.
		expect(parseStoredView('{"group":"colour","sort":"name","asc":false}')).toEqual({
			group: 'colour',
			sortKey: 'name',
			sortAsc: false,
			showEmpty: false,
			showLotNumbers: false
		});
	});
});

afterEach(() => vi.unstubAllGlobals());

it('round-trips the lot number preference through storage', () => {
	let stored: string | null = null;
	vi.stubGlobal('localStorage', {
		getItem: () => stored,
		setItem: (_key: string, value: string) => {
			stored = value;
		}
	});
	const view = { group: 'filament', sortKey: 'name', sortAsc: true, showEmpty: false, showLotNumbers: true };
	rememberView(view);
	expect(parseStoredView(stored)).toEqual(view);
	rememberView({ ...view, showLotNumbers: false });
	expect(parseStoredView(stored)?.showLotNumbers).toBe(false);
});

it('defaults lot numbers off for an old stored view with empty enabled', () => {
	expect(parseStoredView('{"group":"filament","sort":"name","asc":true,"empty":true}')?.showLotNumbers).toBe(
		false
	);
});
