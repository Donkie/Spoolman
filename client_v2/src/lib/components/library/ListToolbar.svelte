<script lang="ts">
	import * as params from '$lib/library/params';
	import type { GroupMode, LibraryState } from '$lib/library/params';
	import { sortDefs } from '$lib/utils/library';
	import { spoolSource } from '$lib/api/spoolSource';

	// Named libraryState, not `state`, to avoid shadowing the $state rune.
	let { libraryState }: { libraryState: LibraryState } = $props();

	type Menu = 'filter' | 'group' | 'sort' | null;
	let open = $state<Menu>(null);

	function toggle(m: Menu) {
		open = open === m ? null : m;
	}
	function close() {
		open = null;
	}

	// Filter categories the API can serve (options fetched lazily on open).
	const FILTER_CATEGORIES: { key: string; label: string; load: () => Promise<string[]> }[] = [
		{ key: 'material', label: 'Material', load: () => spoolSource.materials() },
		{ key: 'vendor', label: 'Vendor', load: () => spoolSource.vendorNames() },
		{ key: 'location', label: 'Location', load: () => spoolSource.locations() },
		{ key: 'lot', label: 'Lot №', load: () => spoolSource.lotNumbers() }
	];

	// Two-level filter menu: pick a property, then a value.
	let filterProp = $state<string | null>(null);
	let options = $state<string[]>([]);
	let optionsLoading = $state(false);

	async function openProp(key: string) {
		filterProp = key;
		options = [];
		optionsLoading = true;
		try {
			options = await FILTER_CATEGORIES.find((c) => c.key === key)!.load();
		} catch (err) {
			console.error('Failed to load filter options', err);
		} finally {
			optionsLoading = false;
		}
	}

	let sorts = $derived(sortDefs());
	let activeSort = $derived(sorts.find((s) => s.key === libraryState.sortKey) ?? sorts[0]);

	const groupOptions: { key: GroupMode; label: string }[] = [
		{ key: 'filament', label: 'Filament' },
		{ key: 'vendor', label: 'Vendor' },
		{ key: 'material', label: 'Material' },
		{ key: 'location', label: 'Location' },
		{ key: 'none', label: 'None (flat)' }
	];
	let groupLabel = $derived(groupOptions.find((g) => g.key === libraryState.group)?.label ?? 'Filament');

	function chipLabel(prop: string, value: string): string {
		const c = FILTER_CATEGORIES.find((x) => x.key === prop);
		return c ? `${c.label}: ${value}` : value;
	}

	// Sort options grouped by section for the sort dropdown.
	let sortSections = $derived(
		['Spool', 'Filament', 'Extra fields']
			.map((sec) => ({ name: sec, items: sorts.filter((s) => s.section === sec) }))
			.filter((s) => s.items.length)
	);
</script>

<svelte:window onclick={close} />

<div
	class="toolbar"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.stopPropagation()}
	role="toolbar"
	tabindex="-1"
