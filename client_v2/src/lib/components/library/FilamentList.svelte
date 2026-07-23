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
	import { isAbortError } from '$lib/api/http';
	import { live } from '$lib/api/live';
	import { ui } from '$lib/stores/ui.svelte';
	import Button from '../Button.svelte';
	import Plus from '@lucide/svelte/icons/plus';
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

	// One request at a time: the effect's cleanup aborts the previous one, so a
	// superseded query (paging, sorting, a live event) — or the whole page being
	// navigated away from — stops costing bandwidth and backend work instead of
	// merely having its result discarded.
	let reqId = 0;
	$effect(() => {
		const isGrouped = grouped;
		const ctrl = new AbortController();
		const gq = isGrouped ? buildGroupQuery(libraryState, ctrl.signal) : null;
		const sq = isGrouped ? null : buildFlatSpoolQuery(libraryState, ctrl.signal);
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
			if (mine !== reqId || isAbortError(err, ctrl.signal)) return;
			console.error('Failed to load spools', err);
			errored = true;
			loading = false;
		});
		return () => ctrl.abort();
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

	// An empty result with no active filters means the library is genuinely empty
	// (a fresh install), not that a filter excluded everything — so we nudge the
	// user to add their first spool rather than showing "nothing matches".
	let isEmptyLibrary = $derived(libraryState.filters.length === 0);
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
			{#if isEmptyLibrary}
				<div class="empty empty-cta">
					<p class="empty-title">{m['library.emptyTitle']()}</p>
					<p class="empty-body">{m['library.emptyBody']()}</p>
					<Button onclick={() => ui.openAddModal()}>
						<Plus size={15} />
						{m['topbar.addSpools']()}
					</Button>
				</div>
			{:else}
				<div class="empty">{m['library.emptyFiltered']({ unit: totalLabel })}</div>
			{/if}
		{/if}
	</div>
	<Pagination
		page={libraryState.page}
		pageSize={libraryState.pageSize}
		{total}
		unit={totalLabel}
		onpage={(p) => params.setPage(p)}
		onpagesize={(s) => params.setPageSize(s)}
		hrefFor={(p) => params.pageHrefFromState(libraryState, p)}
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
	.empty-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding-top: 56px;
	}
	.empty-title {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--text-2);
	}
	.empty-body {
		margin: 0 0 8px;
		max-width: 280px;
		font-size: 12.5px;
		color: var(--text-dim);
	}
</style>
