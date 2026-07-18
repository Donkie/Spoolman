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
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const NO_LOCATION = 'No location';

	let draggingId = $state<number | null>(null);
	let dragOver = $state<string | null>(null);
	let draggingShelf = $state<string | null>(null);

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

	// Map between the display sentinel and the stored empty-string marker.
	const toStored = (names: string[]) => names.map((n) => (n === NO_LOCATION ? EMPTY : n));

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
		}
	}

	async function loadLocationsSetting() {
		try {
			const s = await getSettings();
			settingOrder = parseSetting<string[]>(s.locations, []).filter((l) => l != null);
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

	let spoolsByLoc = $derived.by(() => {
		const map = new Map<string, Spool[]>();
		for (const s of spools) {
			const loc = s.location || NO_LOCATION;
			if (!map.has(loc)) map.set(loc, []);
			map.get(loc)!.push(s);
		}
		return map;
	});

	// The full display order: the saved setting order (empty string → the
	// "No location" bucket), then any location discovered from spools that isn't
	// in the setting yet. The "No location" bucket only shows when unlocated
	// spools exist, and defaults to the front when the setting doesn't place it.
	let orderedNames = $derived.by(() => {
		const all: string[] = [];
		for (const l of settingOrder) {
			const name = l === EMPTY ? NO_LOCATION : l;
			if (!all.includes(name)) all.push(name);
		}
		if (spoolsByLoc.has(NO_LOCATION) && !all.includes(NO_LOCATION)) all.unshift(NO_LOCATION);
		for (const l of spoolsByLoc.keys()) if (l !== NO_LOCATION && !all.includes(l)) all.push(l);
		return all.filter((n) => n !== NO_LOCATION || spoolsByLoc.has(NO_LOCATION));
	});

	let shelves = $derived(orderedNames.map((name) => ({ name, spools: spoolsByLoc.get(name) ?? [] })));

	// Keep the setting in sync so it always reflects the displayed order,
	// persisting locations discovered from spools. It settles after a reorder
	// (when setting == display order already, it's a no-op).
	$effect(() => {
		if (!settingsLoaded) return;
		const stored = toStored(orderedNames);
		if (JSON.stringify(stored) !== JSON.stringify(settingOrder)) {
			saveOrder(stored);
		}
	});

	function startShelfDrag(e: DragEvent, name: string) {
		draggingShelf = name;
		const shelfEl = (e.currentTarget as HTMLElement).closest('.shelf');
		if (shelfEl && e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			// Drag the whole card, not just the grip handle.
			e.dataTransfer.setDragImage(shelfEl, 20, 20);
		}
	}

	// Live-reorder when the held card enters another (matches the old client).
	// Fires on dragenter (once per card entered) rather than continuously on
	// dragover, so it settles instead of oscillating between adjacent cards.
	// `to` is taken from the pre-removal list so a rightward move lands *after*
	// the target (letting a card reach the last slot); a leftward move lands
	// before it. The "No location" bucket participates like any other card.
	function reorderShelves(target: string) {
		if (draggingShelf == null || draggingShelf === target) return;
		const list = [...orderedNames];
		const from = list.indexOf(draggingShelf);
		const to = list.indexOf(target);
		if (from < 0 || to < 0 || from === to) return;
		list.splice(from, 1);
		list.splice(to, 0, draggingShelf);
		settingOrder = toStored(list);
	}

	function endShelfDrag() {
		if (draggingShelf != null)
			setSetting('locations', settingOrder).catch((e) => console.error('Failed to save location order', e));
		draggingShelf = null;
		dragOver = null;
	}

	function onDrop(loc: string) {
		if (draggingId != null) {
			const target = loc === NO_LOCATION ? '' : loc;
			inventory.patchSpool(draggingId, { location: target });
			spools = spools.map((s) => (s.id === draggingId ? { ...s, location: target } : s));
			spoolSource.saveSpool(draggingId, { location: target }).catch((e) => console.error('Move failed', e));
		}
		draggingId = null;
		dragOver = null;
	}

	function openSpool(id: number) {
		// Deep-link into the Library with this spool selected (its inspector open).
		goto('/?sel=spool:' + id);
	}

	function addLocation() {
		const existing = new Set(orderedNames);
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
		if (orderedNames.includes(newName)) {
			renameError = m['locations.errorExists']();
			return;
		}

		const hasSpools = spools.some((s) => (s.location || NO_LOCATION) === oldName);
		try {
			if (hasSpools) {
				await spoolSource.renameLocation(oldName, newName);
				spools = spools.map((s) => (s.location === oldName ? { ...s, location: newName } : s));
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

<svelte:head>
	<title>{m['documentTitle.locations.list']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="head">
		<span class="title">{m['locations.locations']()}</span>
		<span class="hint">{m['locations.dragHint']()}</span>
		<button class="add" onclick={addLocation}><Plus size={14} /> {m['locations.addLocation']()}</button>
	</div>

	<div class="grid">
		{#each shelves as shelf (shelf.name)}
			<div
				class="shelf"
				class:over={dragOver === shelf.name}
				class:dragging={draggingShelf === shelf.name}
				role="list"
				ondragenter={(e) => {
					if (draggingShelf != null) {
						e.preventDefault();
						reorderShelves(shelf.name);
					}
				}}
				ondragover={(e) => {
					e.preventDefault();
					if (draggingShelf == null) dragOver = shelf.name;
				}}
				ondragleave={() => (draggingShelf == null && dragOver === shelf.name ? (dragOver = null) : null)}
				ondrop={() => (draggingShelf != null ? endShelfDrag() : onDrop(shelf.name))}
			>
				<div class="shelf-head">
					<span
						class="grip"
						role="button"
						tabindex="-1"
						aria-label={m['locations.reorderLocation']()}
						draggable="true"
						ondragstart={(e) => startShelfDrag(e, shelf.name)}
						ondragend={endShelfDrag}><GripVertical size={16} /></span
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
				<div class="shelf-body">
					{#each shelf.spools as s (s.id)}
						{@const f = inventory.filamentById(s.filamentId)!}
						{@const v = inventory.vendorOf(f)}
						<div
							class="chip"
							role="button"
							tabindex="0"
							draggable="true"
							ondragstart={() => (draggingId = s.id)}
							ondragend={() => (draggingId = null)}
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
					{#if shelf.spools.length === 0}
						<span class="empty">{m['locations.dropHere']()}</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
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
	.shelf.over {
		border-color: var(--accent);
	}
	.shelf.dragging {
		opacity: 0.5;
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
	.shelf-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		flex: 1;
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
	}
	.chip:hover {
		border-color: var(--accent);
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
	.empty {
		font-size: 11.5px;
		color: var(--text-faint);
		padding: 6px 2px;
	}
</style>
