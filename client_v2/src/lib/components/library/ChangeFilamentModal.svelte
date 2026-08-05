<script lang="ts">
	// Re-point an existing spool at a different filament, keeping the spool itself —
	// its id, location, lot, dates and usage history — exactly where it is.
	//
	// This is the "my shelf slot #37 ran out and now holds something else" workflow
	// (issue #1010): people who organise physically by spool number can't afford to
	// delete and re-add, because that hands them a new id. The v1 client exposed it
	// as a plain filament dropdown on the spool edit form; here it gets its own
	// two-step dialog so the weight consequence can be spelled out before applying.
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import X from '@lucide/svelte/icons/x';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { Filament, Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { serverInfo } from '$lib/stores/serverInfo.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { externalColors, externalDirection, type ExternalFilament } from '$lib/api/external';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { weightAuto } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		spool: Spool;
		/** The filament the spool holds today, shown as the "from" side. */
		current: Filament;
		onclose: () => void;
	}
	let { open, spool, current, onclose }: Props = $props();

	// Same two sources as the add-spools flow: the local catalog, plus SpoolmanDB
	// entries which are imported into the catalog when the change is applied.
	type Choice = { source: 'catalog'; filament: Filament } | { source: 'external'; ext: ExternalFilament };

	let query = $state('');
	let searchInput = $state<HTMLInputElement | undefined>();
	let localResults = $state<Filament[]>([]);
	let externalResults = $state<ExternalFilament[]>([]);
	let searching = $state(false);
	let extError = $state(false);
	let chosen = $state<Choice | null>(null);
	let busy = $state(false);

	function cName(c: Choice) {
		return c.source === 'catalog' ? c.filament.name : c.ext.name;
	}
	function cVendor(c: Choice) {
		return c.source === 'catalog'
			? (inventory.vendorById(c.filament.vendorId)?.name ?? m['add.noManufacturer']())
			: c.ext.manufacturer;
	}
	function cMaterial(c: Choice) {
		return c.source === 'catalog' ? c.filament.material : c.ext.material;
	}
	function cColors(c: Choice) {
		return c.source === 'catalog' ? c.filament.colors : externalColors(c.ext);
	}
	function cDirection(c: Choice) {
		return c.source === 'catalog' ? c.filament.multiColorDirection : externalDirection(c.ext);
	}
	function cWeight(c: Choice) {
		return c.source === 'catalog' ? c.filament.weight : c.ext.weight;
	}
	function vendorName(f: Filament): string {
		return inventory.vendorById(f.vendorId)?.name ?? m['add.noManufacturer']();
	}

	let currentVendor = $derived(inventory.vendorById(current.vendorId)?.name ?? m['add.noManufacturer']());

	// --- search -------------------------------------------------------------
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearch(v: string) {
		query = v;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(runSearch, 250);
	}
	async function runSearch() {
		searching = true;
		extError = false;
		const [local, external] = await Promise.allSettled([
			spoolSource.searchFilaments(query.trim()),
			spoolSource.searchExternalFilaments(query.trim())
		]);
		localResults = local.status === 'fulfilled' ? local.value : [];
		if (external.status === 'fulfilled') externalResults = external.value;
		else {
			externalResults = [];
			extError = true;
		}
		searching = false;
	}

	// Reset on every open so a dialog reopened after a change doesn't come back
	// still holding the filament that was just applied.
	let initialized = false;
	$effect(() => {
		if (open && !initialized) {
			initialized = true;
			query = '';
			chosen = null;
			adoptWeight = true;
			busy = false;
			runSearch();
		} else if (!open) {
			initialized = false;
		}
	});

	$effect(() => {
		if (open && searchInput) searchInput.focus();
	});

	// --- full weight --------------------------------------------------------
	// Whichever filament it holds, the spool keeps its used weight — swapping the
	// filament is a correction of what's on the spool, not a fresh roll. What the
	// remaining weight then works out to depends on the spool's *full* weight, and
	// that is where the two entities disagree:
	//
	//  - A spool with no full weight of its own follows its filament, so the change
	//    moves it on its own (spoolman/database/spool.py update() fills it in from
	//    the new filament). Nothing to decide — just say what will happen.
	//  - A spool that recorded its own full weight (every spool the API creates from
	//    a filament that has one) would otherwise keep the *old* filament's figure
	//    forever, with no field in this client to correct it. So when the new
	//    filament's weight differs, offer to take it — checked, because a spool
	//    holding filament X almost always holds X's amount of it.
	let newWeight = $derived(chosen ? (cWeight(chosen) ?? 0) : 0);
	/** The spool follows its filament's weight and will be moved by the change itself. */
	let weightFollows = $derived(
		chosen != null && spool.initialOverride == null && newWeight !== spool.initial
	);
	/** The spool has a weight of its own that the change would leave stale. */
	let weightDiffers = $derived(
		chosen != null && spool.initialOverride != null && newWeight > 0 && newWeight !== spool.initial
	);
	let adoptWeight = $state(true);
	let resultingFull = $derived(weightFollows || (weightDiffers && adoptWeight) ? newWeight : spool.initial);

	function close() {
		if (!busy) onclose();
	}

	async function apply() {
		if (!chosen || busy) return;
		busy = true;
		try {
			const filamentId =
				chosen.source === 'external'
					? (await spoolSource.importExternalFilament(chosen.ext)).id
					: chosen.filament.id;
			await spoolSource.saveSpool(spool.id, {
				filamentId,
				...(weightDiffers && adoptWeight ? { initial: newWeight } : {})
			});
			toasts.success(m['changeFilament.done']());
			onclose();
		} catch (e) {
			console.error('Failed to change spool filament', e);
			toasts.error(m['changeFilament.failed']());
			busy = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') close();
	}}
