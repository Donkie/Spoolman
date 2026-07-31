import { describe, expect, it } from 'vitest';
import { currency, grams, lengthMeters, pct, weightAuto } from './format';
import type { Filament } from '$lib/types';

// These format every weight, length and percentage the user sees. The rounding
// rules are deliberate (see the comments in format.ts) rather than incidental, so
// they're pinned here.

const filament = (over: Partial<Filament> = {}): Filament =>
	({
		id: '1',
		vendorId: '1',
		name: 'Test',
		material: 'PLA',
		colors: ['#000000'],
		diameter: 1.75,
		density: 1.24,
		nozzleTemp: 210,
		bedTemp: 60,
		weight: 1000,
		price: 20,
		comment: '',
		registeredLabel: '',
		extra: {},
		...over
	}) as Filament;

describe('grams', () => {
	it('keeps whole grams whole', () => {
		expect(grams(0)).toBe('0');
		expect(grams(864)).toBe('864');
	});

	it('shows one decimal otherwise', () => {
		expect(grams(864.5)).toBe('864.5');
		expect(grams(0.1)).toBe('0.1');
	});

	it('rounds to one decimal rather than truncating', () => {
		expect(grams(1.26)).toBe('1.3');
	});
});

describe('weightAuto', () => {
	it('uses grams below the 1000 g switch point', () => {
		expect(weightAuto(0)).toBe('0 g');
		expect(weightAuto(864)).toBe('864 g');
		expect(weightAuto(999)).toBe('999 g');
		expect(weightAuto(999.5)).toBe('999.5 g');
	});

	it('switches to kg at exactly 1000 g', () => {
		expect(weightAuto(1000)).toBe('1 kg');
	});

	it('floors kg so the figure never overstates what is on the spool', () => {
		// The whole point of flooring: 1199 g must not read as "1.2 kg".
		expect(weightAuto(1199)).toBe('1.1 kg');
		expect(weightAuto(1250)).toBe('1.2 kg');
		expect(weightAuto(1999)).toBe('1.9 kg');
		expect(weightAuto(2000)).toBe('2 kg');
	});
});

describe('lengthMeters', () => {
	it('matches the known length of a 1 kg PLA spool at 1.75 mm', () => {
		// ~335 m is the widely published figure for 1 kg of 1.75 mm PLA.
		expect(lengthMeters(1000, filament())).toBeCloseTo(335.3, 0);
	});

	it('scales linearly with weight', () => {
		const f = filament();
		expect(lengthMeters(500, f)).toBeCloseTo(lengthMeters(1000, f) / 2, 6);
	});

	it('gives a shorter run for a thicker filament of the same weight', () => {
		// 2.85 mm is ~2.65x the cross-section of 1.75 mm, so the same mass is shorter.
		const thin = lengthMeters(1000, filament({ diameter: 1.75 }));
		const thick = lengthMeters(1000, filament({ diameter: 2.85 }));
		expect(thick).toBeLessThan(thin);
		expect(thin / thick).toBeCloseTo((2.85 / 1.75) ** 2, 6);
	});

	it('gives a shorter run for a denser material of the same weight', () => {
		const pla = lengthMeters(1000, filament({ density: 1.24 }));
		const petg = lengthMeters(1000, filament({ density: 1.27 }));
		expect(petg).toBeLessThan(pla);
	});

	it('is zero for zero weight', () => {
		expect(lengthMeters(0, filament())).toBe(0);
	});
});

describe('pct', () => {
	it('returns a rounded percentage of the initial weight', () => {
		expect(pct(500, 1000)).toBe(50);
		expect(pct(1000, 1000)).toBe(100);
		expect(pct(0, 1000)).toBe(0);
		expect(pct(333, 1000)).toBe(33);
	});

	it('returns 0 rather than dividing by zero for an unknown initial weight', () => {
		expect(pct(500, 0)).toBe(0);
	});

	it('can exceed 100 for an over-used spool', () => {
		// Not clamped here; callers that render a bar clamp at their own layer.
		expect(pct(1100, 1000)).toBe(110);
	});
});

describe('currency', () => {
	it('always shows two decimals', () => {
		expect(currency(20)).toBe('€20.00');
		expect(currency(19.9)).toBe('€19.90');
		expect(currency(0)).toBe('€0.00');
	});

	it('accepts a different symbol', () => {
		expect(currency(20, '$')).toBe('$20.00');
	});
});
