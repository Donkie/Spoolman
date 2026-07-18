<script lang="ts">
	import * as params from '$lib/library/params';
	import type { GroupMode, LibraryState } from '$lib/library/params';
	import { sortDefs, filamentLabel, type SortDef } from '$lib/utils/library';
	import { spoolSource } from '$lib/api/spoolSource';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { fields } from '$lib/stores/fields.svelte';
	import { FieldType, type FieldDef, type EntityType } from '$lib/api/fields';
	import * as m from '$lib/paraglide/messages';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Square from '@lucide/svelte/icons/square';
	import SquareCheck from '@lucide/svelte/icons/square-check';

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

	// Extra-field definitions (of all three entities) feed the sort and filter menus.
	$effect(() => {
		fields.ensure('spool');
		fields.ensure('filament');
		fields.ensure('vendor');
	});

	interface FilterOption {
		value: string;
		label: string;
	}
	interface FilterCategory {
		/** Filter prop: a fixed category name, or `extra.<key>` for a custom field. */
		key: string;
		label: () => string;
		load: () => Promise<FilterOption[]>;
	}

	const asOption = (v: string): FilterOption => ({ value: v, label: v });

	// Fixed categories the API can serve (options fetched lazily on open).
	const BASE_FILTERS: FilterCategory[] = [
		{
			key: 'filament',
			label: m['spool.fields.filament'],
			load: async () => spoolSource.filamentOptions()
		},
		{
			key: 'material',
			label: m['spool.fields.material'],
			load: async () => (await spoolSource.materials()).map(asOption)
		},
		{
			key: 'vendor',
			label: m['filament.fields.vendor'],
			load: async () => (await spoolSource.vendorNames()).map(asOption)
		},
		{
			key: 'location',
			label: m['spool.fields.location'],
			load: async () => (await spoolSource.locations()).map(asOption)
		},
		{
			key: 'lot',
			label: m['spool.fields.lotNr'],
			load: async () => (await spoolSource.lotNumbers()).map(asOption)
		}
	];

	// Extra fields we can offer a discrete option list for: text, choice and
	// boolean. (Numeric / range / datetime fields have no natural value picker, so
	// they're not offered as filters here.)
	const FILTERABLE_EXTRA_TYPES = [FieldType.text, FieldType.choice, FieldType.boolean];

	// A spool can be filtered by its own extra fields, its filament's, and its
	// vendor's. Each entity's fields carry the query-param prefix the backend wants
	// and an entity qualifier so equally-named fields stay distinguishable.
	const EXTRA_SCOPES: { entity: EntityType; prefix: string; qualifier: (() => string) | null }[] = [
		{ entity: 'spool', prefix: 'extra.', qualifier: null },
		{ entity: 'filament', prefix: 'filament.extra.', qualifier: m['library.section.filament'] },
		{ entity: 'vendor', prefix: 'filament.vendor.extra.', qualifier: m['library.section.vendor'] }
	];

	// Build the option list for one extra field. Boolean → yes/no; multi-choice →
	// its defined choices; text and single-choice → the distinct values actually in
	// use, fetched from the backend (mirrors how /material et al. work).
	async function loadExtraOptions(entity: EntityType, f: FieldDef): Promise<FilterOption[]> {
		if (f.field_type === FieldType.boolean) {
			return [
				{ value: 'true', label: m['settings.extraFields.booleanTrue']() },
				{ value: 'false', label: m['settings.extraFields.booleanFalse']() }
			];
		}
		if (f.field_type === FieldType.choice && f.multi_choice) {
			return (f.choices ?? []).map(asOption);
		}
		return (await spoolSource.extraFieldValues(entity, f.key)).map(asOption);
	}

	let extraFilters = $derived<FilterCategory[]>(
		EXTRA_SCOPES.flatMap(({ entity, prefix, qualifier }) =>
			fields
				.get(entity)
				.filter((f) => FILTERABLE_EXTRA_TYPES.includes(f.field_type))
				.map((f) => ({
					key: `${prefix}${f.key}`,
					label: () => (qualifier ? `${qualifier()} · ${f.name}` : f.name),
					load: () => loadExtraOptions(entity, f)
				}))
		)
	);
	let filterCategories = $derived([...BASE_FILTERS, ...extraFilters]);

	// Resolve a filter prop back to the extra-field entity + definition it came from.
	function extraFieldFor(prop: string): { entity: EntityType; def: FieldDef } | undefined {
		for (const { entity, prefix } of EXTRA_SCOPES) {
			if (prop.startsWith(prefix)) {
				const def = fields.get(entity).find((f) => f.key === prop.slice(prefix.length));
				return def ? { entity, def } : undefined;
			}
		}
		return undefined;
	}

	// Two-level filter menu: pick a property, then a value.
	let filterProp = $state<string | null>(null);
	let options = $state<FilterOption[]>([]);
	let optionsLoading = $state(false);

	async function openProp(key: string) {
		filterProp = key;
		options = [];
		optionsLoading = true;
		try {
			options = await filterCategories.find((c) => c.key === key)!.load();
		} catch (err) {
			console.error('Failed to load filter options', err);
		} finally {
			optionsLoading = false;
		}
	}

	let sorts = $derived(sortDefs(fields.get('spool')));
	let activeSort = $derived(sorts.find((s) => s.key === libraryState.sortKey) ?? sorts[0]);

	const groupOptions: { key: GroupMode; labelKey: () => string }[] = [
		{ key: 'filament', labelKey: m['spool.fields.filament'] },
		{ key: 'vendor', labelKey: m['filament.fields.vendor'] },
		{ key: 'material', labelKey: m['spool.fields.material'] },
		{ key: 'location', labelKey: m['spool.fields.location'] },
		{ key: 'none', labelKey: m['library.groupNone'] }
	];
	let groupLabel = $derived(
		groupOptions.find((g) => g.key === libraryState.group)?.labelKey() ?? m['spool.fields.filament']
	);

	function chipLabel(prop: string, value: string): string {
		const c = filterCategories.find((x) => x.key === prop);
		const label = c?.label() ?? prop;
		// Filament filters store the numeric id; show the filament's name instead.
		if (prop === 'filament') {
			const fil = inventory.filamentById(value);
			return `${label}: ${fil ? filamentLabel(fil, inventory.vendorOf(fil)) : '#' + value}`;
		}
		// Boolean extra fields store true/false but display Yes/No.
		const def = extraFieldFor(prop)?.def;
		if (def?.field_type === FieldType.boolean) {
			const yn =
				value === 'true' ? m['settings.extraFields.booleanTrue']() : m['settings.extraFields.booleanFalse']();
			return `${label}: ${yn}`;
		}
		if (!c) return value;
		return `${label}: ${value}`;
	}

	// Sort options grouped by section for the sort dropdown.
	const SORT_SECTIONS: { key: SortDef['section']; labelKey: () => string }[] = [
		{ key: 'spool', labelKey: m['library.section.spool'] },
		{ key: 'filament', labelKey: m['library.section.filament'] },
		{ key: 'vendor', labelKey: m['library.section.vendor'] },
		{ key: 'extra', labelKey: m['library.section.extra'] }
	];
	let sortSections = $derived(
		SORT_SECTIONS.map((sec) => ({ ...sec, items: sorts.filter((s) => s.section === sec.key) })).filter(
			(s) => s.items.length
		)
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
	<!-- Filters flow and wrap here; the Group/Sort cluster stays pinned top-right. -->
	<div class="filters">
		<button
			class="chip add-filter"
			onclick={() => {
				toggle('filter');
				filterProp = null;
			}}><Plus size={13} /> {m['buttons.filter']()}</button
		>

		{#each libraryState.filters as f (f.prop + f.value)}
			<button class="chip active" onclick={() => params.removeFilter(f.prop, f.value)}>
				{chipLabel(f.prop, f.value)} <span class="x"><X size={12} /></span>
			</button>
		{/each}

		<!-- Archived is a filter; when on it shows as a dismissible chip like the rest. -->
		{#if libraryState.showArchived}
			<button class="chip active" onclick={() => params.setShowArchived(false)}>
				{m['spool.fields.archived']()} <span class="x"><X size={12} /></span>
			</button>
		{/if}
	</div>

	<div class="controls">
		<button class="link-btn" onclick={() => toggle('group')}
			><span class="ctrl-label">{m['library.groupBy']()}: </span>{groupLabel} <ChevronDown size={13} /></button
		>
		<button class="chip active sort" onclick={() => toggle('sort')}>
			<span class="ctrl-label">{m['library.sortBy']()}: </span>{activeSort.labelKey()}
			{#if libraryState.sortAsc}<ArrowUp size={12} />{:else}<ArrowDown size={12} />{/if}
		</button>
	</div>

	{#if open === 'filter'}
		<div class="menu filter-menu">
			{#if !filterProp}
				<div class="menu-title">{m['library.filterBy']()}</div>
				{#each filterCategories as c (c.key)}
					<button class="menu-item" onclick={() => openProp(c.key)}>
						<span class="mi-label">{c.label()}</span>
						<span class="mi-meta"><ChevronRight size={14} /></span>
					</button>
				{/each}
				<div class="menu-sep"></div>
				<button
					class="menu-item"
					role="menuitemcheckbox"
					aria-checked={libraryState.showArchived}
					onclick={() => {
						params.setShowArchived(!libraryState.showArchived);
						close();
					}}
				>
					<span class="mi-check"
						>{#if libraryState.showArchived}<SquareCheck size={15} />{:else}<Square size={15} />{/if}</span
					>
					<span class="mi-label">{m['buttons.showArchived']()}</span>
				</button>
			{:else}
				{@const c = filterCategories.find((x) => x.key === filterProp)}
				<button class="menu-title back" onclick={() => (filterProp = null)}
					><ChevronLeft size={14} /> {c ? c.label() : ''}</button
				>
				{#if optionsLoading}
					<div class="menu-item"><span class="mi-label">{m.loading()}…</span></div>
				{:else if options.length === 0}
					<div class="menu-item"><span class="mi-label mi-meta">{m['library.noValues']()}</span></div>
				{:else}
					{#each options as opt (opt.value)}
						<button
							class="menu-item"
							onclick={() => {
								params.toggleFilter(filterProp!, opt.value);
								close();
							}}
						>
							<span class="mi-label">{opt.label}</span>
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
					<span class="mi-label">{g.labelKey()}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if open === 'sort'}
		<div class="menu sort-menu">
			{#each sortSections as sec (sec.key)}
				<div class="menu-title">{sec.labelKey()}</div>
				{#each sec.items as it (it.key)}
					<button
						class="menu-item"
						class:sel={libraryState.sortKey === it.key}
						onclick={() => {
							params.setSortKey(it.key);
							close();
						}}
					>
						<span class="mi-label">{it.labelKey()}</span>
						{#if libraryState.sortKey === it.key}<span class="mi-dir"
								>{#if libraryState.sortAsc}<ArrowUp size={12} />{:else}<ArrowDown size={12} />{/if}</span
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
		gap: 6px 10px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border-soft);
		/* Top-align so the Group/Sort cluster stays on the first row while filter
		   chips wrap onto additional rows below. */
		align-items: flex-start;
		position: relative;
		flex: none;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		/* Take the free space and wrap internally; min-width:0 lets it actually
		   shrink/wrap instead of shoving the controls onto a new row. */
		flex: 1 1 auto;
		min-width: 0;
	}
	.controls {
		display: flex;
		gap: 6px;
		align-items: center;
		flex: none;
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
		color: var(--text-muted);
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
	.menu-sep {
		height: 1px;
		background: var(--border-soft);
		margin: 4px 0;
	}
	.mi-check {
		flex: none;
		font-size: 12.5px;
		color: var(--text-dim);
		width: 15px;
	}
	.menu-item[aria-checked='true'] .mi-check {
		color: var(--accent-soft);
	}
	.x {
		color: var(--accent-muted);
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
		background: var(--surface-raised);
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
		color: var(--accent-muted);
		font-size: 11px;
	}

	@media (max-width: 860px) {
		/* Keep the Group/Sort controls available on mobile, but drop their
		   "Group by:"/"Sort by:" prefixes to save horizontal space, and anchor
		   both menus to the right edge so they stay aligned when the buttons
		   shrink. */
		.ctrl-label {
			display: none;
		}
		.group-menu {
			right: 14px;
			left: auto;
		}
	}
</style>
