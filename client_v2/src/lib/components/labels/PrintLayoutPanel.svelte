<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$components/Button.svelte';
	import LabelCanvas from './LabelCanvas.svelte';
	import type { LabelDesign } from '$lib/labels/types';
	import type { LabelBinding } from '$lib/labels/template';
	import { PAPER_NAMES, sheetGrid } from '$lib/labels/paper';
	import { printLabels } from '$lib/labels/print';
	import { spoolSource } from '$lib/api/spoolSource';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import type { Spool } from '$lib/types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		design: LabelDesign;
		preselected?: number[];
	}
	let { design = $bindable(), preselected = [] }: Props = $props();

	// The print layout lives on the design itself, so edits here dirty the design
	// and are saved (and recalled) with it — different labels want different sheets.
	const layout = $derived(design.layout);

	let selected = $state<Set<number>>(new Set(untrack(() => preselected)));
	let search = $state('');
	let loading = $state(true);
	let printing = $state(false);

	$effect(() => {
		void load();
	});
	async function load() {
		try {
			await spoolSource.listSpools({
				filters: {},
				sort: [{ field: 'id', dir: 'asc' }],
				limit: 1000,
				offset: 0,
				lowThreshold: settings.lowThreshold
			});
		} catch (e) {
			console.error('Failed to load spools for printing', e);
		} finally {
			loading = false;
		}
	}

	function spoolLabel(s: Spool): string {
		const f = inventory.filamentById(s.filamentId);
		const v = f ? inventory.vendorById(f.vendorId) : undefined;
		const name = f ? `${v ? v.name + ' ' : ''}${f.name}` : m['labels.unknownFilament']();
		return `#${s.id} · ${name}${s.location ? ' · ' + s.location : ''}`;
	}

	const visibleSpools = $derived(
		inventory.spools
			.filter((s) => !s.archived)
			.filter((s) => (search ? spoolLabel(s).toLowerCase().includes(search.toLowerCase()) : true))
			.sort((a, b) => a.id - b.id)
	);

	function toggle(id: number) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	function selectAll() {
		selected = new Set(visibleSpools.map((s) => s.id));
	}
	function clearAll() {
		selected = new Set();
	}

	function bindingFor(s: Spool): LabelBinding {
		const filament = inventory.filamentById(s.filamentId);
		const vendor = filament ? inventory.vendorById(filament.vendorId) : undefined;
		return { spool: s, filament, vendor };
	}

	const bindings = $derived(
		[...selected]
			.map((id) => inventory.spoolById(id))
			.filter((s): s is Spool => !!s)
			.map(bindingFor)
	);

	const grid = $derived(sheetGrid(layout, design.label));

	async function doPrint() {
		if (bindings.length === 0) return;
		printing = true;
		try {
			await printLabels({ design, bindings, layout, baseUrl: settings.baseUrl });
		} catch (e) {
			console.error('Print failed', e);
		} finally {
			printing = false;
		}
	}

	function setMargin(k: 't' | 'b' | 'l' | 'r', v: number) {
		layout.margin = { ...layout.margin, [k]: v };
	}
	function n(e: Event): number {
		return parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
	}
</script>

