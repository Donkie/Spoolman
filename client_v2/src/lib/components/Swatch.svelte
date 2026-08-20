<script lang="ts">
	import { swatchStyle } from '$lib/utils/color';
	import type { MultiColorDirection } from '$lib/types';

	interface Props {
		colors: string[] | undefined;
		/** Multi-color layout; angles the gradient (coaxial/longitudinal). */
		direction?: MultiColorDirection;
		size?: number;
		radius?: number;
		opacity?: number;
	}

	let { colors, direction, size = 22, radius = 6, opacity = 1 }: Props = $props();
</script>

<span
	class="swatch"
	style="width:{size}px;height:{size}px;border-radius:{radius}px;opacity:{opacity};{swatchStyle(
		colors,
		direction
	)}"
></span>

<style>
	/*
	 * A flat colour chip with a crisp border rather than a glossy 3D one. Two
	 * hairline rings, no directional shading or sheen: an outer dark ring defines
	 * the edge against light backgrounds, and a faint inner light ring defines it
	 * against dark ones (where the outer ring vanishes). Both are non-directional
	 * so the chip reads as a clean swatch that matches the rest of the UI.
	 */
	.swatch {
		position: relative;
		display: inline-block;
		flex: none;
		overflow: hidden;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.1),
			0 0 0 1px rgba(0, 0, 0, 0.22);
	}
</style>
