<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Section links come from a src/lib/library/params.ts helper, which already
	   resolves against the deploy base path; resolving again would double-apply it. */
	import CatalogHeader from './CatalogHeader.svelte';
	import CatalogRow from './CatalogRow.svelte';
	import ListToolbar from './ListToolbar.svelte';
	import Pagination from '../Pagination.svelte';
	import Factory from '@lucide/svelte/icons/factory';
	import type { GroupSummary } from '$lib/api/types';
	import type { CatalogView, LibraryState } from '$lib/library/params';
	import * as params from '$lib/library/params';
	import { catalogSections } from '$lib/library/catalog';
	import { buildCatalogQuery, buildVendorTotalsQuery } from '$lib/api/query';
	import { spoolSource } from '$lib/api/spoolSource';
	import { isAbortError } from '$lib/api/http';
	import { live } from '$lib/api/live';
	import { weightAuto } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';

	// The filament and manufacturer catalogs (docs/design/filament-list): sub-views
	// of the Library that page the group endpoint the way FilamentList does, one
	// row per filament or manufacturer, spools or not.
	let { libraryState }: { libraryState: LibraryState } = $props();

	let view = $derived(libraryState.view as CatalogView);

	// What is on screen, swapped whole when a load lands. `sectioned` belongs to the
	// rows it was loaded with, not to the current URL: while a regrouped page is on
	// its way, the old rows keep the layout they arrived in.
	let groups = $state<GroupSummary[]>([]);
	let sectioned = $state(false);
	/** Section totals by manufacturer id, for the manufacturers on this page. */
	let vendorTotals = $state<Record<string, GroupSummary>>({});
	let total = $state<number>();
	let totalSpools = $state<number>();
	let totalRemaining = $state<number>();
	let loading = $state(false);
	let errored = $state(false);
	/** Bumped by live events; forces a refetch of the page. */
	let revision = $state(0);

	// One request chain at a time, aborted by the effect's cleanup when superseded,
	// exactly like FilamentList. The section totals need the page's manufacturer
	// ids, so they follow the page rather than racing it, and both land together.
	let reqId = 0;
	$effect(() => {
		const ctrl = new AbortController();
		const s = libraryState;
		const q = buildCatalogQuery(s, ctrl.signal);
		const withSections = s.view === 'filaments' && s.group === 'vendor';
		void revision; // refetch on live events
		const mine = ++reqId;
		loading = true;
		errored = false;
		(async () => {
			const page = await spoolSource.listGroups(q);
			const totals: Record<string, GroupSummary> = {};
			// The filaments with no manufacturer have no vendor group to total them.
			const ids = withSections
				? [...new Set(page.items.map((g) => g.vendorId).filter((id): id is string => !!id))]
				: [];
			// The totals only dress the section headers, so losing them costs the
			// headers their meta line, not the page its rows.
			if (ids.length) {
				try {
					const vendors = await spoolSource.listGroups(buildVendorTotalsQuery(s, ids, ctrl.signal));
					for (const v of vendors.items) totals[v.key] = v;
				} catch (err) {
					if (isAbortError(err, ctrl.signal)) throw err;
					console.error('Failed to load the manufacturer totals', err);
				}
			}
			if (mine !== reqId) return;
			groups = page.items;
			sectioned = withSections;
			vendorTotals = totals;
			total = page.total;
			totalSpools = page.totalSpools;
			totalRemaining = page.totalRemaining;
			loading = false;
		})().catch((err) => {
			if (mine !== reqId || isAbortError(err, ctrl.signal)) return;
			console.error('Failed to load the catalog', err);
			errored = true;
			loading = false;
		});
		return () => ctrl.abort();
	});

	// Live updates, coalesced with the same leading-edge throttle as FilamentList
	// (see the reasoning there): the first event refetches at once, a burst folds
	// into one catch-up refetch when the window ends.
	const COALESCE_MS = 300;
	let cooldown: ReturnType<typeof setTimeout> | undefined;
	let coalesced = false;
	function bumpRevision() {
		if (cooldown) {
			coalesced = true;
			return;
		}
		revision++;
		cooldown = setTimeout(() => {
			cooldown = undefined;
			if (coalesced) {
				coalesced = false;
				bumpRevision();
			}
		}, COALESCE_MS);
	}
	$effect(() => {
		const offs = (['spool', 'filament', 'vendor'] as const).map((resource) =>
			live.subscribe(resource, {}, bumpRevision)
		);
		return () => {
			offs.forEach((off) => off());
			if (cooldown) clearTimeout(cooldown);
			cooldown = undefined;
			coalesced = false;
		};
	});

	let sections = $derived(sectioned ? catalogSections(groups) : []);

	let unit = $derived(
		view === 'filaments' ? m['library.catalog.unitFilaments']() : m['library.catalog.unitManufacturers']()
	);
	function countLabel(count: number): string {
		return view === 'filaments'
			? m['library.catalog.filamentCount']({ count })
			: m['library.catalog.manufacturerCount']({ count });
	}

	// "11 filaments · 23 spools · 15.1 kg": the whole list, not the page. The two
	// totals come from response headers an older server doesn't send.
	let summary = $derived(
		total
			? [
					countLabel(total),
					totalSpools != null ? m['library.groupSpools']({ count: totalSpools }) : '',
					totalRemaining != null ? weightAuto(totalRemaining) : ''
				]
					.filter(Boolean)
					.join(' · ')
			: undefined
	);
