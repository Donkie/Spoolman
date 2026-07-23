<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	// Inspector breadcrumb trail. The last item is the current entity (rendered
	// static); earlier items with an `href` are navigable links. A `muted` crumb
	// stands in for a level that doesn't exist (e.g. a filament with no
	// manufacturer) — there's nothing to navigate to, so it reads as a note.
	export interface Crumb {
		label: string;
		href?: string;
		muted?: boolean;
	}
	let { items }: { items: Crumb[] } = $props();
</script>

<div class="crumbs">
	{#each items as c, i (i)}
		{#if i > 0}<span class="sep"><ChevronRight size={13} /></span>{/if}
		{#if c.href}
			<a class="crumb" href={c.href} data-sveltekit-keepfocus data-sveltekit-noscroll>{c.label}</a>
		{:else if c.muted}
			<span class="muted">{c.label}</span>
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
		text-decoration: none;
	}
	.crumb:hover {
		color: var(--accent-link-hover);
	}
	.current {
		color: var(--text-2);
	}
	.muted {
		color: var(--text-dim);
		font-style: italic;
	}
</style>
