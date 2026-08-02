<script lang="ts">
	import type { Snippet } from 'svelte';
	// `divided` draws a hairline between direct child rows (used for settings-style
	// cards). Off by default so Card stays a generic surface.
	let { divided = false, children }: { divided?: boolean; children: Snippet } = $props();
</script>

<div class="card" class:divided>{@render children()}</div>

<style>
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}
	.card.divided > :global(:not(:first-child)) {
		border-top: 1px solid var(--border-soft);
	}
</style>
