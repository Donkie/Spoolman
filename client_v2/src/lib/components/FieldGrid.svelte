<script lang="ts">
	import type { Snippet } from 'svelte';

	// Two-column label/value grid used across the inspectors and extra-fields
	// section. Children are <Field> rows (which render a label cell + value cell
	// directly into this grid).
	let { labelWidth = '120px', children }: { labelWidth?: string; children: Snippet } = $props();
</script>

<div class="field-grid" style="--label-w:{labelWidth}">
	{@render children()}
</div>

<style>
	.field-grid {
		display: grid;
		grid-template-columns: var(--label-w) 1fr;
		font-size: 12.5px;
		row-gap: 9px;
		align-items: center;
	}
</style>
