<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$components/Button.svelte';
	import NumberInput from '../NumberInput.svelte';
	import LabelCanvas from './LabelCanvas.svelte';
	import type { LabelDesign } from '$lib/labels/types';
	import type { LabelBinding } from '$lib/labels/template';
	import { PAPER_NAMES, paperSize, sheetGrid } from '$lib/labels/paper';
	import { printLabels, saveLabelImages, ZIP_THRESHOLD } from '$lib/labels/print';
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
	// Default to newest-first so spools you just added sit at the top of the list —
	// the common case when printing labels for a fresh batch.
	let sort = $state<'newest' | 'id'>('newest');
	let loading = $state(true);
	let printing = $state(false);
	let saving = $state(false);

	// Spools registered within this window count as "recently added" for the
	// one-click quick-select.
	const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
	function isRecent(s: Spool): boolean {
		if (!s.registered) return false;
		const t = new Date(s.registered).getTime();
		return !Number.isNaN(t) && Date.now() - t <= RECENT_WINDOW_MS;
	}
	// Sort key that is stable even when `registered` is missing: fall back to the
	// spool id, which is monotonic with registration order.
	function recencyKey(s: Spool): number {
		const t = s.registered ? new Date(s.registered).getTime() : NaN;
		return Number.isNaN(t) ? s.id : t;
	}

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
			.sort((a, b) => (sort === 'newest' ? recencyKey(b) - recencyKey(a) : a.id - b.id))
	);

	// Count of currently-visible spools added in the last 24h — drives the "Recent"
	// quick-select label and whether it's actionable.
	const recentCount = $derived(visibleSpools.filter(isRecent).length);

	function toggle(id: number) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	function selectAll() {
		selected = new Set(visibleSpools.map((s) => s.id));
	}
	function selectRecent() {
		selected = new Set(visibleSpools.filter(isRecent).map((s) => s.id));
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

	async function doSaveImages() {
		if (bindings.length === 0) return;
		saving = true;
		try {
			await saveLabelImages({ design, bindings, layout, baseUrl: settings.baseUrl });
		} catch (e) {
			console.error('Save as image failed', e);
		} finally {
			saving = false;
		}
	}

	function setMargin(k: 't' | 'b' | 'l' | 'r', v: number) {
		layout.margin = { ...layout.margin, [k]: v };
	}
	function setSafe(k: 't' | 'b' | 'l' | 'r', v: number) {
		layout.safe = { ...layout.safe, [k]: Math.max(0, v) };
	}

	// Solve the fit equation for the label width: pick a width that makes `columns`
	// labels plus their gaps exactly span the usable page width. Height is left to
	// the design (the button only touches width, per its label).
	function fitLabelWidth() {
		const page = paperSize(layout);
		const usableW = page.w - layout.margin.l - layout.margin.r;
		const cols = Math.max(1, Math.round(layout.columns));
		const w = (usableW - (cols - 1) * layout.spacing.h) / cols;
		if (w > 0) design.label = { ...design.label, w: Math.round(w * 10) / 10 };
	}
</script>

<div class="print-panel">
	<div class="col spools">
		<div class="col-head">
			<span>{m['spool.spool']()}</span>
			<div class="mini-actions">
				<button onclick={selectAll}>{m['labels.selectAllShort']()}</button>
				<button onclick={selectRecent} disabled={recentCount === 0} title={m['labels.selectRecentHint']()}
					>{m['labels.selectRecentShort']({ count: recentCount })}</button
				>
				<button onclick={clearAll}>{m['labels.selectNoneShort']()}</button>
			</div>
		</div>
		<div class="search-row">
			<input class="search" placeholder={m['labels.searchSpools']()} bind:value={search} />
			<div class="seg sort" title={m['labels.sortHint']()}>
				<button class:active={sort === 'newest'} onclick={() => (sort = 'newest')}
					>{m['labels.sortNewest']()}</button
				>
				<button class:active={sort === 'id'} onclick={() => (sort = 'id')}>{m['labels.sortId']()}</button>
			</div>
		</div>
		<div class="spool-list">
			{#if loading}
				<div class="muted">{m.loading()}…</div>
			{:else if visibleSpools.length === 0}
				<div class="muted">{m['labels.noSpools']()}</div>
			{:else}
				{#each visibleSpools as s (s.id)}
					<label class="spool-item" class:recent={isRecent(s)}>
						<input type="checkbox" checked={selected.has(s.id)} onchange={() => toggle(s.id)} />
						<span class="lbl">{spoolLabel(s)}</span>
						{#if s.registeredLabel}<span class="reg">{s.registeredLabel}</span>{/if}
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
			<button class:active={layout.mode === 'image'} onclick={() => (layout.mode = 'image')}
				>{m['labels.modeImage']()}</button
			>
		</div>

		<!-- DPI applies to every mode: printing rasterizes the labels too, so a
		     mismatch with the printer's native density blurs small labels either way. -->
		<label class="fld"
			>{m['labels.dpi']()}<NumberInput
				dense
				min={72}
				max={1200}
				unit="dpi"
				value={layout.dpi}
				onchange={(v) => (layout.dpi = v)}
			/></label
		>
		<p class="help">{m['labels.dpiHint']()}</p>

		{#if layout.mode === 'sheet'}
			<p class="help">{m['printing.generic.description']()}</p>
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
						>{m['labels.widthMm']()}<NumberInput
							dense
							unit="mm"
							value={layout.custom.w}
							onchange={(v) => (layout.custom = { ...layout.custom, w: v })}
						/></label
					>
					<label class="fld"
						>{m['labels.heightMm']()}<NumberInput
							dense
							unit="mm"
							value={layout.custom.h}
							onchange={(v) => (layout.custom = { ...layout.custom, h: v })}
						/></label
					>
				</div>
			{/if}

			<div class="row2">
				<div class="fld">
					{m['labels.labelSize']()}
					<div class="ro">{design.label.w} × {design.label.h} mm</div>
					<button type="button" class="linkbtn" onclick={fitLabelWidth} title={m['labels.fitWidthHint']()}
						>{m['labels.fitWidth']()}</button
					>
				</div>
				<label class="fld"
					>{m['printing.generic.columns']()}<NumberInput
						dense
						min={1}
						value={layout.columns}
						onchange={(v) => (layout.columns = Math.max(1, Math.round(v)))}
					/></label
				>
			</div>
			<div class="row2">
				<label class="fld"
					>{m['printing.generic.horizontalSpacing']()}<NumberInput
						dense
						unit="mm"
						value={layout.spacing.h}
						onchange={(v) => (layout.spacing = { ...layout.spacing, h: v })}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.verticalSpacing']()}<NumberInput
						dense
						unit="mm"
						value={layout.spacing.v}
						onchange={(v) => (layout.spacing = { ...layout.spacing, v: v })}
					/></label
				>
			</div>

			<p class="help">{m['printing.generic.helpMargin']()}</p>
			<div class="row4">
				<label class="fld"
					>{m['printing.generic.marginTop']()}<NumberInput
						dense
						unit="mm"
						value={layout.margin.t}
						onchange={(v) => setMargin('t', v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.marginBottom']()}<NumberInput
						dense
						unit="mm"
						value={layout.margin.b}
						onchange={(v) => setMargin('b', v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.marginLeft']()}<NumberInput
						dense
						unit="mm"
						value={layout.margin.l}
						onchange={(v) => setMargin('l', v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.marginRight']()}<NumberInput
						dense
						unit="mm"
						value={layout.margin.r}
						onchange={(v) => setMargin('r', v)}
					/></label
				>
			</div>

			<p class="help">{m['printing.generic.helpPrinterMargin']()}</p>
			<div class="row4">
				<label class="fld"
					>{m['printing.generic.printerMarginTop']()}<NumberInput
						dense
						min={0}
						unit="mm"
						value={layout.safe.t}
						onchange={(v) => setSafe('t', v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.printerMarginBottom']()}<NumberInput
						dense
						min={0}
						unit="mm"
						value={layout.safe.b}
						onchange={(v) => setSafe('b', v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.printerMarginLeft']()}<NumberInput
						dense
						min={0}
						unit="mm"
						value={layout.safe.l}
						onchange={(v) => setSafe('l', v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.printerMarginRight']()}<NumberInput
						dense
						min={0}
						unit="mm"
						value={layout.safe.r}
						onchange={(v) => setSafe('r', v)}
					/></label
				>
			</div>
			<div class="row2">
				<label class="fld"
					>{m['printing.generic.skipItems']()}<NumberInput
						dense
						min={0}
						value={layout.skip}
						onchange={(v) => (layout.skip = v)}
					/></label
				>
				<label class="fld"
					>{m['printing.generic.itemCopies']()}<NumberInput
						dense
						min={1}
						value={layout.copies}
						onchange={(v) => (layout.copies = Math.max(1, v))}
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
			{#if !grid.fits}
				<div class="warn">{m['printing.generic.gridTooWide']()}</div>
			{/if}
		{:else if layout.mode === 'label'}
			<div class="row2">
				<label class="fld"
					>{m['labels.copies']()}<NumberInput
						dense
						min={1}
						value={layout.copies}
						onchange={(v) => (layout.copies = Math.max(1, v))}
					/></label
				>
			</div>
			<div class="grid-info">
				{m['labels.onePerLabel']({ w: design.label.w, h: design.label.h })}
			</div>
		{:else}
			<!-- Image export has no page geometry to configure: the file *is* the label.
			     Copies are omitted too, since the files would be byte-identical. -->
			<p class="help">{m['labels.imageDesc']({ w: design.label.w, h: design.label.h })}</p>
			<div class="grid-info">{m['labels.imageZipNote']({ threshold: ZIP_THRESHOLD })}</div>
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
			{#if layout.mode === 'image'}
				<Button onclick={doSaveImages} disabled={bindings.length === 0 || saving}>
					{saving ? m['labels.preparing']() : m['printing.generic.saveAsImage']()}
				</Button>
			{:else}
				<Button onclick={doPrint} disabled={bindings.length === 0 || printing}>
					{printing
						? m['labels.preparing']()
						: m['labels.printN']({ count: bindings.length * Math.max(1, layout.copies) })}
				</Button>
			{/if}
		</div>
	</div>
</div>

<style>
	.print-panel {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 20px;
	}
	/* Spool list keeps a full column; layout + preview share the second one… */
	@media (max-width: 860px) {
		.print-panel {
			grid-template-columns: 1fr 1fr;
		}
		.col.preview {
			grid-column: 1 / -1;
		}
	}
	/* …then everything stacks on phones. */
	@media (max-width: 560px) {
		.print-panel {
			grid-template-columns: 1fr;
		}
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
	.mini-actions {
		display: flex;
		gap: 2px;
	}
	.mini-actions button {
		background: none;
		border: none;
		color: var(--accent-soft);
		font-size: 12px;
		cursor: pointer;
		padding: 2px 4px;
	}
	.mini-actions button:disabled {
		color: var(--text-dim);
		cursor: default;
		opacity: 0.6;
	}
	.search-row {
		display: flex;
		gap: 8px;
	}
	.search-row .search {
		flex: 1;
		min-width: 0;
	}
	.seg.sort {
		flex: none;
	}
	.seg.sort button {
		padding: 6px 9px;
		font-size: 11.5px;
	}
	.search,
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
	.spool-item .lbl {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.spool-item .reg {
		flex: none;
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
	}
	/* Highlight the registration date of spools added in the last 24h so a fresh
	   batch is easy to spot when scanning the list. */
	.spool-item.recent .reg {
		color: var(--accent-soft);
		font-weight: 600;
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
	/* Read-only display styled like a disabled NumberInput — the label size is
	   owned by the design, not editable here. */
	.ro {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 7px 9px;
		color: var(--text-2);
		font-size: 12.5px;
		background: var(--surface-2);
	}
	.linkbtn {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 2px 0;
		color: var(--accent-soft);
		font-size: 11px;
		font-family: inherit;
		cursor: pointer;
	}
	.help {
		margin: 2px 0 0;
		font-size: 11px;
		line-height: 1.35;
		color: var(--text-dim);
	}
	.warn {
		font-size: 11.5px;
		line-height: 1.35;
		color: var(--danger, #e5484d);
	}
	.row2 {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px;
	}
	.row4 {
		display: grid;
		/* 2×2 so each margin field has room for a 3-digit value plus the mm unit
		   and steppers. */
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px 8px;
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
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: auto;
		padding-top: 8px;
	}
</style>