/>

{#if open}
	<div class="overlay">
		<!-- Click-outside catcher: a sibling of the dialog (not a parent) so it doesn't
		     nest interactive controls inside an interactive element. Keyboard close is
		     handled by the window Escape listener above. -->
		<button class="backdrop" tabindex="-1" aria-hidden="true" onclick={close}></button>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="change-filament-title" tabindex="-1">
			<div class="modal-head">
				<span class="title" id="change-filament-title">{m['changeFilament.title']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<div class="body">
				<p class="intro">{m['changeFilament.intro']({ id: spool.id })}</p>

				<div class="swap">
					<div class="side">
						<div class="side-label">{m['changeFilament.now']()}</div>
						<div class="fil">
							<Swatch colors={current.colors} direction={current.multiColorDirection} size={18} radius={5} />
							<div class="fil-name">
								<span class="fn">{current.name}</span>
								<span class="fs">{currentVendor} · {current.material}</span>
							</div>
						</div>
					</div>
					<span class="arrow" aria-hidden="true"><ArrowRight size={16} /></span>
					<div class="side">
						<div class="side-label">{m['changeFilament.next']()}</div>
						{#if chosen}
							<div class="fil">
								<Swatch colors={cColors(chosen)} direction={cDirection(chosen)} size={18} radius={5} />
								<div class="fil-name">
									<span class="fn">
										{cName(chosen)}
										{#if chosen.source === 'external'}<span class="tag external sm"
												>{serverInfo.externalDbName}</span
											>{/if}
									</span>
									<span class="fs">{cVendor(chosen)} · {cMaterial(chosen)}</span>
								</div>
							</div>
						{:else}
							<div class="fil empty">{m['changeFilament.pickBelow']()}</div>
						{/if}
					</div>
				</div>

				{#if weightFollows}
					<div class="note">
						{m['changeFilament.weightFollows']({
							full: weightAuto(newWeight),
							used: weightAuto(spool.usedWeight),
							remaining: weightAuto(newWeight - spool.usedWeight)
						})}
					</div>
				{:else if weightDiffers}
					<label class="adopt">
						<input type="checkbox" bind:checked={adoptWeight} />
						<span>
							<span class="adopt-label"
								>{m['changeFilament.adoptWeight']({ full: weightAuto(newWeight) })}</span
							>
							<span class="adopt-help"
								>{m['changeFilament.adoptWeightHelp']({
									current: weightAuto(spool.initial),
									used: weightAuto(spool.usedWeight),
									remaining: weightAuto(resultingFull - spool.usedWeight)
								})}</span
							>
						</span>
					</label>
				{/if}
				{#if chosen?.source === 'external'}
					<div class="note">{m['changeFilament.importNote']()}</div>
				{/if}

				<input
					bind:this={searchInput}
					class="search-big"
					value={query}
					oninput={(e) => onSearch(e.currentTarget.value)}
					placeholder={m['add.searchPlaceholder']({ name: serverInfo.externalDbName })}
					aria-label={m['add.searchPlaceholder']({ name: serverInfo.externalDbName })}
				/>
				<div class="results">
					<div class="res-hdr">{m['add.yourCatalog']()}</div>
					{#if searching && localResults.length === 0}
						<div class="res-note">{m['add.searching']()}</div>
					{:else if localResults.length === 0}
						<div class="res-note">{m['add.noCatalog']()}</div>
					{:else}
						{#each localResults as f (f.id)}
							{@const isCurrent = f.id === current.id}
							<button
								class="res-item"
								class:sel={chosen?.source === 'catalog' && chosen.filament.id === f.id}
								disabled={isCurrent}
								onclick={() => (chosen = { source: 'catalog', filament: f })}
							>
								<Swatch colors={f.colors} direction={f.multiColorDirection} size={18} radius={5} />
								<div class="res-name">
									<span class="rn">{f.name}</span>
									<span class="rs">{vendorName(f)} · {f.material}</span>
								</div>
								{#if f.weight}
									<span class="res-weight">{weightAuto(f.weight)}</span>
								{/if}
								<span class="tag" class:in-catalog={!isCurrent} class:cur={isCurrent}
									>{isCurrent ? m['changeFilament.current']() : m['add.inCatalog']()}</span
								>
							</button>
						{/each}
					{/if}

					<div class="res-hdr"><span class="hdr-note">{serverInfo.externalDbName}</span></div>
					{#if extError}
						<div class="res-note">{m['add.dbUnavailable']({ name: serverInfo.externalDbName })}</div>
					{:else if searching && externalResults.length === 0}
						<div class="res-note">{m['add.searching']()}</div>
					{:else if externalResults.length === 0}
						<div class="res-note">
							{query.trim() ? m['add.typeToSearchMatches']() : m['add.typeToSearchAll']()}
						</div>
					{:else}
						{#each externalResults as ext (ext.id)}
							<button
								class="res-item"
								class:sel={chosen?.source === 'external' && chosen.ext.id === ext.id}
								onclick={() => (chosen = { source: 'external', ext })}
							>
								<Swatch
									colors={externalColors(ext)}
									direction={externalDirection(ext)}
									size={18}
									radius={5}
								/>
								<div class="res-name">
									<span class="rn">{ext.name}</span>
									<span class="rs">{ext.manufacturer} · {ext.material}</span>
								</div>
								{#if ext.weight}
									<span class="res-weight">{weightAuto(ext.weight)}</span>
								{/if}
								<span class="tag external">{serverInfo.externalDbName}</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			<div class="foot">
				<Button variant="outline" disabled={busy} onclick={close}>{m['buttons.cancel']()}</Button>
				<Button disabled={!chosen || busy} onclick={apply}>
					{busy ? m['changeFilament.applying']() : m['changeFilament.apply']()}
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		/* Above the inspector's own bottom sheet on mobile, same layer as the
		   other library dialogs. */
		z-index: 60;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 16px 16px;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		border: none;
		margin: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.modal {
		position: relative;
		z-index: 1;
		width: 560px;
		max-width: 100%;
		max-height: 84vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.modal-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 20px 0;
		flex: none;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.x {
		margin-left: auto;
		color: var(--text-dim);
		cursor: pointer;
		padding: 4px 8px;
		background: none;
		border: none;
		display: inline-flex;
	}
	.x:hover {
		color: var(--text);
	}
	.body {
		padding: 12px 20px 16px;
		overflow-y: auto;
	}
	.intro {
		margin: 0 0 12px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.swap {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.side {
		flex: 1;
		min-width: 0;
	}
	.side-label {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		margin-bottom: 4px;
	}
	.arrow {
		flex: none;
		color: var(--text-dim);
		/* Line up with the filament cards, not with the labels above them. */
		margin-top: 16px;
	}
	.fil {
		display: flex;
		align-items: center;
		gap: 9px;
		background: var(--surface-2);
		border: 1px solid var(--swatch-border);
		border-radius: var(--radius-md);
		padding: 8px 11px;
	}
	.fil.empty {
		border-style: dashed;
		background: none;
		color: var(--text-faint);
		font-size: 12px;
		/* Match the height of the populated card next to it (swatch + two lines). */
		min-height: 51px;
	}
	.fil-name {
		min-width: 0;
	}
	.fn {
		display: block;
		font-weight: 600;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.fs {
		display: block;
		font-size: 11.5px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.note {
		margin-top: 10px;
		padding: 8px 12px;
		border: 1px solid var(--unused-bg);
		background: var(--accent-wash-soft);
		border-radius: var(--radius);
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--accent-muted-2);
	}
	.adopt {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		margin-top: 10px;
		padding: 9px 12px;
		border: 1px solid var(--unused-bg);
		background: var(--accent-wash-soft);
		border-radius: var(--radius);
		cursor: pointer;
	}
	.adopt input {
		/* Nudge onto the label's first line rather than the box's top edge. */
		margin: 1px 0 0;
		flex: none;
		accent-color: var(--accent);
	}
	.adopt-label {
		display: block;
		font-size: 12px;
		color: var(--accent-muted-2);
	}
	.adopt-help {
		display: block;
		margin-top: 3px;
		font-size: 11px;
		line-height: 1.45;
		color: var(--text-faint);
	}
	.search-big {
		width: 100%;
		margin-top: 14px;
		background: var(--input-bg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		padding: 10px 13px;
		font-size: 13.5px;
		color: var(--text);
	}
	.results {
		margin-top: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		overflow: hidden;
		max-height: 34vh;
		overflow-y: auto;
	}
	.res-hdr {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 7px 14px;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		background: var(--surface);
		border-top: 1px solid var(--border);
		position: sticky;
		top: 0;
		/* Sit above scrolling rows: their swatches are position:relative, so
		   without this the header's opaque background hides the row text but the
		   positioned swatch still paints on top of the sticky header. */
		z-index: 1;
	}
	.hdr-note {
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-faint);
	}
	.res-note {
		padding: 10px 14px;
		font-size: 12px;
		color: var(--text-dim);
		border-top: 1px solid var(--border-soft);
	}
	.res-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		cursor: pointer;
		border: none;
		border-top: 1px solid var(--border-soft);
		background: none;
		color: inherit;
		width: 100%;
		text-align: left;
		font-family: inherit;
	}
	.res-item:hover:not(:disabled) {
		background: var(--surface-raised);
	}
	.res-item:disabled {
		cursor: default;
		opacity: 0.55;
	}
	.res-item.sel {
		background: var(--accent-wash);
	}
	.res-name {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rn {
		font-weight: 600;
	}
	.rs {
		color: var(--text-muted);
		font-size: 12px;
	}
	.res-weight {
		flex: none;
		white-space: nowrap;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.tag {
		font-size: 10.5px;
		padding: 1px 7px;
		border-radius: 8px;
		flex: none;
		white-space: nowrap;
	}
	.tag.in-catalog {
		background: var(--surface-raised);
		color: var(--text-2);
	}
	.tag.cur {
		border: 1px solid var(--border-strong);
		color: var(--text-dim);
	}
	.tag.external {
		background: var(--accent-wash);
		border: 1px solid var(--accent-border);
		color: var(--accent-soft);
	}
	.tag.sm {
		margin-left: 6px;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px 16px;
		border-top: 1px solid var(--border-soft);
		flex: none;
	}

	/* The from → to pair needs both cards at a readable width; stack it once the
	   dialog gets narrow (mobile) rather than truncating both names to nothing. */
	@media (max-width: 520px) {
		.swap {
			flex-direction: column;
			align-items: stretch;
			gap: 8px;
		}
		.arrow {
			display: none;
		}
	}
</style>