<div class="print-panel">
	<div class="col spools">
		<div class="col-head">
			<span>{m['spool.spool']()}</span>
			<div class="mini-actions">
				<button onclick={selectAll}>{m['labels.selectAllShort']()}</button>
				<button onclick={clearAll}>{m['labels.selectNoneShort']()}</button>
			</div>
		</div>
		<input class="search" placeholder={m['labels.searchSpools']()} bind:value={search} />
		<div class="spool-list">
			{#if loading}
				<div class="muted">{m.loading()}…</div>
			{:else if visibleSpools.length === 0}
				<div class="muted">{m['labels.noSpools']()}</div>
			{:else}
				{#each visibleSpools as s (s.id)}
					<label class="spool-item">
						<input type="checkbox" checked={selected.has(s.id)} onchange={() => toggle(s.id)} />
						<span>{spoolLabel(s)}</span>
					</label>
				{/each}
			{/if}
		</div>
		<div class="count">{m['printing.spoolSelect.selectedTotal']({ count: selected.size })}</div>
	</div>

	<div class="col layout">
		<div class="col-head"><span>{m['labels.layout']()}</span></div>

		<div class="seg">
			<button class:active={layout.mode === 'sheet'} onclick={() => (layout.mode = 'sheet')}
				>{m['labels.modeSheet']()}</button
			>
			<button class:active={layout.mode === 'label'} onclick={() => (layout.mode = 'label')}
				>{m['labels.modeLabel']()}</button
			>
		</div>

		{#if layout.mode === 'sheet'}
			<label class="fld"
				>{m['printing.generic.paperSize']()}
				<select bind:value={layout.paper}>
					{#each PAPER_NAMES as p (p)}<option value={p}
							>{p === 'custom' ? m['printing.generic.customSize']() : p}</option
						>{/each}
				</select>
			</label>
			{#if layout.paper === 'custom'}
				<div class="row2">
					<label class="fld"
						>{m['labels.widthMm']()}<input
							type="number"
							value={layout.custom.w}
							onchange={(e) => (layout.custom = { ...layout.custom, w: n(e) })}
						/></label
					>
					<label class="fld"
						>{m['labels.heightMm']()}<input
							type="number"
							value={layout.custom.h}
							onchange={(e) => (layout.custom = { ...layout.custom, h: n(e) })}
						/></label
					>
				</div>
			{/if}
			<label class="chk"
				><input type="checkbox" bind:checked={layout.landscape} /> {m['labels.landscape']()}</label
			>

			<div class="row4">
				<label class="fld"
					>{m['labels.marginTop']()}<input
						type="number"
						value={layout.margin.t}
						onchange={(e) => setMargin('t', n(e))}
					/></label
				>
				<label class="fld"
					>{m['labels.marginBottom']()}<input
						type="number"
						value={layout.margin.b}
						onchange={(e) => setMargin('b', n(e))}
					/></label
				>
				<label class="fld"
					>{m['labels.marginLeft']()}<input
						type="number"
						value={layout.margin.l}
						onchange={(e) => setMargin('l', n(e))}
					/></label
				>
				<label class="fld"
					>{m['labels.marginRight']()}<input
						type="number"
						value={layout.margin.r}
						onchange={(e) => setMargin('r', n(e))}
					/></label
				>
			</div>
			<div class="row2">
				<label class="fld"
					>{m['printing.generic.horizontalSpacing']()}<input
						type="number"
						value={layout.spacing.h}
						onchange={(e) => (layout.spacing = { ...layout.spacing, h: n(e) })}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.verticalSpacing']()}<input
						type="number"
						value={layout.spacing.v}
						onchange={(e) => (layout.spacing = { ...layout.spacing, v: n(e) })}
					/></label
				>
			</div>
			<div class="row2">
				<label class="fld"
					>{m['printing.generic.skipItems']()}<input
						type="number"
						min="0"
						value={layout.skip}
						onchange={(e) => (layout.skip = n(e))}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.itemCopies']()}<input
						type="number"
						min="1"
						value={layout.copies}
						onchange={(e) => (layout.copies = Math.max(1, n(e)))}
					/></label
				>
			</div>
			<label class="chk"
				><input
					type="checkbox"
					checked={layout.border === 'border'}
					onchange={(e) => (layout.border = e.currentTarget.checked ? 'border' : 'none')}
				/>
				{m['labels.cutGuides']()}</label
			>
			<div class="grid-info">
				{m['labels.gridInfo']({ cols: grid.cols, rows: grid.rows, perPage: grid.perPage })}
			</div>
		{:else}
			<div class="row2">
				<label class="fld"
					>{m['labels.copies']()}<input
						type="number"
						min="1"
						value={layout.copies}
						onchange={(e) => (layout.copies = Math.max(1, n(e)))}
					/></label
				>
			</div>
			<div class="grid-info">
				{m['labels.onePerLabel']({ w: design.label.w, h: design.label.h })}
			</div>
		{/if}
	</div>

	<div class="col preview">
		<div class="col-head"><span>{m['labels.preview']()}</span></div>
		{#if bindings.length > 0}
			<div class="preview-wrap">
				<LabelCanvas
					{design}
					binding={bindings[0]}
					baseUrl={settings.baseUrl}
					pxPerMm={Math.min(6, 260 / design.label.w)}
				/>
			</div>
			<div class="muted small">
				{m['labels.showingSpool']({ id: bindings[0].spool.id })}
			</div>
		{:else}
			<div class="muted">{m['labels.selectAtLeastOne']()}</div>
		{/if}
		<div class="print-btn">
			<Button onclick={doPrint} disabled={bindings.length === 0 || printing}>
				{printing ? m['labels.preparing']() : m['labels.printN']({ count: bindings.length })}
			</Button>
		</div>
	</div>
</div>

<style>
	.print-panel {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 20px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-weight: 600;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
	}
	.mini-actions button {
		background: none;
		border: none;
		color: var(--accent-soft);
		font-size: 12px;
		cursor: pointer;
		padding: 2px 4px;
	}
	.search,
	.fld input,
	.fld select {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 6px;
		padding: 7px 9px;
		color: var(--text);
		font-size: 12.5px;
		font-family: inherit;
	}
	input:focus,
	select:focus {
		outline: none;
		border-color: var(--accent);
	}
	.spool-list {
		border: 1px solid var(--border);
		border-radius: 8px;
		max-height: 340px;
		overflow-y: auto;
		padding: 4px;
	}
	.spool-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 6px;
		border-radius: 5px;
		font-size: 12px;
		color: var(--text-2);
		cursor: pointer;
	}
	.spool-item:hover {
		background: var(--accent-wash-soft);
	}
	.spool-item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count,
	.grid-info {
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.fld {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		color: var(--text-dim);
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.row4 {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		gap: 6px;
	}
	.seg {
		display: flex;
		border: 1px solid var(--border-strong);
		border-radius: 7px;
		overflow: hidden;
	}
	.seg button {
		flex: 1;
		background: none;
		border: none;
		color: var(--text-dim);
		padding: 7px;
		font-size: 12px;
		cursor: pointer;
	}
	.seg button.active {
		background: var(--accent-wash);
		color: var(--accent-soft);
		font-weight: 600;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12.5px;
		color: var(--text-2);
		cursor: pointer;
	}
	.preview-wrap {
		display: flex;
		justify-content: center;
		padding: 12px;
		background: var(--surface-2);
		border-radius: 8px;
	}
	.muted {
		color: var(--text-dim);
		font-size: 12.5px;
	}
	.small {
		font-size: 11px;
	}
	.print-btn {
		margin-top: auto;
		padding-top: 8px;
	}
</style>
