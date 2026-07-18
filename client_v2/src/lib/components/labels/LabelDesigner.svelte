<script lang="ts">
	import LabelCanvas from './LabelCanvas.svelte';
	import ElementInspector from './ElementInspector.svelte';
	import NumberInput from '../NumberInput.svelte';
	import type { LabelDesign, LabelElement } from '$lib/labels/types';
	import { getPlaceholderGroups, type LabelBinding } from '$lib/labels/template';
	import { fields } from '$lib/stores/fields.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { inventory } from '$lib/stores/inventory.svelte';
	import type { Spool } from '$lib/types';
	import * as m from '$lib/paraglide/messages';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Type from '@lucide/svelte/icons/type';
	import SwatchBook from '@lucide/svelte/icons/swatch-book';
	import RectangleHorizontal from '@lucide/svelte/icons/rectangle-horizontal';

	interface Props {
		design: LabelDesign;
	}
	let { design = $bindable() }: Props = $props();

	let selectedId = $state<string | null>(null);

	// Optional real-spool preview: bind a spool so fields/QR/colors resolve to
	// real data while designing (independent of the print tab's selection).
	let previewSpoolId = $state<number | null>(null);
	$effect(() => {
		if (inventory.spools.length === 0) {
			spoolSource
				.listSpools({
					filters: {},
					sort: [{ field: 'id', dir: 'asc' }],
					limit: 1000,
					offset: 0,
					lowThreshold: settings.lowThreshold
				})
				.catch((e) => console.error('Failed to load spools for preview', e));
		}
	});
	const previewSpools = $derived(inventory.spools.filter((s) => !s.archived).sort((a, b) => a.id - b.id));
	function spoolLabel(s: Spool): string {
		const f = inventory.filamentById(s.filamentId);
		const v = f ? inventory.vendorById(f.vendorId) : undefined;
		return `#${s.id} · ${f ? `${v ? v.name + ' ' : ''}${f.name}` : m.unknown()}`;
	}
	const previewBinding = $derived.by<LabelBinding | undefined>(() => {
		if (previewSpoolId === null) return undefined;
		const s = inventory.spoolById(previewSpoolId);
		if (!s) return undefined;
		const filament = inventory.filamentById(s.filamentId);
		const vendor = filament ? inventory.vendorById(filament.vendorId) : undefined;
		return { spool: s, filament, vendor };
	});

	// Fit the label into the canvas viewport (with sensible min/max zoom).
	const VIEW_W = 500;
	const VIEW_H = 340;
	const pxPerMm = $derived(
		Math.max(2, Math.min(14, Math.min(VIEW_W / design.label.w, VIEW_H / design.label.h)))
	);

	$effect(() => {
		fields.ensure('spool');
		fields.ensure('filament');
		fields.ensure('vendor');
	});
	const groups = $derived(
		getPlaceholderGroups({
			spool: fields.get('spool'),
			filament: fields.get('filament'),
			vendor: fields.get('vendor')
		})
	);

	const selectedEl = $derived(design.elements.find((e) => e.id === selectedId) ?? null);

	function uid(): string {
		return typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	}
	function clampW(v: number): number {
		return Math.max(2, Math.min(v, design.label.w - 2));
	}
	function clampH(v: number): number {
		return Math.max(2, Math.min(v, design.label.h - 2));
	}

	function add(el: LabelElement) {
		design.elements = [...design.elements, el];
		selectedId = el.id;
	}
	function addQr() {
		add({ id: uid(), type: 'qr', x: 2, y: 2, size: clampW(20), ec: 'H', encoding: 'scheme', logo: true });
	}
	function addText() {
		add({
			id: uid(),
			type: 'text',
			x: 2,
			y: 2,
			w: clampW(30),
			fontSize: 3,
			bold: false,
			align: 'left',
			color: '#000000',
			wrap: true,
			template: m['labels.newText']()
		});
	}
	function addSwatch() {
		add({ id: uid(), type: 'swatch', x: 2, y: 2, w: clampW(20), h: clampH(6), radius: 1 });
	}
	function addRect() {
		add({
			id: uid(),
			type: 'rect',
			x: 2,
			y: 2,
			w: clampW(20),
			h: clampH(10),
			radius: 0,
			fill: '',
			stroke: '#000000',
			strokeWidth: 0.3
		});
	}

	function updateElement(el: LabelElement) {
		design.elements = design.elements.map((e) => (e.id === el.id ? el : e));
	}
	function removeElement(id: string) {
		design.elements = design.elements.filter((e) => e.id !== id);
		if (selectedId === id) selectedId = null;
	}

	function setLabelSize(dim: 'w' | 'h', v: number) {
		design.label = { ...design.label, [dim]: Math.max(5, v) };
	}
