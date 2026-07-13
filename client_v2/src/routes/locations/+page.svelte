<script lang="ts">
	import Swatch from '$components/Swatch.svelte';
	import type { Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live } from '$lib/api/live';
	import { goto } from '$app/navigation';
	import { weightAuto } from '$lib/utils/format';
	import { _ } from 'svelte-i18n';

	let draggingId = $state<number | null>(null);
	let dragOver = $state<string | null>(null);

	let editingLocation = $state<string | null>(null);
	let editValue = $state('');
	let renameError = $state('');

	// Fetch every (non-archived) spool + the configured locations, kept live.
	let spools = $state<Spool[]>([]);
	let locations = $state<string[]>([]);
	let extraLocations = $state<string[]>([]); // locally-added, not yet used

	async function load() {
		try {
			const [page, locs] = await Promise.all([
				spoolSource.listSpools({
					filters: {},
					sort: [{ field: 'location', dir: 'asc' }],
					limit: 1000,
					offset: 0,
					lowThreshold: settings.lowThreshold
				}),
				spoolSource.locations()
			]);
			spools = page.items;
			locations = locs;
		} catch (e) {
			console.error('Failed to load locations', e);
		}
	}

	$effect(() => {
		load();
		const off = live.subscribe('spool', {}, () => load());
		return off;
	});

	let shelves = $derived.by(() => {
		const map = new Map<string, Spool[]>();
		for (const loc of [...locations, ...extraLocations]) map.set(loc, []);
		for (const s of spools) {
			const loc = s.location || 'No location';
			if (!map.has(loc)) map.set(loc, []);
			map.get(loc)!.push(s);
		}
		return [...map.entries()].map(([name, list]) => ({ name, spools: list }));
	});

	function onDrop(loc: string) {
		if (draggingId != null) {
			const target = loc === 'No location' ? '' : loc;
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
		const n = locations.length + extraLocations.length + 1;
		extraLocations = [...extraLocations, $_('locations.new_shelf', { values: { n } })];
	}

	function focusAndSelect(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

	function startEdit(loc: string) {
		if (loc === 'No location') return;
		editingLocation = loc;
		editValue = loc;
		renameError = '';
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
			renameError = $_('locations.error_empty');
			return;
		}
		if ([...locations, ...extraLocations].includes(newName)) {
			renameError = $_('locations.error_exists');
			return;
		}

		const hasSpools = spools.some((s) => (s.location || 'No location') === oldName);
		try {
			if (hasSpools) {
				await spoolSource.renameLocation(oldName, newName);
				spools = spools.map((s) => (s.location === oldName ? { ...s, location: newName } : s));
			}
			locations = locations.map((l) => (l === oldName ? newName : l));
			extraLocations = extraLocations.map((l) => (l === oldName ? newName : l));
			editingLocation = null;
			renameError = '';
		} catch (e) {
			renameError = e instanceof Error ? e.message : $_('locations.error_rename');
		}
	}
</script>

<svelte:head>
	<title>{$_('nav.locations')}{$_('documentTitle.suffix')}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="head">
		<span class="title">{$_('locations.locations')}</span>
		<span class="hint">{$_('locations.drag_hint')}</span>
		<button class="add" onclick={addLocation}>＋ {$_('locations.add_location')}</button>
	</div>

	<div class="grid">
		{#each shelves as shelf (shelf.name)}
			<div
				class="shelf"
				class:over={dragOver === shelf.name}
				role="list"
				ondragover={(e) => {
					e.preventDefault();
					dragOver = shelf.name;
				}}
				ondragleave={() => (dragOver === shelf.name ? (dragOver = null) : null)}
				ondrop={() => onDrop(shelf.name)}
			>
				<div class="shelf-head">
					<span class="grip">⠿</span>
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
							class:editable={shelf.name !== 'No location'}
							role="button"
							tabindex="0"
							onclick={() => startEdit(shelf.name)}
							onkeydown={(e) => e.key === 'Enter' && startEdit(shelf.name)}
						>
							{shelf.name === 'No location' ? $_('locations.no_location') : shelf.name}
						</span>
					{/if}
					<span class="shelf-meta"
						>{$_('locations.spool_count', { values: { count: shelf.spools.length } })}</span
					>
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
									>{' / '}{weightAuto(f.weight)}{#if s.lastUsedLabel}{' - '}{$_('locations.last_used', {
											values: { time: s.lastUsedLabel }
										})}{/if}
								</div>
							</div>
						</div>
					{/each}
					{#if shelf.spools.length === 0}
						<span class="empty">{$_('locations.drop_here')}</span>
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
	.shelf-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border-bottom: 1px solid #2f2f2f;
	}
	.grip {
		color: #555;
		font-size: 13px;
		cursor: grab;
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
		color: #555;
		padding: 6px 2px;
	}
</style>
