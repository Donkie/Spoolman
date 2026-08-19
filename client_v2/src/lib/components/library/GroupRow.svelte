<script lang="ts">
	import { tick, untrack } from 'svelte';
	import GroupHeader from './GroupHeader.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import SpoolRow from './SpoolRow.svelte';
	import UnusedRow from './UnusedRow.svelte';
	import type { Spool } from '$lib/types';
	import type { GroupSummary } from '$lib/api/types';
	import type { LibraryState } from '$lib/library/params';
	import * as params from '$lib/library/params';
	import { groupUnusedByFilament, spoolToVM } from '$lib/utils/library';
	import { buildScopedSpoolQuery } from '$lib/api/query';
	import { spoolSource } from '$lib/api/spoolSource';
	import { isAbortError } from '$lib/api/http';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { collapsedGroups, groupId } from '$lib/stores/collapsedGroups.svelte';
	import { weightAuto } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		group: GroupSummary;
		/** Current Library state (sort/filters/search) for the scoped query. */
		libraryState: LibraryState;
		/** Bumped by the parent on live events to force a per-group refetch. */
		revision: number;
	}
	let { group, libraryState, revision }: Props = $props();

	const PAGE = 8;
	const MORE = 20;
	let spools = $state<Spool[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);

	// The spool list can be folded away behind its header, per group and remembered
	// across visits (see stores/collapsedGroups).
	let id = $derived(groupId(group.field, group.key));
	let collapsed = $derived(collapsedGroups.has(id));

	// A filament the library holds no spools of, listed so that "I have none of
	// this" is visible rather than silently absent (#1092). There is nothing under
	// the header, so there is nothing to fetch, fold or page through either.
	let noSpools = $derived(group.spoolCount === 0);

	let el: HTMLDivElement | undefined = $state();

	async function toggle() {
		const collapsing = !collapsed;
		collapsedGroups.toggle(id);
		if (!collapsing) return;
		// Folding a long group away removes everything you were looking at, and the
		// browser then clamps the scroller to the shorter content — leaving you
		// somewhere else in the library entirely. Pull the group you just collapsed
		// back into view; `nearest` makes this a no-op when it never left.
		await tick();
		el?.scrollIntoView({ block: 'nearest' });
	}

	// The parent's keyed {#each} recreates this component when the group identity
	// changes, so the loaded window naturally resets; persisting groups keep it.

	// Base load: (re)fetch the group's first window from offset 0 whenever the
	// query inputs change — sort/filters/search (via libraryState), the group
	// identity, or a live-event `revision`. We refetch as many spools as are
	// already shown (`spools.length`, read untracked so appending in loadMore
	// doesn't re-trigger this effect), so a live update refreshes the whole
	// expanded window instead of collapsing it back to the first page.
	//
	// Every visible group runs one of these, so leaving them in flight after the
	// list has moved on is what makes rapid paging (or navigating away and back)
	// pile up queries on the server. The effect cleanup cancels this row's request
	// whenever it is superseded or the row goes away.
	//
	// A collapsed group doesn't fetch at all — that is most of the point of
	// collapsing one on a big library, since the group page's cost is one request
	// per visible group. Collapsing mid-flight aborts through the cleanup below;
	// expanding re-runs this effect and the rows arrive then. What was already
	// loaded is kept, so re-expanding paints immediately and refreshes behind it.
	let reqId = 0;
	$effect(() => {
		if (collapsed || noSpools) return;
		const ctrl = new AbortController();
		void revision; // refetch on live events
		const want = untrack(() => spools.length) || PAGE;
		const q = buildScopedSpoolQuery(libraryState, group, want, 0, ctrl.signal);
		const mine = ++reqId;
		loading = true;
		spoolSource
			.listSpools(q)
			.then((page) => {
				if (mine === reqId) spools = page.items;
			})
			.catch((e) => {
				if (!isAbortError(e, ctrl.signal)) console.error('Failed to load group spools', e);
			})
			.finally(() => {
				if (mine === reqId) loading = false;
			});
		return () => ctrl.abort();
	});

	// "Show more" pages in only the NEXT slice (offset = what we already have) and
	// appends it, so each click is a constant-size request rather than re-fetching
	// an ever-growing window from offset 0. Disabled while a base load is running so
	// its append can't race the replace; its own controller is aborted on unmount.
	let moreCtrl: AbortController | undefined;
	$effect(() => () => moreCtrl?.abort());

	async function loadMore() {
		if (loading || loadingMore) return;
		loadingMore = true;
		const ctrl = (moreCtrl = new AbortController());
		const mine = reqId;
		const q = buildScopedSpoolQuery(libraryState, group, MORE, spools.length, ctrl.signal);
		try {
			const page = await spoolSource.listSpools(q);
			// Drop the result if a base reload superseded us while we were waiting.
			if (mine === reqId) spools = [...spools, ...page.items];
		} catch (e) {
			if (!isAbortError(e, ctrl.signal)) console.error('Failed to load more group spools', e);
		} finally {
			loadingMore = false;
		}
	}

	let inUse = $derived(
		spools.filter((s) => !s.unused).map((s) => spoolToVM(s, inventory, settings.lowThreshold))
	);
	// One collapsed summary row per filament: the row speaks for its whole pile
	// ("Jade White ×6, 1000 g each"), which only holds within a single filament.
	let unusedByFilament = $derived(
		groupUnusedByFilament(
			spools.filter((s) => s.unused).map((s) => spoolToVM(s, inventory, settings.lowThreshold))
		)
	);
	let moreCount = $derived(group.spoolCount - spools.length);
	let showSwatch = $derived(group.field !== 'filament');

	let header = $derived({
		title: group.title,
		subtitle: group.subtitle,
		badge: group.badge,
		// Filament groups always name their manufacturer — as a link where there is
		// one to link to, and otherwise as a note that there isn't.
		vendorName: group.field === 'filament' ? (group.vendorName ?? m['add.noManufacturer']()) : undefined,
		colors: group.colors,
		direction: group.direction,
		meta: weightAuto(group.totalRemaining),
		count: m['library.groupSpools']({ count: group.spoolCount })
	});

	// A group header links to its entity's inspector only where the group *is* an
	// entity — filament and vendor. Material/location groups have nothing to open.
	let headerHref = $derived(
		group.field === 'filament'
			? params.selectHrefFromState(libraryState, 'filament', group.key)
			: group.field === 'vendor'
				? params.selectHrefFromState(libraryState, 'vendor', group.key)
				: undefined
	);

	// The second destination in a filament header: its manufacturer. This is the
	// only route to a vendor that doesn't go through a menu, the search box, or an
	// inspector you had to know to open first (#989).
	let vendorHref = $derived(
		group.field === 'filament' && group.vendorId
			? params.selectHrefFromState(libraryState, 'vendor', group.vendorId)
			: undefined
	);
</script>

<div bind:this={el}>
	<GroupHeader
		group={header}
		sticky
		href={headerHref}
		{vendorHref}
		{collapsed}
		{noSpools}
		ontoggle={toggle}
	/>
	{#if !collapsed && !noSpools}
		{#each inUse as vm (vm.spool.id)}
			<SpoolRow {vm} {showSwatch} indent={26} context={group.field} />
		{/each}
		{#each unusedByFilament as unused (unused[0].spool.id)}
			{#if unused.length === 1}
				<!-- A lone unused spool gains nothing from a collapsing header — it just
				     adds a click and a row — so render it inline like the used spools. -->
				<SpoolRow vm={unused[0]} {showSwatch} indent={26} context={group.field} />
			{:else}
				<UnusedRow {unused} {showSwatch} indent={26} context={group.field} />
			{/if}
		{/each}
		{#if moreCount > 0}
			<button class="more" onclick={loadMore} disabled={loading || loadingMore}
				><Plus size={13} /> {m['library.showMore']({ count: moreCount })}</button
			>
		{/if}
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
	.more:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.more:disabled:hover {
		background: none;
	}
</style>
