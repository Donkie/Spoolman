<script lang="ts">
	import Swatch from '$components/Swatch.svelte';
	import type { Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live } from '$lib/api/live';
	import { goto } from '$app/navigation';
	import { weightAuto } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';
	import { getSettings, setSetting, parseSetting } from '$lib/api/settings';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const NO_LOCATION = 'No location';
	const FLIP = 160;

	// A location card. `id` is what svelte-dnd-action keys on; it equals `name`,
	// the location's display name (the NO_LOCATION sentinel for the unlocated
	// bucket). `spools` is the card's own drop zone, in display order.
	type Shelf = { id: string; name: string; spools: Spool[] };

	let editingLocation = $state<string | null>(null);
	let editValue = $state('');
	let renameError = $state('');

	// Fetch every (non-archived) spool plus the server-side ordered location
	// list, kept live. The `locations` setting is an ordered JSON array of names
	// that is the source of truth for both the display order and any location
	// added before it has spools. An empty string marks the position of the
	// "No location" bucket, so it can be reordered like any other card. See the
	// equivalent `useLocations` in the old client (which pins it first instead).
	const EMPTY = '';
	let spools = $state<Spool[]>([]);
	let settingOrder = $state<string[]>([]);
	let settingsLoaded = $state(false);
	let spoolsLoaded = $state(false);
	// Per-location custom spool order, keyed by the stored location name (EMPTY for
	// "No location"), each an array of spool ids. Source of truth for the order of
	// spools within a card. Shared with the old client's `locations_spoolorders`.
	let spoolOrders = $state<Record<string, number[]>>({});

	// The live drag state. `shelves` is the structure the drag zones bind to and
	// mutate directly; it is rebuilt from the data above whenever nothing is being
	// dragged. `dragging` pauses that rebuild so an in-flight drag isn't clobbered.
	// Shelf dragging is gated to the grip handle by keeping the grid zone disabled
	// until a grip press enables it (svelte-dnd-action's drag-handle pattern), so
	// it doesn't hijack pointer presses on the spool zones nested inside each card.
	let shelves = $state<Shelf[]>([]);
	let dragging = $state(false);
	let shelvesDragDisabled = $state(true);
	let displayNames = $derived(shelves.map((sh) => sh.name));
	// Nothing at all to show: no saved locations and no spools. Only decided once
	// both loads have settled, so the help text doesn't flash on the way in.
	let isEmpty = $derived(settingsLoaded && spoolsLoaded && shelves.length === 0);

	// Map between the display sentinel and the stored empty-string marker.
	const toStored = (names: string[]) => names.map((n) => (n === NO_LOCATION ? EMPTY : n));
	const storedKey = (name: string) => (name === NO_LOCATION ? EMPTY : name);

	async function loadSpools() {
		try {
			const page = await spoolSource.listSpools({
				filters: {},
				sort: [{ field: 'location', dir: 'asc' }],
				limit: 1000,
				offset: 0,
				lowThreshold: settings.lowThreshold
			});
			spools = page.items;
		} catch (e) {
			console.error('Failed to load spools', e);
		} finally {
			spoolsLoaded = true;
		}
	}

	async function loadLocationsSetting() {
		try {
			const s = await getSettings();
			settingOrder = parseSetting<string[]>(s.locations, []).filter((l) => l != null);
			spoolOrders = parseSetting<Record<string, number[]>>(s.locations_spoolorders, {});
		} catch (e) {
			console.error('Failed to load locations setting', e);
		} finally {
			settingsLoaded = true;
		}
	}

	function saveOrder(order: string[]) {
		settingOrder = order;
		setSetting('locations', order).catch((e) => console.error('Failed to save location order', e));
	}

	$effect(() => {
		loadSpools();
		loadLocationsSetting();
		const off = live.subscribe('spool', {}, () => loadSpools());
		return off;
	});

	// The full display order: the saved setting order (empty string → the
	// "No location" bucket), then any location discovered from spools that isn't
	// in the setting yet. The "No location" bucket only shows when unlocated
	// spools exist, and defaults to the front when the setting doesn't place it.
	function computeOrderedNames(present: Set<string>): string[] {
		const all: string[] = [];
		for (const l of settingOrder) {
			const name = l === EMPTY ? NO_LOCATION : l;
			if (!all.includes(name)) all.push(name);
		}
		if (present.has(NO_LOCATION) && !all.includes(NO_LOCATION)) all.unshift(NO_LOCATION);
		for (const name of present) if (name !== NO_LOCATION && !all.includes(name)) all.push(name);
		return all.filter((n) => n !== NO_LOCATION || present.has(NO_LOCATION));
	}

	// Sort a location's spools by its saved custom order; any spool not yet in the
	// order keeps its incoming (id-sorted) position at the end. Array.sort is
	// stable, so ties preserve that order.
	function orderSpools(name: string, list: Spool[]): Spool[] {
		const order = spoolOrders[storedKey(name)];
		if (!order?.length) return list;
		const rank = (id: number) => {
			const i = order.indexOf(id);
			return i === -1 ? Number.MAX_SAFE_INTEGER : i;
		};
		return [...list].sort((a, b) => rank(a.id) - rank(b.id));
	}

	function buildShelves(): Shelf[] {
		const byLoc = new Map<string, Spool[]>();
		for (const s of spools) {
			const name = s.location || NO_LOCATION;
			if (!byLoc.has(name)) byLoc.set(name, []);
			byLoc.get(name)!.push(s);
		}
		return computeOrderedNames(new Set(byLoc.keys())).map((name) => ({
			id: name,
			name,
			spools: orderSpools(name, byLoc.get(name) ?? [])
		}));
	}

	// Rebuild the displayed cards from the data whenever it changes, except while a
	// drag is in progress (the drag handlers own `shelves` then). Also keeps the
	// `locations` setting reflecting the displayed order so locations discovered
	// from spools are persisted; it settles once the setting matches.
	$effect(() => {
		if (!settingsLoaded || dragging) return;
		const desired = buildShelves();
		shelves = desired;
		const stored = toStored(desired.map((sh) => sh.name));
		if (JSON.stringify(stored) !== JSON.stringify(settingOrder)) saveOrder(stored);
	});

	function shelfConsider(e: CustomEvent<DndEvent<Shelf>>) {
		dragging = true;
		shelves = e.detail.items;
	}

	function shelfFinalize(e: CustomEvent<DndEvent<Shelf>>) {
		shelves = e.detail.items;
		dragging = false;
		shelvesDragDisabled = true;
		saveOrder(toStored(shelves.map((sh) => sh.name)));
	}

	function spoolConsider(idx: number, e: CustomEvent<DndEvent<Spool>>) {
		dragging = true;
		shelves[idx].spools = e.detail.items;
	}

	function spoolFinalize(idx: number, e: CustomEvent<DndEvent<Spool>>) {
		shelves[idx].spools = e.detail.items;
		dragging = false;
		commitSpoolLayout();
	}

	// Persist the outcome of a spool drag from the current card layout: move any
	// spool that now sits in a different card to that location, then save every
	// card's spool order. Diff-based, so the duplicate finalize fired on the other
	// zone of a cross-card move is a harmless no-op.
	function commitSpoolLayout() {
		const changed: { id: number; location: string }[] = [];
		const next = spools.map((sp) => {
			const shelf = shelves.find((sh) => sh.spools.some((x) => x.id === sp.id));
			if (!shelf) return sp;
			const loc = storedKey(shelf.name);
			if ((sp.location || '') === loc) return sp;
			changed.push({ id: sp.id, location: loc });
			return { ...sp, location: loc };
		});
		if (changed.length) {
			spools = next;
			for (const c of changed) {
				inventory.patchSpool(c.id, { location: c.location });
				spoolSource.saveSpool(c.id, { location: c.location }).catch((e) => console.error('Move failed', e));
			}
		}

		const nextOrders: Record<string, number[]> = { ...spoolOrders };
		for (const sh of shelves) nextOrders[storedKey(sh.name)] = sh.spools.map((s) => s.id);
		if (JSON.stringify(nextOrders) !== JSON.stringify(spoolOrders)) {
			spoolOrders = nextOrders;
			setSetting('locations_spoolorders', nextOrders).catch((e) =>
				console.error('Failed to save spool order', e)
			);
		}
	}

	function openSpool(id: number) {
		// Deep-link into the Library with this spool selected (its inspector open).
		goto('/?sel=spool:' + id);
	}

	function addLocation() {
		const existing = new Set(displayNames);
		let n = 1;
		let name = m['locations.newShelf']({ n });
		while (existing.has(name)) name = m['locations.newShelf']({ n: ++n });
		saveOrder([...settingOrder, name]);
	}

	function focusAndSelect(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

	function startEdit(loc: string) {
		if (loc === NO_LOCATION) return;
		editingLocation = loc;
		editValue = loc;
		renameError = '';
	}

	// Only empty, non-default locations can be removed (matches the old client).
	function deleteLocation(name: string) {
		saveOrder(settingOrder.filter((l) => l !== name));
	}

	function cancelEdit() {
		editingLocation = null;
		renameError = '';
	}

	async function commitEdit() {
		if (editingLocation === null) return;
		const oldName = editingLocation;
		const newName = editValue.trim();

		if (newName === oldName) {
			editingLocation = null;
			renameError = '';
			return;
		}
		if (!newName) {
			renameError = m['locations.errorEmpty']();
			return;
		}
		if (displayNames.includes(newName)) {
			renameError = m['locations.errorExists']();
			return;
		}

		const hasSpools = spools.some((s) => (s.location || NO_LOCATION) === oldName);
		try {
			if (hasSpools) {
				await spoolSource.renameLocation(oldName, newName);
				spools = spools.map((s) => (s.location === oldName ? { ...s, location: newName } : s));
			}
			// Carry the card's custom spool order over to the new name.
			if (spoolOrders[oldName]) {
				const { [oldName]: moved, ...rest } = spoolOrders;
				spoolOrders = { ...rest, [newName]: moved };
				setSetting('locations_spoolorders', spoolOrders).catch((e) =>
					console.error('Failed to save spool order', e)
				);
			}
			// Rename in place in the setting so the card keeps its position.
			saveOrder(settingOrder.map((l) => (l === oldName ? newName : l)));
			editingLocation = null;
			renameError = '';
		} catch (e) {
			renameError = e instanceof Error ? e.message : m['locations.errorRename']();
		}
	}
</script>

<svelte:window
	onpointerup={() => {
		if (!dragging) shelvesDragDisabled = true;
	}}
/>

<svelte:head>
	<title>{m['documentTitle.locations.list']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="head">
		<span class="title">{m['locations.locations']()}</span>
		{#if !isEmpty}<span class="hint">{m['locations.dragHint']()}</span>{/if}
		<button class="add" onclick={addLocation}><Plus size={14} /> {m['locations.newLocation']()}</button>
	</div>

	<div
		class="grid"
		use:dndzone={{
			items: shelves,
			type: 'shelf',
			flipDurationMs: FLIP,
			dragDisabled: shelvesDragDisabled,
			dropTargetStyle: {}
		}}
		onconsider={(e) => shelfConsider(e as CustomEvent<DndEvent<Shelf>>)}
		onfinalize={(e) => shelfFinalize(e as CustomEvent<DndEvent<Shelf>>)}
	>
		{#each shelves as shelf, idx (shelf.id)}
			<div class="shelf" role="list" animate:flip={{ duration: FLIP }}>
				<div class="shelf-head">
					<span
						class="grip"
						role="button"
						tabindex="-1"
						aria-label={m['locations.reorderLocation']()}
						onmousedown={() => (shelvesDragDisabled = false)}
						ontouchstart={() => (shelvesDragDisabled = false)}><GripVertical size={16} /></span
					>
					{#if editingLocation === shelf.name}
						<input
							class="shelf-name-input"
							value={editValue}
							use:focusAndSelect
							oninput={(e) => (editValue = (e.target as HTMLInputElement).value)}
							onblur={commitEdit}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									(e.target as HTMLInputElement).blur();
								} else if (e.key === 'Escape') {
									e.preventDefault();
									cancelEdit();
								}
							}}
						/>
					{:else}
						<span
							class="shelf-name"
							class:editable={shelf.name !== NO_LOCATION}
							role="button"
							tabindex="0"
							onclick={() => startEdit(shelf.name)}
							onkeydown={(e) => e.key === 'Enter' && startEdit(shelf.name)}
						>
							{shelf.name === NO_LOCATION ? m['locations.noLocation']() : shelf.name}
						</span>
					{/if}
					<span class="shelf-meta">{m['locations.spoolCount']({ count: shelf.spools.length })}</span>
					{#if shelf.name !== NO_LOCATION && shelf.spools.length === 0 && editingLocation !== shelf.name}
						<button
							class="shelf-delete"
							aria-label={m['locations.deleteLocation']()}
							title={m['locations.deleteLocation']()}
							onclick={() => deleteLocation(shelf.name)}
						>
							<Trash2 size={14} />
						</button>
					{/if}
				</div>
				{#if editingLocation === shelf.name && renameError}
					<div class="rename-error">{renameError}</div>
				{/if}
				<div class="shelf-body-wrap">
					<div
						class="shelf-body"
						use:dndzone={{ items: shelf.spools, type: 'spool', flipDurationMs: FLIP, dropTargetStyle: {} }}
						onconsider={(e) => spoolConsider(idx, e as CustomEvent<DndEvent<Spool>>)}
						onfinalize={(e) => spoolFinalize(idx, e as CustomEvent<DndEvent<Spool>>)}
					>
						{#each shelf.spools as s (s.id)}
							{@const f = inventory.filamentById(s.filamentId)!}
							{@const v = inventory.vendorOf(f)}
							<div
								class="chip"
								role="button"
								tabindex="0"
								animate:flip={{ duration: FLIP }}
								onclick={() => openSpool(s.id)}
								onkeydown={(e) => e.key === 'Enter' && openSpool(s.id)}
							>
								<Swatch colors={f.colors} size={22} radius={5} />
								<div class="chip-info">
									<div class="chip-title">
										<span class="chip-id mono">#{s.id}</span>
										{#if v.name !== '?'}{v.name}{' - '}{/if}{f.name}
									</div>
									<div class="chip-subtitle">
										{f.material}{' - '}<span class:low={settings.isLow(s.remaining, s.unused)}
											>{weightAuto(s.remaining)}</span
										>{' / '}{weightAuto(f.weight)}{#if s.lastUsedLabel}{' - '}{m['locations.lastUsed']({
												time: s.lastUsedLabel
											})}{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
					{#if shelf.spools.length === 0}
						<span class="empty">{m['locations.dropHere']()}</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if isEmpty}
		<p class="no-locations">{m['locations.noLocationsHelp']()}</p>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 20px 22px 40px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 16px;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.hint {
		font-size: 12px;
		color: var(--text-dim);
	}
	.add {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		border: 1px dashed var(--accent-border);
		color: var(--accent-link);
		border-radius: var(--radius);
		padding: 6px 12px;
		font-size: 12.5px;
		cursor: pointer;
		background: none;
		font-family: inherit;
	}
	.add:hover {
		border-color: var(--accent);
	}
	/* Centered when there are only a few shelves; wraps and fills the full width
	 * once enough shelves are present to need it. */
	.grid {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 14px;
		align-items: flex-start;
	}
	.shelf {
		flex: 1 1 300px;
		max-width: 380px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		min-height: 110px;
	}
	.shelf-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--border-soft);
	}
	.grip {
		color: var(--text-faint);
		font-size: 13px;
		cursor: grab;
		display: inline-flex;
		align-items: center;
		touch-action: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.shelf-name {
		flex: 1;
		font-weight: 600;
		font-size: 13px;
	}
	.shelf-name.editable {
		cursor: text;
		border-radius: 4px;
	}
	.shelf-name.editable:hover {
		background: var(--bg);
	}
	.shelf-name-input {
		flex: 1;
		font-weight: 600;
		font-size: 13px;
		font-family: inherit;
		color: inherit;
		background: var(--bg);
		border: 1px solid var(--accent-border);
		border-radius: 4px;
		padding: 1px 5px;
		min-width: 0;
	}
	.shelf-name-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.rename-error {
		font-size: 11px;
		color: var(--danger-soft);
		padding: 0 12px 8px;
	}
	.shelf-meta {
		font-size: 11px;
		color: var(--text-dim);
	}
	.shelf-delete {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		border: none;
		background: none;
		color: var(--text-faint);
		cursor: pointer;
		border-radius: 4px;
	}
	.shelf-delete:hover {
		color: var(--danger-soft);
		background: var(--bg);
	}
	/* Wraps the drop zone so the "drop here" hint can overlay an empty card
	 * without being a child of the zone (which maps its children 1:1 to items). */
	.shelf-body-wrap {
		position: relative;
		display: flex;
		flex: 1;
	}
	.shelf-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		flex: 1;
		min-height: 42px;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 9px;
		background: var(--bg);
		border: 1px solid var(--border-input);
		border-radius: 7px;
		padding: 6px 9px;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}
	.chip:hover {
		border-color: var(--accent);
	}
	.chip:active {
		cursor: grabbing;
	}
	.chip-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.chip-title {
		font-size: 12px;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip-id {
		font-size: 11px;
		color: var(--text-muted);
		margin-right: 2px;
	}
	.chip-subtitle {
		font-size: 10.5px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip-subtitle .low {
		color: var(--danger-soft);
	}
	.no-locations {
		margin: 18vh auto 0;
		max-width: 420px;
		text-align: center;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-dim);
	}
	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		padding: 6px 14px;
		font-size: 11.5px;
		color: var(--text-faint);
		pointer-events: none;
	}
</style>
