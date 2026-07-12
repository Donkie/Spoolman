<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, right }: { children: Snippet; right?: Snippet } = $props();
</script>

<div class="section" class:has-right={right}>
	<span class="label">{@render children()}</span>
	{#if right}<span class="right">{@render right()}</span>{/if}
</div>

<style>
	.section {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		padding: 16px 0 8px;
	}
	.section.has-right {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.right {
		text-transform: none;
		letter-spacing: 0;
	}
</style>
