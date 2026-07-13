<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$components/Button.svelte';
	import LabelCanvas from './LabelCanvas.svelte';
	import type { LabelDesign, PrintLayout } from '$lib/labels/types';
	import { DEFAULT_LAYOUT } from '$lib/labels/types';
	import type { LabelBinding } from '$lib/labels/template';
	import { PAPER_NAMES, sheetGrid } from '$lib/labels/paper';
	import { printLabels } from '$lib/labels/print';
	import { spoolSource } from '$lib/api/spoolSource';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import type { Spool } from '$lib/types';

	interface Props {
		design: LabelDesign;
		preselected?: number[];
	}
	let { design, preselected = [] }: Props = $props();

	const LAYOUT_KEY = 'spoolman-v2-print-layout';

	let layout = $state<PrintLayout>(loadLayout());
	let selected = $state<Set<number>>(new Set(untrack(() => preselected)));
	let search = $state('');
	let loading = $state(true);
	let printing = $state(false);

	function loadLayout(): PrintLayout {
		if (typeof localStorage !== 'undefined') {
			const raw = localStorage.getItem(LAYOUT_KEY);
			if (raw) {
				try {
					return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) };
				} catch {
					/* fall through */
				}
			}
		}
		return { ...DEFAULT_LAYOUT };
	}
	// Persist layout whenever it changes.
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(LAYOUT_KEY, JSON.stringify($state.snapshot(layout)));
		}
	});

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
		const name = f ? `${v ? v.name + ' ' : ''}${f.name}` : 'Unknown filament';
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
			<span>Spools</span>
			<div class="mini-actions">
				<button onclick={selectAll}>All</button>
				<button onclick={clearAll}>None</button>
			</div>
		</div>
		<input class="search" placeholder="Search spools…" bind:value={search} />
		<div class="spool-list">
			{#if loading}
				<div class="muted">Loading…</div>
			{:else if visibleSpools.length === 0}
				<div class="muted">No spools.</div>
			{:else}
				{#each visibleSpools as s (s.id)}
					<label class="spool-item">
						<input type="checkbox" checked={selected.has(s.id)} onchange={() => toggle(s.id)} />
						<span>{spoolLabel(s)}</span>
					</label>
				{/each}
			{/if}
		</div>
		<div class="count">{selected.size} selected</div>
	</div>

	<div class="col layout">
		<div class="col-head"><span>Layout</span></div>

		<div class="seg">
			<button class:active={layout.mode === 'sheet'} onclick={() => (layout.mode = 'sheet')}
				>Sheet (tile)</button
			>
			<button class:active={layout.mode === 'label'} onclick={() => (layout.mode = 'label')}
				>Label printer</button
			>
		</div>

		{#if layout.mode === 'sheet'}
			<label class="fld"
				>Paper
				<select bind:value={layout.paper}>
					{#each PAPER_NAMES as p (p)}<option value={p}>{p}</option>{/each}
				</select>
			</label>
			{#if layout.paper === 'custom'}
				<div class="row2">
					<label class="fld"
						>Width (mm)<input
							type="number"
							value={layout.custom.w}
							onchange={(e) => (layout.custom = { ...layout.custom, w: n(e) })}
						/></label
					>
					<label class="fld"
						>Height (mm)<input
							type="number"
							value={layout.custom.h}
							onchange={(e) => (layout.custom = { ...layout.custom, h: n(e) })}
						/></label
					>
				</div>
			{/if}
			<label class="chk"><input type="checkbox" bind:checked={layout.landscape} /> Landscape</label>

			<div class="row4">
				<label class="fld"
					>Top<input type="number" value={layout.margin.t} onchange={(e) => setMargin('t', n(e))} /></label
				>
				<label class="fld"
					>Bottom<input type="number" value={layout.margin.b} onchange={(e) => setMargin('b', n(e))} /></label
				>
				<label class="fld"
					>Left<input type="number" value={layout.margin.l} onchange={(e) => setMargin('l', n(e))} /></label
				>
				<label class="fld"
					>Right<input type="number" value={layout.margin.r} onchange={(e) => setMargin('r', n(e))} /></label
				>
			</div>
			<div class="row2">
				<label class="fld"
					>Gap H (mm)<input
						type="number"
						value={layout.spacing.h}
						onchange={(e) => (layout.spacing = { ...layout.spacing, h: n(e) })}
					/></label
				>
				<label class="fld"
					>Gap V (mm)<input
						type="number"
						value={layout.spacing.v}
						onchange={(e) => (layout.spacing = { ...layout.spacing, v: n(e) })}
					/></label
				>
			</div>
			<div class="row2">
				<label class="fld"
					>Skip cells<input
						type="number"
						min="0"
						value={layout.skip}
						onchange={(e) => (layout.skip = n(e))}
					/></label
				>
				<label class="fld"
					>Copies<input
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
				/> Cut guides</label
			>
			<div class="grid-info">{grid.cols} × {grid.rows} = {grid.perPage} labels / page</div>
		{:else}
			<div class="row2">
				<label class="fld"
					>Copies<input
						type="number"
						min="1"
						value={layout.copies}
						onchange={(e) => (layout.copies = Math.max(1, n(e)))}
					/></label
				>
			</div>
			<div class="grid-info">One {design.label.w}×{design.label.h} mm page per label.</div>
		{/if}
	</div>

	<div class="col preview">
		<div class="col-head"><span>Preview</span></div>
		{#if bindings.length > 0}
			<div class="preview-wrap">
				<LabelCanvas
					{design}
					binding={bindings[0]}
					baseUrl={settings.baseUrl}
					pxPerMm={Math.min(6, 260 / design.label.w)}
				/>
			</div>
			<div class="muted small">Showing spool #{bindings[0].spool.id}</div>
		{:else}
			<div class="muted">Select at least one spool.</div>
		{/if}
		<div class="print-btn">
			<Button onclick={doPrint} disabled={bindings.length === 0 || printing}>
				{printing ? 'Preparing…' : `Print ${bindings.length || ''} label${bindings.length === 1 ? '' : 's'}`}
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