>
	<button
		class="chip add-filter"
		onclick={() => {
			toggle('filter');
			filterProp = null;
		}}>＋ Filter</button
	>

	{#each libraryState.filters as f (f.prop + f.value)}
		<button class="chip active" onclick={() => params.removeFilter(f.prop, f.value)}>
			{chipLabel(f.prop, f.value)} <span class="x">✕</span>
		</button>
	{/each}

	<div class="spacer"></div>

	<button class="link-btn" onclick={() => toggle('group')}>Group: {groupLabel} ⌄</button>
	<button class="chip active sort" onclick={() => toggle('sort')}>
		Sort: {activeSort.label}
		{libraryState.sortAsc ? '↑' : '↓'}
	</button>

	{#if open === 'filter'}
		<div class="menu filter-menu">
			{#if !filterProp}
				<div class="menu-title">Filter by</div>
				{#each FILTER_CATEGORIES as c (c.key)}
					<button class="menu-item" onclick={() => openProp(c.key)}>
						<span class="mi-label">{c.label}</span>
						<span class="mi-meta">›</span>
					</button>
				{/each}
			{:else}
				{@const c = FILTER_CATEGORIES.find((x) => x.key === filterProp)}
				<button class="menu-title back" onclick={() => (filterProp = null)}>‹ {c?.label}</button>
				{#if optionsLoading}
					<div class="menu-item"><span class="mi-label">Loading…</span></div>
				{:else if options.length === 0}
					<div class="menu-item"><span class="mi-label mi-meta">No values</span></div>
				{:else}
					{#each options as opt (opt)}
						<button
							class="menu-item"
							onclick={() => {
								params.toggleFilter(filterProp!, opt);
								close();
							}}
						>
							<span class="mi-label">{opt}</span>
						</button>
					{/each}
				{/if}
			{/if}
		</div>
	{/if}

	{#if open === 'group'}
		<div class="menu group-menu">
			{#each groupOptions as g (g.key)}
				<button
					class="menu-item"
					class:sel={libraryState.group === g.key}
					onclick={() => {
						params.setGroup(g.key);
						close();
					}}
				>
					<span class="mi-label">{g.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if open === 'sort'}
		<div class="menu sort-menu">
			{#each sortSections as sec (sec.name)}
				<div class="menu-title">{sec.name}</div>
				{#each sec.items as it (it.key)}
					<button
						class="menu-item"
						class:sel={libraryState.sortKey === it.key}
						onclick={() => {
							params.setSortKey(it.key);
							close();
						}}
					>
						<span class="mi-label">{it.label}</span>
						{#if libraryState.sortKey === it.key}<span class="mi-dir">{libraryState.sortAsc ? '↑' : '↓'}</span
							>{/if}
						{#if it.unit}<span class="mi-meta">{it.unit}</span>{/if}
					</button>
				{/each}
			{/each}
		</div>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		gap: 6px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border-soft);
		align-items: center;
		position: relative;
		flex: none;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 9px;
		border-radius: var(--radius-sm);
		font-size: 11.5px;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		border: 1px solid transparent;
		background: none;
		color: inherit;
		font-family: inherit;
	}
	.add-filter {
		border: 1px dashed var(--border-strong);
		color: #9a9a9a;
		padding: 4px 10px;
	}
	.add-filter:hover {
		border-color: var(--accent);
		color: var(--accent-link);
	}
	.chip.active {
		background: var(--accent-wash);
		border: 1px solid var(--accent-border);
		color: var(--accent-soft);
	}
	.x {
		color: #8a6a4d;
	}
	.link-btn {
		font-size: 12px;
		color: var(--accent-soft);
		cursor: pointer;
		white-space: nowrap;
		padding: 4px 6px;
		background: none;
		border: none;
		font-family: inherit;
	}

	.menu {
		position: absolute;
		top: 44px;
		z-index: 30;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		overflow: hidden;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		min-width: 180px;
		max-height: 60vh;
		overflow-y: auto;
	}
	.filter-menu {
		left: 14px;
	}
	.group-menu {
		right: 120px;
		min-width: 150px;
	}
	.sort-menu {
		right: 14px;
		min-width: 220px;
	}
	.menu-title {
		padding: 7px 12px 3px;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		background: none;
		border: none;
		width: 100%;
		text-align: left;
	}
	.menu-title.back {
		cursor: pointer;
		color: var(--accent-soft);
		font-size: 12px;
		padding: 8px 12px;
		text-transform: none;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		font-size: 12.5px;
		cursor: pointer;
		color: var(--text-2);
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		font-family: inherit;
	}
	.menu-item:hover {
		background: #2c2c2c;
	}
	.menu-item.sel {
		color: var(--accent-soft);
		font-weight: 600;
	}
	.mi-label {
		flex: 1;
		white-space: nowrap;
	}
	.mi-meta {
		color: var(--text-faint);
		font-size: 11px;
	}
	.mi-dir {
		color: #8a6a4d;
		font-size: 11px;
	}

	@media (max-width: 860px) {
		.link-btn {
			display: none;
		}
	}
</style>
