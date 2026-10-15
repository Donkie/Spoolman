<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   The href comes from a src/lib/library/params.ts helper, which already resolves
	   against the deploy base path; resolving again would double-apply it. */
	import Swatch from '../Swatch.svelte';
	import MaterialBadge from '../MaterialBadge.svelte';
	import type { GroupSummary } from '$lib/api/types';
	import type { LibraryState } from '$lib/library/params';
	import * as params from '$lib/library/params';
	import { spoolPips } from '$lib/library/catalog';
	import { truncTitle } from '$lib/actions/truncated';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { weightAuto } from '$lib/utils/format';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';

	// One row of a catalog sub-view: a filament or a manufacturer. Both share the
	// anatomy — picture, a name line, one details line, a fixed stock column — so
	// nothing a user types or a translation spells out can widen the list: every
	// text truncates in place.
	interface Props {
		/** A filament or vendor group from the catalog query. */
		group: GroupSummary;
		libraryState: LibraryState;
		/** Flat filament list: no section header names the manufacturer, so the row does. */
		showVendor?: boolean;
	}
	let { group, libraryState, showVendor = false }: Props = $props();

	let kind = $derived<'filament' | 'vendor'>(group.field === 'vendor' ? 'vendor' : 'filament');
	let href = $derived(params.selectHrefFromState(libraryState, kind, group.key));
	let selected = $derived(params.isSelected(page.url.searchParams, kind, group.key));

	// The group carries the aggregates; the entity itself (upserted into the cache
	// by the same request) carries the fields the details line shows.
	let filament = $derived(kind === 'filament' ? inventory.filamentById(group.key) : undefined);
	let vendor = $derived(kind === 'vendor' ? inventory.vendorById(group.key) : undefined);

	let pips = $derived(spoolPips(group.previewSpools ?? [], settings.lowThreshold));

	// Up to four of a manufacturer's filaments, overlapping in a 24px square.
	const STACK_OFFSETS = [
		[0, 0],
		[10, 0],
		[0, 10],
		[10, 10]
	];
</script>

<a class="row" class:selected {href} data-sveltekit-keepfocus data-sveltekit-noscroll>
	<span class="id mono">#{group.key}</span>
	{#if kind === 'filament'}
		<Swatch colors={group.colors} direction={group.direction} size={24} radius={6} />
	{:else}
		<span class="stack" aria-hidden="true">
			{#each (group.previewFilaments ?? []).slice(0, 4) as f, i (f.id)}
				<span class="dot" style:left="{STACK_OFFSETS[i][0]}px" style:top="{STACK_OFFSETS[i][1]}px"
					><Swatch colors={f.colors} direction={f.direction} size={14} radius={4} /></span
				>
			{/each}
		</span>
	{/if}

	<span class="body">
		<span class="line">
			<!-- The name gives way first; the badge and the id stay whole. -->
			<span class="name" use:truncTitle>{group.title}</span>
			{#if group.badge}<MaterialBadge label={group.badge} />{/if}
		</span>
		<!-- Labels dim, values bright, one line ending in an ellipsis. -->
		<span class="details" use:truncTitle>
			{#if kind === 'filament'}
				{#if showVendor}
					<span class="it"
						><span class="v" class:unset={!group.vendorName}
							>{group.vendorName ?? m['library.catalog.noManufacturer']()}</span
						></span
					>
				{/if}
				{#if filament}
					<span class="it"><span class="v">{filament.diameter} mm</span></span>
					<span class="it"
						><span class="k">{m['library.sort.nozzle']()}</span>
						<span class="v" class:unset={!filament.nozzleTemp}
							>{filament.nozzleTemp ? `${filament.nozzleTemp} °C` : m['library.catalog.notSet']()}</span
						></span
					>
				{/if}
			{:else}
				<span class="it"
					><span class="v">{m['library.catalog.filamentCount']({ count: group.filamentCount ?? 0 })}</span
					></span
				>
				<!-- An empty spool weight of 0 g is no weight at all: the API's null maps to 0. -->
				<span class="it"
					><span class="k">{m['vendor.fields.emptySpoolWeight']()}</span>
					<span class="v" class:unset={!vendor?.emptyWeight}
						>{vendor?.emptyWeight ? weightAuto(vendor.emptyWeight) : m['library.catalog.notSet']()}</span
					></span
				>
			{/if}
		</span>
	</span>

	<span class="stock">
		{#if kind === 'filament' && group.spoolCount === 0}
			<span class="no-spools">{m['library.noSpools']()}</span>
		{:else}
			<span class="kg">{weightAuto(group.totalRemaining)}</span>
			{#if kind === 'filament'}
				<!-- One pip per spool, filled by what's left; past five the count carries
				     the rest. A spool of unknown size gets a plain grey pip. -->
				<span class="pips" title={m['library.groupSpools']({ count: group.spoolCount })}>
					{#each pips as p, i (i)}
						<span class="pip" class:low={p.low} class:unknown={p.fill === null} aria-hidden="true"
							><span class="fill" style:width="{(p.fill ?? 1) * 100}%"></span></span
						>
					{/each}
					<span class="count">{group.spoolCount}</span>
				</span>
			{:else}
				<span class="count">{m['library.groupSpools']({ count: group.spoolCount })}</span>
			{/if}
		{/if}
	</span>
</a>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 14px 9px 12px;
		border-top: 1px solid var(--hairline);
		border-left: 2px solid transparent;
		color: inherit;
		text-decoration: none;
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row.selected {
		background: var(--accent-wash);
		border-left-color: var(--accent);
	}
	.row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.stack {
		position: relative;
		flex: none;
		width: 24px;
		height: 24px;
	}
	/* A ring in the page colour cuts each swatch out of the one beneath it. */
	.dot {
		position: absolute;
		display: flex;
		border-radius: 4px;
		box-shadow: 0 0 0 1.5px var(--bg);
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 7px;
		min-width: 0;
	}
	.name {
		min-width: 0;
		font-weight: 600;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* Same id column as the spool rows. */
	.id {
		flex: none;
		width: 36px;
		font-size: 11px;
		color: var(--text-muted);
	}
	.details {
		display: block;
		margin-top: 3px;
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.it + .it::before {
		content: '·';
		margin: 0 6px;
		color: var(--text-faint);
	}
	.k {
		color: var(--text-faint);
	}
	.v {
		color: var(--text-2);
	}
	.v.unset {
		color: var(--text-faint);
		font-style: italic;
	}
	/* Fixed, so the column of weights lines up down the list whatever the rows say. */
	.stock {
		flex: none;
		width: 92px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
	}
	.kg {
		font-size: 12px;
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.pips {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.pip {
		width: 11px;
		height: 4px;
		border-radius: 2px;
		background: var(--track);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.pip.low .fill {
		background: var(--danger-soft);
	}
	.pip.unknown .fill {
		background: var(--text-faint);
	}
	.count {
		font-size: 11px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.pips .count {
		margin-left: 3px;
		font-size: 10px;
	}
	/* The unused-spool colours: a filament with nothing on the shelf is a
	   shopping-list entry, and a catalog holds many of them, so it stays calm. */
	.no-spools {
		font-size: 11px;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		background: var(--unused-bg);
		border: 1px solid var(--unused-border);
		color: var(--unused-text);
		white-space: nowrap;
	}

	@media (max-width: 860px) {
		.row {
			min-height: 56px;
		}
		.name {
			font-size: 14px;
		}
		.details {
			font-size: 11.5px;
		}
		.stock {
			width: 78px;
		}
		.kg {
			font-size: 12.5px;
		}
	}
</style>
