import { describe, expect, it } from 'vitest';
import { parseStoredView } from './viewPrefs';

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
			sortAsc: true
		});
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
			sortAsc: false
		});
	});
});
