<script lang="ts">
	// Re-file a filament under a different manufacturer, keeping the filament itself —
	// its spools, its specs and its history — exactly as it is.
	//
	// The companion to ChangeFilamentModal one level up: that one re-points a spool at
	// another filament, this one re-points a filament at another manufacturer. Until
	// now the manufacturer was decided once, in the add-spool flow, and there was no
	// way back — a filament created under the wrong brand (or under none) stayed there,
	// and since the library groups by manufacturer that mis-files every spool of it.
	//
	// Unlike the filament picker there is no external catalog to search: SpoolmanDB
	// exposes filaments and materials, not manufacturers. So the choices are the local
	// list, a new manufacturer named on the spot (as the add-spool form allows), or
	// none at all — which the API supports and nothing in this client could reach.
	import Button from '../Button.svelte';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Ban from '@lucide/svelte/icons/ban';
	import type { Filament, Vendor } from '$lib/types';
	import { spoolSource } from '$lib/api/spoolSource';
	import { toasts } from '$lib/stores/toasts.svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		filament: Filament;
		/** The manufacturer it is filed under today; undefined when it has none. */
		current: Vendor | undefined;
		onclose: () => void;
	}
	let { open, filament, current, onclose }: Props = $props();

	type Choice =
		| { kind: 'vendor'; vendor: Vendor }
		/** A manufacturer that does not exist yet, created when the change is applied. */
		| { kind: 'new'; name: string }
		/** No manufacturer at all — the API clears the link on a null vendor_id. */
		| { kind: 'none' };

	let query = $state('');
	let searchInput = $state<HTMLInputElement | undefined>();
	let vendors = $state<Vendor[]>([]);
	let loading = $state(false);
	let chosen = $state<Choice | null>(null);
	let busy = $state(false);

	/** Two-letter monogram, as on the manufacturer's own detail view. */
	function initials(name: string): string {
		return name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	// The whole list is fetched on open and filtered here: manufacturers are few
	// (see spoolSource.listVendors) and there is no search endpoint for them, so a
	// keystroke costs nothing and never waits on the network.
	let trimmed = $derived(query.trim());
	let matches = $derived(
		trimmed ? vendors.filter((v) => v.name.toLowerCase().includes(trimmed.toLowerCase())) : vendors
	);
	/** A typed name that is nobody's yet — offer to create it, as the add-spool form does. */
	let canCreate = $derived(
		trimmed.length > 0 &&
			trimmed.length <= 64 &&
			!vendors.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())
	);

	// Reset on every open so a dialog reopened after a change doesn't come back still
	// holding the manufacturer that was just applied.
	let initialized = false;
	$effect(() => {
		if (open && !initialized) {
			initialized = true;
			query = '';
			chosen = null;
			busy = false;
			load();
		} else if (!open) {
			initialized = false;
		}
	});

	$effect(() => {
		if (open && searchInput) searchInput.focus();
	});

	async function load() {
		loading = true;
		try {
			vendors = await spoolSource.listVendors();
		} catch (e) {
			console.error('Failed to load manufacturers', e);
			vendors = [];
		}
		loading = false;
	}

	// --- empty spool weight -------------------------------------------------
	// The one field the two entities share: a filament with no tare weight of its own
	// uses its manufacturer's, and that is what `PUT /spool/{id}/measure` subtracts
	// from a reading off the scale. So for such a filament this change moves a number
	// that matters, silently — say so. A filament that has its own tare keeps it and
	// is unaffected, and its own field is right there in the inspector, so there is
	// nothing to decide and nothing to report.
	let nextEmpty = $derived(chosen?.kind === 'vendor' ? chosen.vendor.emptyWeight : 0);
	let currentEmpty = $derived(current?.emptyWeight ?? 0);
	let tareMoves = $derived(chosen != null && filament.spoolWeight == null && nextEmpty !== currentEmpty);

	function close() {
		if (!busy) onclose();
	}

	async function apply() {
		if (!chosen || busy) return;
		busy = true;
		try {
			let vendorId = '';
			if (chosen.kind === 'vendor') vendorId = chosen.vendor.id;
			else if (chosen.kind === 'new') {
				// Matches case-insensitively before creating, so two people naming the
				// same brand at once don't end up with two of it.
				const created = await spoolSource.getOrCreateVendor(chosen.name);
				vendorId = created == null ? '' : String(created);
			}
			await spoolSource.saveFilament(filament.id, { vendorId });
			toasts.success(m['changeVendor.done']());
			onclose();
		} catch (e) {
			console.error('Failed to change filament manufacturer', e);
			toasts.error(m['changeVendor.failed']());
			busy = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') close();
	}}
