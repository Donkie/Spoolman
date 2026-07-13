import type { Filament } from '$lib/types';

/** Grams → "1.0 kg". */
export function kg(g: number): string {
	return (g / 1000).toFixed(1) + ' kg';
}

/** Round a gram value for display: whole grams stay whole, else one decimal. */
export function grams(g: number): string {
	return Number.isInteger(g) ? String(g) : g.toFixed(1);
}

/** Grams → "864 g" or "1 kg", switching units at 1000 g like the old client. */
export function weightAuto(weightInGrams: number): string {
	return weightInGrams >= 1000 ? grams(weightInGrams / 1000) + ' kg' : grams(weightInGrams) + ' g';
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
