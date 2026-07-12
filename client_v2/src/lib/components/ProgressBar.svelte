<script lang="ts">
	interface Props {
		value: number; // 0-100
		width?: string;
		height?: number;
		danger?: boolean;
		gradient?: boolean;
	}

	let { value, width = '56px', height = 4, danger = false, gradient = false }: Props = $props();

	let fill = $derived(
		gradient
			? 'linear-gradient(90deg,#be682f,#d47a3b)'
			: danger
				? 'var(--danger)'
				: 'var(--accent)'
	);
</script>

<div class="track" style="width:{width};height:{height}px;border-radius:{height / 2}px">
	<div
		class="fill"
		style="width:{Math.max(0, Math.min(100, value))}%;border-radius:{height / 2}px;background:{fill}"
	></div>
</div>

<style>
	.track {
		background: #3a3a3a;
		flex: none;
		overflow: hidden;
	}
	.fill {
		height: 100%;
	}
</style>