/>

{#snippet card(name: string, note: string, monogram: string | undefined)}
	<div class="ven">
		{#if monogram}
			<span class="avatar" aria-hidden="true">{monogram}</span>
		{:else}
			<span class="avatar none" aria-hidden="true"><Ban size={15} /></span>
		{/if}
		<div class="ven-name">
			<span class="vn">{name}</span>
			<span class="vs">{note}</span>
		</div>
	</div>
{/snippet}

{#if open}
	<div class="overlay">
		<!-- Click-outside catcher: a sibling of the dialog (not a parent) so it doesn't
		     nest interactive controls inside an interactive element. Keyboard close is
		     handled by the window Escape listener above. -->
		<button class="backdrop" tabindex="-1" aria-hidden="true" onclick={close}></button>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="change-vendor-title" tabindex="-1">
			<div class="modal-head">
				<span class="title" id="change-vendor-title">{m['changeVendor.title']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<div class="body">
				<p class="intro">{m['changeVendor.intro']({ name: filament.name })}</p>

				<div class="swap">
					<div class="side">
						<div class="side-label">{m['changeVendor.now']()}</div>
						{#if current}
							{@render card(
								current.name,
								current.emptyWeight
									? m['changeVendor.emptySpool']({ value: `${current.emptyWeight} g` })
									: m['changeVendor.noEmptySpool'](),
								initials(current.name)
							)}
						{:else}
							{@render card(m['add.noManufacturer'](), m['changeVendor.noneNote'](), undefined)}
						{/if}
					</div>
					<span class="arrow" aria-hidden="true"><ArrowRight size={16} /></span>
					<div class="side">
						<div class="side-label">{m['changeVendor.next']()}</div>
						{#if chosen?.kind === 'vendor'}
							{@render card(
								chosen.vendor.name,
								chosen.vendor.emptyWeight
									? m['changeVendor.emptySpool']({ value: `${chosen.vendor.emptyWeight} g` })
									: m['changeVendor.noEmptySpool'](),
								initials(chosen.vendor.name)
							)}
						{:else if chosen?.kind === 'new'}
							{@render card(chosen.name, m['changeVendor.willBeCreated'](), initials(chosen.name))}
						{:else if chosen?.kind === 'none'}
							{@render card(m['add.noManufacturer'](), m['changeVendor.noneNote'](), undefined)}
						{:else}
							<div class="ven empty">{m['changeVendor.pickBelow']()}</div>
						{/if}
					</div>
				</div>

				{#if tareMoves}
					<div class="note">
						{nextEmpty
							? m['changeVendor.tareFollows']({ value: `${nextEmpty} g` })
							: m['changeVendor.tareGone']({ current: `${currentEmpty} g` })}
					</div>
				{/if}

				<input
					bind:this={searchInput}
					class="search-big"
					bind:value={query}
					placeholder={m['changeVendor.searchPlaceholder']()}
					aria-label={m['changeVendor.searchPlaceholder']()}
					maxlength={64}
				/>
				<div class="results">
					{#if loading && vendors.length === 0}
						<div class="res-note">{m['add.searching']()}</div>
					{:else}
						{#each matches as v (v.id)}
							{@const isCurrent = v.id === current?.id}
							<button
								class="res-item"
								class:sel={chosen?.kind === 'vendor' && chosen.vendor.id === v.id}
								disabled={isCurrent}
								onclick={() => (chosen = { kind: 'vendor', vendor: v })}
							>
								<span class="avatar" aria-hidden="true">{initials(v.name)}</span>
								<div class="res-name">
									<span class="rn">{v.name}</span>
								</div>
								{#if v.emptyWeight}
									<span class="res-weight">{v.emptyWeight} g</span>
								{/if}
								{#if isCurrent}<span class="tag cur">{m['changeVendor.current']()}</span>{/if}
							</button>
						{/each}
						{#if matches.length === 0}
							<div class="res-note">
								{vendors.length ? m['changeVendor.noMatches']() : m['changeVendor.none']()}
							</div>
						{/if}
						<!-- The two rows that are not manufacturers you already have: name a new
						     one, or file this filament under none. Both stay at the bottom of the
						     list so the ordinary choice — one you already use — comes first. -->
						{#if canCreate}
							<button
								class="res-item"
								class:sel={chosen?.kind === 'new'}
								onclick={() => (chosen = { kind: 'new', name: trimmed })}
							>
								<span class="avatar add" aria-hidden="true"><Plus size={15} /></span>
								<div class="res-name">
									<span class="rn">{m['changeVendor.create']({ name: trimmed })}</span>
									<span class="rs">{m['changeVendor.createHint']()}</span>
								</div>
							</button>
						{/if}
						{#if current}
							<button
								class="res-item"
								class:sel={chosen?.kind === 'none'}
								onclick={() => (chosen = { kind: 'none' })}
							>
								<span class="avatar none" aria-hidden="true"><Ban size={15} /></span>
								<div class="res-name">
									<span class="rn">{m['add.noManufacturer']()}</span>
									<span class="rs">{m['changeVendor.clearHint']()}</span>
								</div>
							</button>
						{/if}
					{/if}
				</div>
			</div>

			<div class="foot">
				<Button variant="outline" disabled={busy} onclick={close}>{m['buttons.cancel']()}</Button>
				<Button disabled={!chosen || busy} onclick={apply}>
					{busy ? m['changeVendor.applying']() : m['changeVendor.apply']()}
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
		/* Line up with the manufacturer cards, not with the labels above them. */
		margin-top: 16px;
	}
	.ven {
		display: flex;
		align-items: center;
		gap: 9px;
		background: var(--surface-2);
		border: 1px solid var(--swatch-border);
		border-radius: var(--radius-md);
		padding: 8px 11px;
	}
	.ven.empty {
		border-style: dashed;
		background: none;
		color: var(--text-faint);
		font-size: 12px;
		/* Match the height of the populated card next to it (avatar + two lines). */
		min-height: 51px;
	}
	.ven-name {
		min-width: 0;
	}
	.vn {
		display: block;
		font-weight: 600;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.vs {
		display: block;
		font-size: 11.5px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* The monogram the manufacturer's own view uses, shrunk to row height so the
	   same brand is recognisable in both places. */
	.avatar {
		width: 26px;
		height: 26px;
		flex: none;
		border-radius: 7px;
		background: var(--surface-raised);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--text-2);
	}
	.avatar.none,
	.avatar.add {
		color: var(--text-dim);
		background: none;
		border: 1px dashed var(--border-strong);
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
		padding: 8px 14px;
		cursor: pointer;
		border: none;
		border-top: 1px solid var(--border-soft);
		background: none;
		color: inherit;
		width: 100%;
		text-align: left;
		font-family: inherit;
	}
	.res-item:first-child {
		border-top: none;
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
		display: block;
		color: var(--text-muted);
		font-size: 12px;
	}
	.res-weight {
		flex: none;
		white-space: nowrap;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
	}
	.tag {
		font-size: 10.5px;
		padding: 1px 7px;
		border-radius: 8px;
		flex: none;
		white-space: nowrap;
	}
	.tag.cur {
		border: 1px solid var(--border-strong);
		color: var(--text-dim);
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