</script>

<div class="designer">
	<div class="palette">
		<div class="p-head">{m['labels.addHead']()}</div>
		<button onclick={addQr}><QrCode size={15} /> {m['labels.addQr']()}</button>
		<button onclick={addText}><Type size={15} /> {m['labels.addText']()}</button>
		<button onclick={addSwatch}><SwatchBook size={15} /> {m['labels.addSwatch']()}</button>
		<button onclick={addRect}><RectangleHorizontal size={15} /> {m['labels.addRect']()}</button>

		<div class="p-head">{m['printing.generic.dimensions']()}</div>
		<label class="sz"
			>{m['labels.wMm']()}<NumberInput
				dense
				unit="mm"
				min={5}
				step={0.5}
				value={design.label.w}
				onchange={(v) => setLabelSize('w', v || 5)}
			/></label
		>
		<label class="sz"
			>{m['labels.hMm']()}<NumberInput
				dense
				unit="mm"
				min={5}
				step={0.5}
				value={design.label.h}
				onchange={(v) => setLabelSize('h', v || 5)}
			/></label
		>
	</div>

	<div class="stage-area">
		<div class="preview-bar">
			<span>{m['labels.previewWith']()}</span>
			<select
				value={previewSpoolId === null ? '' : String(previewSpoolId)}
				onchange={(e) =>
					(previewSpoolId = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
			>
				<option value="">{m['labels.sampleData']()}</option>
				{#each previewSpools as s (s.id)}
					<option value={String(s.id)}>{spoolLabel(s)}</option>
				{/each}
			</select>
		</div>
		<LabelCanvas
			{design}
			binding={previewBinding}
			baseUrl={settings.baseUrl}
			{pxPerMm}
			interactive
			bind:selectedId
			onchange={updateElement}
		/>
		<div class="hint">
			{m['labels.canvasHint']()}
			{previewBinding ? m['labels.showingReal']() : m['labels.showingTags']()}
		</div>
	</div>

	<div class="inspector-area">
		<ElementInspector
			el={selectedEl}
			{groups}
			onchange={updateElement}
			ondelete={() => selectedId && removeElement(selectedId)}
		/>
	</div>
</div>

<style>
	.designer {
		display: grid;
		grid-template-columns: 160px 1fr 260px;
		gap: 18px;
		align-items: start;
	}
	.palette {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.p-head {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
		margin-top: 6px;
	}
	.palette button {
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 7px;
		color: var(--text-2);
		padding: 8px 10px;
		font-size: 12.5px;
		cursor: pointer;
	}
	.palette button:hover {
		border-color: var(--accent);
		color: var(--text);
	}
	.sz {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		color: var(--text-dim);
	}
	.stage-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 24px;
		background: var(--surface-2);
		border-radius: 10px;
		min-height: 420px;
		justify-content: center;
		/* Let the grid track shrink and scroll oversized labels instead of
		   forcing the whole 3-column layout wider (which clipped the inspector). */
		min-width: 0;
		overflow: auto;
	}
	.preview-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.preview-bar select {
		border: 1px solid var(--border-strong);
		background: var(--surface);
		border-radius: 6px;
		padding: 5px 8px;
		color: var(--text);
		font-size: 12px;
		font-family: inherit;
		max-width: 260px;
	}
	.preview-bar select:focus {
		outline: none;
		border-color: var(--accent);
	}
	.hint {
		font-size: 11.5px;
		color: var(--text-dim);
		text-align: center;
	}
	.inspector-area {
		border-left: 1px solid var(--border);
		padding-left: 18px;
		min-height: 420px;
	}
</style>
