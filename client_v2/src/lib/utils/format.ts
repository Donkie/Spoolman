import type { Filament } from '$lib/types';

/** Round a gram value for display: whole grams stay whole, else one decimal. */
export function grams(g: number): string {
	return Number.isInteger(g) ? String(g) : g.toFixed(1);
}

/** Grams → "864 g" or "1.2 kg", switching units at 1000 g like the old client. */
export function weightAuto(weightInGrams: number): string {
	if (weightInGrams < 1000) return grams(weightInGrams) + ' g';
	// Floor to one decimal so the kg shown never rounds up past what's on the spool —
	// a displayed "1.2 kg" always means you have at least 1.2 kg, never as little as 1.15.
	return grams(Math.floor(weightInGrams / 100) / 10) + ' kg';
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
