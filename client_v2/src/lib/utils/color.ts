// Color helpers ported from the prototype: turning a filament's color list into
// a swatch style, plus hue/distance math used for color search and sorting.

import type { MultiColorDirection } from '$lib/types';

export function hexRgb(h: string): [number, number, number] {
	let s = (h || '#888').replace('#', '');
	if (s.length === 3) {
		s = s
			.split('')
			.map((c) => c + c)
			.join('');
	}
	return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0) as [number, number, number];
}

/**
 * Returns an inline `background` style string for a swatch given one or more hex
 * colors. Definition (ring) is added by Swatch.svelte, so this only paints the
 * underlying color layer.
 *
 * The gradient angle reflects the filament's physical layout so the swatch reads
 * the same way as the direction picker in ColorEditor:
 *   - coaxial (coextruded): colours run side-by-side → split left↔right (90deg)
 *   - longitudinal: colours change along the strand → stacked bottom↔top (0deg)
 *   - unknown: a neutral diagonal (135deg), also used for generic gradients
 */
export function swatchStyle(colors: string[] | undefined, direction?: MultiColorDirection): string {
	if (!colors || !colors.length) return 'background:#555';
	if (colors.length > 1) {
		const angle = direction === 'coaxial' ? '90deg' : direction === 'longitudinal' ? '0deg' : '135deg';
		// Each colour gets its own band, but boundaries are softened by a narrow
		// feather rather than a hard edge or a full-slot blur: colour i stays solid
		// across most of [i*step, (i+1)*step] and only fades over `feather`% on each
		// side of a boundary, leaving a ~2*feather blend zone between neighbours.
		const step = 100 / colors.length;
		const feather = Math.min(7, step / 2.2);
		const pct = (v: number) => v.toFixed(3);
		const stops = colors
			.map((c, i) => {
				const start = i === 0 ? 0 : i * step + feather;
				const end = i === colors.length - 1 ? 100 : (i + 1) * step - feather;
				return `${c} ${pct(start)}%,${c} ${pct(end)}%`;
			})
			.join(',');
		return `background:linear-gradient(${angle},${stops})`;
	}
	return `background:${colors[0]}`;
}

export function hue(h: string): number {
	const [r, g, b] = hexRgb(h).map((v) => v / 255);
	const mx = Math.max(r, g, b);
	const mn = Math.min(r, g, b);
	if (mx === mn) return 0;
	let hu: number;
	if (mx === r) hu = (g - b) / (mx - mn);
	else if (mx === g) hu = 2 + (b - r) / (mx - mn);
	else hu = 4 + (r - g) / (mx - mn);
	return (hu * 60 + 360) % 360;
}
