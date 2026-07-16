<script lang="ts">
	import ListToolbar from './ListToolbar.svelte';
	import GroupRow from './GroupRow.svelte';
	import SpoolRow from './SpoolRow.svelte';
	import Pagination from '../Pagination.svelte';
	import type { Spool } from '$lib/types';
	import type { GroupSummary } from '$lib/api/types';
	import type { LibraryState } from '$lib/library/params';
	import * as params from '$lib/library/params';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolToVM } from '$lib/utils/library';
	import { buildGroupQuery, buildFlatSpoolQuery, isGroupedMode } from '$lib/api/query';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live } from '$lib/api/live';
	import * as m from '$lib/paraglide/messages';

	// State comes from the URL via the page load (see routes/+page.ts). Changing
	// page/pageSize navigates through the params helpers. (Named libraryState, not
	// `state`, to avoid shadowing the $state rune.)
	let { libraryState }: { libraryState: LibraryState } = $props();

	// Two modes:
	//  - grouped: page of GROUP summaries (each GroupRow lazily loads its spools)
	//  - flat:    page of spools (group=none)
	let grouped = $derived(isGroupedMode(libraryState));
	let errored = $state(false);

	let groups = $state<GroupSummary[]>([]);
	let flatSpools = $state<Spool[]>([]);
	let total = $state(0);
	let loading = $state(false);
	/** Bumped by live events; forces refetch of the page and every GroupRow. */
	let revision = $state(0);

	let reqId = 0;
	$effect(() => {
		const isGrouped = grouped;
		const gq = isGrouped ? buildGroupQuery(libraryState) : null;
		const sq = isGrouped ? null : buildFlatSpoolQuery(libraryState);
		revision; // refetch on live events
		const mine = ++reqId;
		loading = true;
		errored = false;
		const p = isGrouped ? spoolSource.listGroups(gq!) : spoolSource.listSpools(sq!);
		p.then((page) => {
			if (mine !== reqId) return;
			if (isGrouped) {
				groups = page.items as GroupSummary[];
				flatSpools = [];
			} else {
				flatSpools = page.items as Spool[];
				groups = [];
			}
			total = page.total;
			loading = false;
		}).catch((err) => {
			if (mine !== reqId) return;
			console.error('Failed to load spools', err);
			errored = true;
			loading = false;
		});
	});

	// The list fetches server-paged data outside the reactive cache, so it keeps
	// its own subscription: any change may reorder/relabel visible rows.
	$effect(() => {
		const offs = (['spool', 'filament', 'vendor'] as const).map((resource) =>
			live.subscribe(resource, {}, () => revision++)
		);
		return () => offs.forEach((off) => off());
	});

	let flatVMs = $derived(flatSpools.map((s) => spoolToVM(s, inventory, settings.lowThreshold)));
	let totalLabel = $derived(grouped ? m['library.unitGroups']() : m['library.unitSpools']());
</script>

<div class="list">
	<ListToolbar {libraryState} />
	<div class="groups scroll-y" class:loading>
		{#if grouped}
			{#each groups as group (group.field + ':' + group.key)}
				<GroupRow {group} {libraryState} {revision} />
			{/each}
		{:else}
			{#each flatVMs as vm (vm.spool.id)}
				<SpoolRow {vm} showSwatch indent={14} />
			{/each}
		{/if}

		{#if errored}
			<div class="empty">{m['library.apiError']()}</div>
		{:else if total === 0 && !loading}
			<div class="empty">{m['library.emptyFiltered']({ unit: totalLabel })}</div>
		{/if}
	</div>
	<Pagination
		page={libraryState.page}
		pageSize={libraryState.pageSize}
		{total}
		unit={totalLabel}
		onpage={(p) => params.setPage(p)}
		onpagesize={(s) => params.setPageSize(s)}
	/>
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}
	.groups {
		flex: 1;
		transition: opacity 0.1s;
	}
	.groups.loading {
		opacity: 0.6;
	}
	.empty {
		padding: 40px 14px;
		text-align: center;
		font-size: 12.5px;
		color: var(--text-dim);
	}
</style>
