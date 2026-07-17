<script lang="ts">
	import { swatchStyle } from '$lib/utils/color';

	interface Props {
		colors: string[] | undefined;
		size?: number;
		radius?: number;
		opacity?: number;
	}

	let { colors, size = 22, radius = 6, opacity = 1 }: Props = $props();
</script>

<span
	class="swatch"
	style="width:{size}px;height:{size}px;border-radius:{radius}px;opacity:{opacity};{swatchStyle(
		colors
	)}"
></span>

<style>
	/*
	 * Rendered as a glossy physical colour chip rather than a flat rectangle: a
	 * hairline highlight ring plus an outer dark ring give it definition on any
	 * surface, and the ::after sheen adds a diagonal gloss. The sheen fades to
	 * fully transparent through the middle so the true filament colour stays
	 * readable there — only the corners pick up highlight/shade.
	 */
	.swatch {
		position: relative;
		display: inline-block;
		flex: none;
		overflow: hidden;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.14),
			inset 0 -2px 3px rgba(0, 0, 0, 0.28),
			0 0 0 1px rgba(0, 0, 0, 0.25);
	}

	.swatch::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.22),
			rgba(255, 255, 255, 0.05) 28%,
			rgba(255, 255, 255, 0) 46%,
			rgba(0, 0, 0, 0.1)
		);
		pointer-events: none;
	}
</style>
