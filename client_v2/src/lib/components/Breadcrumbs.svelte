<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	// Inspector breadcrumb trail. The last item is the current entity (rendered
	// static); earlier items with an `onclick` are navigable.
	export interface Crumb {
		label: string;
		onclick?: () => void;
	}
	let { items }: { items: Crumb[] } = $props();
</script>

<div class="crumbs">
	{#each items as c, i (i)}
		{#if i > 0}<span class="sep"><ChevronRight size={13} /></span>{/if}
		{#if c.onclick}
			<button class="crumb" onclick={c.onclick}>{c.label}</button>
		{:else}
			<span class="current">{c.label}</span>
		{/if}
	{/each}
</div>

<style>
	.crumbs {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px 0;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.crumb {
		color: var(--accent-link);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
	}
	.crumb:hover {
		color: var(--accent-link-hover);
	}
	.current {
		color: var(--text-2);
	}
</style>
