// Color helpers ported from the prototype: turning a filament's color list into
// a swatch style, plus hue/distance math used for color search and sorting.

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
 * Returns an inline `background` (+ border for very dark solids) style string
 * for a swatch given one or more hex colors.
 */
export function swatchStyle(colors: string[] | undefined): string {
	if (!colors || !colors.length) return 'background:#555';
	if (colors.length > 1) return `background:linear-gradient(135deg,${colors.join(',')})`;
	const c = colors[0];
	const [r, g, b] = hexRgb(c);
	return `background:${c}${r + g + b < 200 ? ';border:1px solid #4a4a58' : ''}`;
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