</script>

<div class="list">
	<CatalogHeader {view} count={total} />
	<ListToolbar {libraryState} />
	<div class="rows scroll-y" class:loading>
		{#if sectioned}
			{#each sections as sec (sec.vendorId + ':' + sec.rows[0].key)}
				{@const totals = vendorTotals[sec.vendorId]}
				<!-- One box per section, so its sticky header lets go where the section ends. -->
				<div>
					<div class="section">
						{#if sec.vendorId}
							<a
								class="vendor"
								href={params.selectHrefFromState(libraryState, 'vendor', sec.vendorId)}
								title={m['library.openManufacturer']({ name: sec.vendorName ?? '' })}
								data-sveltekit-keepfocus
								data-sveltekit-noscroll
							>
								<Factory size={12} />
								<span class="vname">{sec.vendorName}</span>
							</a>
						{:else}
							<span class="vendor-none">{m['library.catalog.noManufacturer']()}</span>
						{/if}
						{#if totals}
							<span class="meta"
								>{countLabel(totals.filamentCount ?? 0)} · {weightAuto(totals.totalRemaining)}</span
							>
						{/if}
					</div>
					{#each sec.rows as group (group.key)}
						<CatalogRow {group} {libraryState} />
					{/each}
				</div>
			{/each}
		{:else}
			{#each groups as group (group.field + ':' + group.key)}
				<CatalogRow {group} {libraryState} showVendor={group.field === 'filament'} />
			{/each}
		{/if}

		{#if errored}
			<div class="empty">{m['library.apiError']()}</div>
		{:else if total === 0 && !loading}
			<div class="empty">
				{libraryState.filters.length ? m['library.emptyFiltered']({ unit }) : m['pagination.empty']({ unit })}
			</div>
		{/if}
	</div>
	<Pagination
		page={libraryState.page}
		pageSize={libraryState.pageSize}
		total={total ?? 0}
		{unit}
		{summary}
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
	.rows {
		flex: 1;
		transition: opacity 0.1s;
	}
	.rows.loading {
		opacity: 0.6;
	}
	/* The manufacturer section bar: sunken like a group header, and sticky so a
	   long run of filaments still says whose they are. */
	.section {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		padding: 7px 14px;
		background: var(--surface-sunken);
		border-top: 1px solid var(--border-soft);
		font-size: 11px;
		color: var(--text-faint);
	}
	/* The padding makes a ~28px tap target (over the 24px WCAG 2.2 floor) while the
	   matching negative margin keeps the bar as tight as it looks. */
	.vendor {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		padding: 7px;
		margin: -7px;
		border-radius: var(--radius-sm);
		/* --accent-soft, not --accent-link: it holds AA on the sunken surface in both
		   themes (see GroupHeader). */
		color: var(--accent-soft);
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
	}
	.vendor:hover {
		background: var(--surface-raised);
		color: var(--accent-link-hover);
	}
	.vendor:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.vname,
	.meta {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.vendor-none {
		font-size: 12px;
		font-style: italic;
	}
	.meta {
		margin-left: auto;
		flex: none;
		max-width: 60%;
	}
	.empty {
		padding: 40px 14px;
		text-align: center;
		font-size: 12.5px;
		color: var(--text-dim);
	}
</style>
