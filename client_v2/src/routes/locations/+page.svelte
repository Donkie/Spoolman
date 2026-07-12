<script lang="ts">
	import Swatch from '$components/Swatch.svelte';
	import type { Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live } from '$lib/api/live';
	import { goto } from '$app/navigation';

	let draggingId = $state<number | null>(null);
	let dragOver = $state<string | null>(null);

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
		extraLocations = [...extraLocations, 'New shelf ' + (locations.length + extraLocations.length + 1)];
	}
</script>

<div class="page scroll-y">
	<div class="head">
		<span class="title">Locations</span>
		<span class="hint">Drag spools between shelves to reassign them</span>
		<button class="add" onclick={addLocation}>＋ Add location</button>
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
					<span class="shelf-name">{shelf.name}</span>
					<span class="shelf-meta">{shelf.spools.length} spool{shelf.spools.length === 1 ? '' : 's'}</span>
				</div>
				<div class="shelf-body">
					{#each shelf.spools as s (s.id)}
						{@const f = inventory.filamentById(s.filamentId)!}
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
							<Swatch colors={f.colors} size={14} radius={4} />
							<span class="chip-id mono">#{s.id}</span>
							<span class="chip-name">{f.name}</span>
							<span class="chip-rem mono" class:low={settings.isLow(s.remaining, s.unused)}
								>{s.remaining} g</span
							>
						</div>
					{/each}
					{#if shelf.spools.length === 0}
						<span class="empty">drop spools here</span>
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
	.shelf-meta {
		font-size: 11px;
		color: var(--text-dim);
	}
	.shelf-body {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 10px 12px;
		flex: 1;
		align-content: flex-start;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 7px;
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
	.chip-id {
		font-size: 11px;
		color: var(--text-muted);
	}
	.chip-name {
		font-size: 11.5px;
		color: var(--text-2);
		max-width: 150px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip-rem {
		font-size: 11px;
		color: var(--text-muted);
	}
	.chip-rem.low {
		color: var(--danger-soft);
	}
	.empty {
		font-size: 11.5px;
		color: #555;
		padding: 6px 2px;
	}
</style>
