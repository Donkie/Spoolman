import { describe, expect, it } from 'vitest';
import { filterByQuery, matchesTerms, searchTerms } from './match';

// What the in-menu search boxes will and won't find. The rule these guard is that
// a match is always visible in the label the user is looking at.

describe('searchTerms', () => {
	it('splits on whitespace and folds case', () => {
		expect(searchTerms('Black PLA')).toEqual(['black', 'pla']);
	});

	it('yields nothing for an empty or blank query', () => {
		expect(searchTerms('')).toEqual([]);
		expect(searchTerms('   ')).toEqual([]);
	});

	it('collapses runs of whitespace rather than emitting empty terms', () => {
		expect(searchTerms('  black   pla  ')).toEqual(['black', 'pla']);
	});
});

describe('matchesTerms', () => {
	it('matches a substring regardless of case', () => {
		expect(matchesTerms('Polymaker PolyLite', searchTerms('polylite'))).toBe(true);
	});

	it('matches every term in any order', () => {
		expect(matchesTerms('Polymaker Black', searchTerms('black poly'))).toBe(true);
	});

	it('requires all terms, not just one', () => {
		expect(matchesTerms('Polymaker Black', searchTerms('black prusa'))).toBe(false);
	});

	it('ignores diacritics on both sides', () => {
		expect(matchesTerms('Añejo', searchTerms('anejo'))).toBe(true);
		expect(matchesTerms('Anejo', searchTerms('añejo'))).toBe(true);
	});

	it('does not match letters that are merely scattered through the label', () => {
		// The fuzzy match this rules out: "lot" would otherwise hit "Location".
		expect(matchesTerms('Location', searchTerms('lot'))).toBe(false);
	});

	it('matches everything when there are no terms', () => {
		expect(matchesTerms('anything', [])).toBe(true);
	});
});

describe('filterByQuery', () => {
	const items = [
		{ label: 'Last used' },
		{ label: 'First used' },
		{ label: 'Remaining weight' },
		{ label: 'Lot nr' }
	];

	it('keeps only the matching items', () => {
		expect(filterByQuery(items, 'used', (i) => i.label).map((i) => i.label)).toEqual([
			'Last used',
			'First used'
		]);
	});

	it('returns the list untouched for a blank query', () => {
		expect(filterByQuery(items, '  ', (i) => i.label)).toBe(items);
	});

	it('can narrow to nothing', () => {
		expect(filterByQuery(items, 'colour', (i) => i.label)).toEqual([]);
	});
});
