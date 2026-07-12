<script lang="ts">
	import type { Snippet } from 'svelte';

	// One label/value row inside a <FieldGrid>. Svelte components render without a
	// wrapper element, so the label and value below become direct grid cells.
	// `mono` renders the value in the monospace font.
	let { label, mono = false, children }: { label: string; mono?: boolean; children: Snippet } = $props();
</script>

<span class="k">{label}</span>
<div class="v" class:mono>{@render children()}</div>

<style>
	.k {
		color: var(--text-muted);
	}
	.v {
		min-width: 0;
	}
</style>
