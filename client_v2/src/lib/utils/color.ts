// Color helpers ported from the prototype: turning a filament's color list into
// a swatch style, plus hue/distance math used for color search and sorting.

import type { MultiColorDirection } from '$lib/types';

/** Matches a 6- or 8-digit hex color code, with or without a leading '#'. */
const HEX_RE = /^#?([0-9a-fA-F]{6}([0-9a-fA-F]{2})?)$/;

/** Uppercase 6/8-digit hex body without the '#', or null if `h` isn't a complete color code. */
export function normalizeHex(h: string | undefined | null): string | null {
	const match = HEX_RE.exec((h ?? '').trim());
	return match ? match[1].toUpperCase() : null;
}

/**
 * Alpha byte (0-255) of a hex color. Codes without an alpha channel — and
 * anything unparseable — count as fully opaque, which is how the API treats a
 * 6-digit `color_hex`.
 */
export function alphaOf(h: string | undefined | null): number {
	const hex = normalizeHex(h);
	return hex && hex.length === 8 ? parseInt(hex.slice(6), 16) : 255;
}

/** True when at least one of the colors is translucent (alpha below FF). */
export function hasAlpha(colors: string[] | undefined): boolean {
	return !!colors?.some((c) => alphaOf(c) < 255);
}

/**
 * Replaces a color's alpha channel. The channel is dropped again at full
 * opacity so plain colors stay 6-digit, which is what the API and every
 * ecosystem consumer expect for an opaque filament.
 */
export function withAlpha(h: string, alpha: number): string {
	const hex = normalizeHex(h);
	if (!hex) return h;
	const a = Math.max(0, Math.min(255, Math.round(alpha)));
	const rgb = hex.slice(0, 6);
	return a >= 255 ? `#${rgb}` : `#${rgb}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * The checkerboard painted behind a translucent color, so "washed out" reads as
 * transparent instead of as a different color. Deliberately theme-independent
 * (the usual white/grey of every color picker) and composited over white, which
 * also previews how the filament looks against a printed label.
 *
 * Every layer is anchored to the border box. A `background` shorthand resets
 * `background-origin` to the padding box, so on a bordered element the layers
 * would be sized to the padding box but painted out under the border — and
 * since backgrounds repeat, the strip under the border shows the far edge of
 * the next tile. On a colour gradient that is a hairline of full-opacity colour
 * down the transparent end, visible wherever the border doesn't perfectly cover
 * it (Firefox at fractional display scaling).
 */
export const ALPHA_CHECKER =
	'conic-gradient(#cfcfcf 0 25%, #0000 0 50%, #cfcfcf 0 75%, #0000 0) 0 0/6px 6px border-box, #fff';

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
 *
 * Translucent colors are layered over a checkerboard so the alpha is visible.
 */
export function swatchStyle(colors: string[] | undefined, direction?: MultiColorDirection): string {
	if (!colors || !colors.length) return 'background:#555';
	// Painted underneath the color layer(s); the empty string keeps opaque
	// swatches on a plain single-layer background.
	const under = hasAlpha(colors) ? ',' + ALPHA_CHECKER : '';
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
		return `background:linear-gradient(${angle},${stops})${under}`;
	}
	// A single translucent color still needs to be a layer of its own so the
	// checkerboard can sit under it, hence the degenerate gradient.
	return under ? `background:linear-gradient(${colors[0]},${colors[0]})${under}` : `background:${colors[0]}`;
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
