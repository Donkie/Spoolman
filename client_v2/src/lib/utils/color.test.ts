import { describe, expect, it } from 'vitest';
import { alphaOf, hasAlpha, hexRgb, normalizeHex, swatchStyle, withAlpha } from './color';

// Translucent filaments are stored as an 8-digit #RRGGBBAA code (issue #1059).
// The alpha channel has to survive a round trip through the editor untouched,
// and an opaque colour must stay 6-digit — that is what the API validator and
// every ecosystem consumer expect.

describe('normalizeHex', () => {
	it('accepts 6- and 8-digit codes, with or without a hash', () => {
		expect(normalizeHex('#ff8800')).toBe('FF8800');
		expect(normalizeHex('ff880080')).toBe('FF880080');
		expect(normalizeHex('  #FF880080  ')).toBe('FF880080');
	});

	it('rejects partial and malformed codes', () => {
		expect(normalizeHex('')).toBeNull();
		expect(normalizeHex('#ff88')).toBeNull();
		expect(normalizeHex('#ff88000')).toBeNull();
		expect(normalizeHex('#gg8800')).toBeNull();
		expect(normalizeHex(undefined)).toBeNull();
	});
});

describe('alphaOf', () => {
	it('reads the alpha byte of an 8-digit code', () => {
		expect(alphaOf('#FF880080')).toBe(128);
		expect(alphaOf('#FF880000')).toBe(0);
	});

	it('treats a colour without an alpha channel as opaque', () => {
		expect(alphaOf('#FF8800')).toBe(255);
		expect(alphaOf('')).toBe(255);
		expect(alphaOf('nonsense')).toBe(255);
	});
});

describe('withAlpha', () => {
	it('appends the alpha channel for a translucent colour', () => {
		expect(withAlpha('#FF8800', 128)).toBe('#FF880080');
		expect(withAlpha('ff8800', 0)).toBe('#FF880000');
	});

	it('drops the alpha channel again at full opacity', () => {
		expect(withAlpha('#FF880080', 255)).toBe('#FF8800');
	});

	it('clamps out-of-range alpha', () => {
		expect(withAlpha('#FF8800', 400)).toBe('#FF8800');
		expect(withAlpha('#FF8800', -5)).toBe('#FF880000');
	});

	it('leaves a partial code alone rather than inventing a colour', () => {
		expect(withAlpha('#ff88', 128)).toBe('#ff88');
	});

	it('round-trips every whole opacity percentage', () => {
		for (let pct = 0; pct <= 100; pct++) {
			const hex = withAlpha('#FF8800', (pct / 100) * 255);
			expect(Math.round((alphaOf(hex) / 255) * 100)).toBe(pct);
		}
	});
});

describe('hasAlpha', () => {
	it('spots a translucent colour anywhere in the list', () => {
		expect(hasAlpha(['#FF8800', '#00FF0080'])).toBe(true);
	});

	it('is false for an all-opaque or empty list', () => {
		expect(hasAlpha(['#FF8800', '#00FF00'])).toBe(false);
		expect(hasAlpha([])).toBe(false);
		expect(hasAlpha(undefined)).toBe(false);
	});
});

describe('swatchStyle', () => {
	it('paints an opaque colour as a plain background', () => {
		expect(swatchStyle(['#FF8800'])).toBe('background:#FF8800');
	});

	it('layers a translucent colour over a checkerboard', () => {
		const style = swatchStyle(['#FF880080']);
		expect(style).toContain('#FF880080');
		expect(style).toContain('conic-gradient');
	});

	it('keeps the checkerboard under a partly translucent multi-colour gradient', () => {
		const style = swatchStyle(['#FF8800', '#00FF0080'], 'coaxial');
		expect(style).toContain('linear-gradient(90deg');
		expect(style).toContain('conic-gradient');
	});

	it('leaves an all-opaque gradient checkerboard-free', () => {
		expect(swatchStyle(['#FF8800', '#00FF00'], 'coaxial')).not.toContain('conic-gradient');
	});
});

describe('hexRgb', () => {
	it('ignores the alpha channel when reading the rgb triplet', () => {
		expect(hexRgb('#FF880080')).toEqual([255, 136, 0]);
	});
});
