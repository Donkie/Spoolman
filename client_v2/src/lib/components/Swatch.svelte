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
	.swatch {
		display: inline-block;
		flex: none;
	}
</style>
