<script lang="ts">
	import GroupHeader from './GroupHeader.svelte';
	import SpoolRow from './SpoolRow.svelte';
	import UnusedRow from './UnusedRow.svelte';
	import type { Spool } from '$lib/types';
	import type { GroupSummary } from '$lib/api/types';
	import type { LibraryState } from '$lib/library/params';
	import * as params from '$lib/library/params';
	import { spoolToVM } from '$lib/utils/library';
	import { buildScopedSpoolQuery } from '$lib/api/query';
	import { spoolSource } from '$lib/api/spoolSource';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { kg } from '$lib/utils/format';

	interface Props {
		group: GroupSummary;
		/** Current Library state (sort/filters/search) for the scoped query. */
		libraryState: LibraryState;
		/** Bumped by the parent on live events to force a per-group refetch. */
		revision: number;
	}
	let { group, libraryState, revision }: Props = $props();

	const PAGE = 8;
	let limit = $state(PAGE);
	let spools = $state<Spool[]>([]);

	// The parent's keyed {#each} recreates this component when the group identity
	// changes, so `limit` naturally resets; persisting groups keep their window.

	let reqId = 0;
	$effect(() => {
		const q = buildScopedSpoolQuery(libraryState, group, limit);
		revision; // refetch on live events
		const mine = ++reqId;
		spoolSource.listSpools(q).then((page) => {
			if (mine === reqId) spools = page.items;
		});
	});

	let inUse = $derived(
		spools.filter((s) => !s.unused).map((s) => spoolToVM(s, inventory, settings.lowThreshold))
	);
	let unused = $derived(
		spools.filter((s) => s.unused).map((s) => spoolToVM(s, inventory, settings.lowThreshold))
	);
	let moreCount = $derived(group.spoolCount - spools.length);
	let showSwatch = $derived(group.field !== 'filament');

	let header = $derived({
		title: group.title,
		subtitle: group.subtitle,
		badge: group.badge,
		colors: group.colors,
		meta: kg(group.totalRemaining)
	});

	function headerClick() {
		if (group.field === 'filament') params.select('filament', group.key);
		else if (group.field === 'vendor') params.select('vendor', group.key);
	}
</script>

<div>
	<GroupHeader group={header} sticky onclick={headerClick} />
	{#each inUse as vm (vm.spool.id)}
		<SpoolRow {vm} {showSwatch} indent={26} />
	{/each}
	{#if unused.length}
		<UnusedRow {unused} {showSwatch} indent={26} />
	{/if}
	{#if moreCount > 0}
		<button class="more" onclick={() => (limit += 20)}>＋ show {moreCount} more</button>
	{/if}
</div>

<style>
	.more {
		display: block;
		width: 100%;
		text-align: left;
		padding: 7px 14px 7px 40px;
		border: none;
		border-top: 1px solid var(--hairline);
		background: none;
		color: var(--accent-link);
		font-size: 11.5px;
		cursor: pointer;
		font-family: inherit;
	}
	.more:hover {
		background: var(--surface-2);
	}
</style>
