import { describe, expect, it } from 'vitest';
import { filterDecimalInsertion, isPartialDecimal, normalizeDecimal, parseDecimal } from './numeric';

// These rules stand between the keyboard and every weight, price, temperature and
// diameter in the app: a decimal comma has to survive, and nothing that isn't a
// number may reach the API.

describe('parseDecimal', () => {
	it('reads a decimal point', () => {
		expect(parseDecimal('1.75')).toBe(1.75);
	});

	it('reads a decimal comma the same way', () => {
		expect(parseDecimal('1,75')).toBe(1.75);
	});

	it('reads plain integers and signs', () => {
		expect(parseDecimal('250')).toBe(250);
		expect(parseDecimal('-4,5')).toBe(-4.5);
		expect(parseDecimal('+7')).toBe(7);
	});

	it('reads values with the separator at either end', () => {
		expect(parseDecimal('1,')).toBe(1);
		expect(parseDecimal(',5')).toBe(0.5);
	});

	it('ignores surrounding whitespace', () => {
		expect(parseDecimal('  12.5  ')).toBe(12.5);
	});

	it('passes finite numbers straight through', () => {
		expect(parseDecimal(3)).toBe(3);
		expect(parseDecimal(NaN)).toBeNull();
	});

	it('returns null for anything that is not a plain number', () => {
		for (const bad of ['', '   ', 'abc', '1e5', '0x10', 'Infinity', '1 2', '1.2.3', '-', ',']) {
			expect(parseDecimal(bad), bad).toBeNull();
		}
	});

	it('returns null rather than 0 for no value at all', () => {
		expect(parseDecimal(null)).toBeNull();
		expect(parseDecimal(undefined)).toBeNull();
		expect(parseDecimal('0')).toBe(0);
	});
});

describe('normalizeDecimal', () => {
	it('turns the typed comma into the canonical point', () => {
		expect(normalizeDecimal('1,75')).toBe('1.75');
		expect(normalizeDecimal('1.75')).toBe('1.75');
		expect(normalizeDecimal('')).toBe('');
	});
});

describe('isPartialDecimal', () => {
	it('accepts a number still being typed', () => {
		for (const s of ['', '-', '1', '1,', '1.', ',5', '-0.4']) {
			expect(isPartialDecimal(s), s).toBe(true);
		}
	});

	it('rejects letters, exponents and second separators', () => {
		for (const s of ['a', '1e', '1e5', '1..2', '1,2,3', '1 ', '+1']) {
			expect(isPartialDecimal(s), s).toBe(false);
		}
	});

	it('rejects a minus where negatives are not allowed', () => {
		expect(isPartialDecimal('-1', false)).toBe(false);
		expect(isPartialDecimal('1', false)).toBe(true);
	});
});

describe('filterDecimalInsertion', () => {
	it('keeps a clean paste as-is', () => {
		expect(filterDecimalInsertion('1,75')).toBe('1,75');
	});

	it('drops a trailing unit', () => {
		expect(filterDecimalInsertion('12,5 g')).toBe('12,5');
	});

	it('skips leading junk', () => {
		expect(filterDecimalInsertion('$12.50')).toBe('12.50');
	});

	it('truncates at a second separator rather than closing the gap', () => {
		// "1.23" would silently be ten times the pasted 1.2.
		expect(filterDecimalInsertion('1.2.3')).toBe('1.2');
	});

	it('yields nothing for text with no number in it', () => {
		expect(filterDecimalInsertion('abc')).toBe('');
	});

	it('respects a separator already in the field', () => {
		expect(filterDecimalInsertion('5.5', '1.', '')).toBe('5');
	});

	it('respects text that follows the caret', () => {
		expect(filterDecimalInsertion('2.5', '', '.75')).toBe('2');
	});

	it('only keeps a minus at the very front', () => {
		expect(filterDecimalInsertion('-5')).toBe('-5');
		expect(filterDecimalInsertion('-5', '1', '')).toBe('5');
		expect(filterDecimalInsertion('-5', '', '', { negative: false })).toBe('5');
	});
});
