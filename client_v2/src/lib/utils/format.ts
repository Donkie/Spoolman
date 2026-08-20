import type { Filament } from '$lib/types';

/** Round a gram value for display: whole grams stay whole, else one decimal. */
export function grams(g: number): string {
	return Number.isInteger(g) ? String(g) : g.toFixed(1);
}

/**
 * Round a gram value to the finest precision this UI deals in. Weights reach us through float
 * arithmetic — registering a spool by its measured weight subtracts `net + spool − measured`,
 * and a full 1 kg spool on a 128.11 g core gives 1000 + 128.11 − 1128.11 = 2.3e-13 rather
 * than 0 — while a hundredth of a gram is already below what any scale reads or any row shows.
 */
export function roundGrams(g: number): number {
	return Math.round(g * 100) / 100;
}

/** Grams → "864 g" or "1.2 kg", switching units at 1000 g like the old client. */
export function weightAuto(weightInGrams: number): string {
	// Round to the displayed precision before picking the unit: a full spool left at
	// 999.99999999999995 g by the arithmetic above is 1 kg to every eye that sees it, and
	// showing it as "1000.0 g" next to its identical neighbour's "1 kg" only reads as a bug.
	const w = Math.round(weightInGrams * 10) / 10;
	if (w < 1000) return grams(w) + ' g';
	// Floor to one decimal so the kg shown never rounds up past what's on the spool —
	// a displayed "1.2 kg" always means you have at least 1.2 kg, never as little as 1.15.
	return grams(Math.floor(w / 100) / 10) + ' kg';
}

/** Approximate remaining length in meters for a weight of filament. */
export function lengthMeters(grams: number, f: Filament): number {
	// volume(cm³) = mass / density; cross-section area = π r² (mm² → cm²)
	const area = Math.PI * Math.pow(f.diameter / 2, 2) * 0.01; // cm²
	return grams / (f.density * area) / 100;
}

export function pct(remaining: number, initial: number): number {
	if (!initial) return 0;
	return Math.round((remaining / initial) * 100);
}

export function currency(value: number, symbol = '€'): string {
	return symbol + value.toFixed(2);
}
