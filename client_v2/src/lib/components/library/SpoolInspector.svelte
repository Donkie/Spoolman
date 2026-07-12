<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import EditableField from '../EditableField.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import type { Filament, Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import * as params from '$lib/library/params';
	import { lengthMeters, pct } from '$lib/utils/format';
	import { spoolSource } from '$lib/api/spoolSource';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';

	let { spool }: { spool: Spool } = $props();

	const MISSING_FIL: Filament = {
		id: '',
		vendorId: '',
		name: '…',
		material: '',
		colors: [],
		diameter: 0,
		density: 0,
		nozzleTemp: 0,
		bedTemp: 0,
		weight: 0,
		price: 0,
		extra: {}
	};

	let filament = $derived(inventory.filamentById(spool.filamentId) ?? MISSING_FIL);
	let vendor = $derived(inventory.vendorOf(filament));
	let used = $derived(spool.initial - spool.remaining);

	let adjustOpen = $state(false);
	let adjustVal = $state('');

	// Debounced persistence for inline field edits; optimistic cache patch first.
	const saver = makeSaver<number, Partial<Spool>>((id, patch) =>
		spoolSource.saveSpool(id, patch).catch((e) => console.error('Save failed', e))
	);
	$effect(() => () => saver.flush());

	function openAdjust() {
		adjustVal = String(spool.remaining);
		adjustOpen = !adjustOpen;
	}
	function applyAdjust() {
		const v = parseInt(adjustVal, 10);
		if (!isNaN(v)) {
			const remaining = Math.max(0, Math.min(spool.initial, v));
			inventory.patchSpool(spool.id, { remaining, unused: false });
			spoolSource.saveSpool(spool.id, { remaining }).catch((e) => console.error('Adjust failed', e));
		}
		adjustOpen = false;
	}
	function archive() {
		inventory.patchSpool(spool.id, { archived: true });
		spoolSource.archiveSpool(spool.id).catch((e) => console.error('Archive failed', e));
	}

	function set(patch: Partial<Spool>) {
		inventory.patchSpool(spool.id, patch);
		saver.push(spool.id, patch);
	}

	const extraSaver = makeExtraSaver(
		(e) => inventory.patchSpool(spool.id, { extra: e }),
		(p) => spoolSource.saveSpool(spool.id, { extra: p }).catch((err) => console.error('Save failed', err)),
		() => spool.extra
	);
	$effect(() => () => extraSaver.flush());
</script>

<div class="insp">
	<Breadcrumbs
		items={[
			{ label: vendor.name, onclick: () => params.select('vendor', vendor.id) },
			{ label: filament.name, onclick: () => params.select('filament', filament.id) },
			{ label: '#' + spool.id }
		]}
	/>

	<div class="head">
		<Swatch colors={filament.colors} size={40} radius={9} />
		<div class="titles">
			<div class="title">
				{vendor.name}
				{filament.name}
				<span class="idmono mono">#{spool.id}</span>
			</div>
			<div class="subtitle">
				{filament.material} · {filament.diameter} mm · {spool.unused ? 'unused' : 'in use'}
			</div>
		</div>
		<div class="actions">
			<Button variant="outline" onclick={openAdjust}>⚖ Adjust weight</Button>
			<Button variant="outline" onclick={archive}>Archive</Button>
		</div>
	</div>

	<div class="gauge">
		<div class="gauge-line">
			<span class="big mono">{spool.remaining} g</span>
			<span class="of"
				>of {spool.initial} g remaining · {lengthMeters(spool.remaining, filament).toFixed(0)} m</span
			>
			<span class="used">used <span class="mono">{used} g</span></span>
		</div>
		<div class="bar"><div class="bar-fill" style="width:{pct(spool.remaining, spool.initial)}%"></div></div>

		{#if adjustOpen}
			<div class="adjust">
				<span class="adj-label">New remaining weight:</span>
				<input class="adj-input mono" bind:value={adjustVal} />
				<span class="adj-unit">g</span>
				<Button onclick={applyAdjust}>Apply</Button>
			</div>
		{/if}
	</div>

	<div class="grid">
		<div class="col">
			<SectionLabel>Spool</SectionLabel>
			<FieldGrid>
				<Field label="Location">
					<EditableField
						value={spool.location}
						placeholder="no location"
						oninput={(v) => set({ location: v })}
					/>
				</Field>
				<Field label="Lot №">
					<EditableField value={spool.lot} mono oninput={(v) => set({ lot: v })} />
				</Field>
				<Field label="Price" mono>
					{settings.formatPrice(filament.price)}
					<span class="hint">· filament default</span>
				</Field>
				<Field label="Registered">{spool.registeredLabel}</Field>
				<Field label="Last used">{spool.lastUsedLabel || '—'}</Field>
				<Field label="Comment">
					<EditableField value={spool.comment} oninput={(v) => set({ comment: v })} />
				</Field>
			</FieldGrid>

			<ExtraFieldsSection entity="spool" extra={spool.extra} onchange={extraSaver.change} />
		</div>

		<div class="col">
			<SectionLabel>
				Filament
				{#snippet right()}
					<button class="link" onclick={() => params.select('filament', filament.id)}>Open filament →</button>
				{/snippet}
			</SectionLabel>
			<FieldGrid>
				<Field label="Material">{filament.material}</Field>
				<Field label="Color">
					<span class="color-row">
						<Swatch colors={filament.colors} size={11} radius={3} />
						<span class="mono"
							>{filament.colors.length > 1
								? 'multi ×' + filament.colors.length
								: filament.colors[0].toUpperCase()}</span
						>
					</span>
				</Field>
				<Field label="Diameter" mono>{filament.diameter} mm</Field>
				<Field label="Density" mono>{filament.density} g/cm³</Field>
				<Field label="Nozzle / bed" mono>{filament.nozzleTemp}° / {filament.bedTemp}°</Field>
			</FieldGrid>
		</div>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 20px 16px;
		border-bottom: 1px solid var(--border-soft);
	}
	.titles {
		min-width: 0;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.idmono {
		font-size: 12px;
		color: var(--text-muted);
		font-weight: 400;
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 8px;
		flex: none;
	}

	.gauge {
		padding: 18px 20px;
		border-bottom: 1px solid var(--border-soft);
	}
	.gauge-line {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.big {
		font-size: 28px;
		font-weight: 600;
	}
	.of {
		font-size: 13px;
		color: var(--text-muted);
	}
	.used {
		margin-left: auto;
		font-size: 12px;
		color: var(--text-muted);
	}
	.used .mono {
		color: var(--text-2);
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: #3a3a3a;
		margin-top: 12px;
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 4px;
		background: linear-gradient(90deg, #be682f, #d47a3b);
	}
	.adjust {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
		padding: 12px 14px;
		border: 1px solid var(--unused-bg);
		background: var(--accent-wash-soft);
		border-radius: var(--radius-md);
	}
	.adj-label {
		font-size: 12.5px;
		color: #b8a68f;
	}
	.adj-input {
		width: 90px;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		padding: 6px 10px;
		color: var(--text);
		font-size: 13px;
	}
	.adj-unit {
		font-size: 12px;
		color: var(--text-dim);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 32px;
		padding: 4px 20px 24px;
	}
	.hint {
		color: var(--text-faint);
		font-family: var(--font-sans);
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.link {
		font-size: 11.5px;
		color: var(--accent-link);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
	}

	@media (max-width: 620px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.actions {
			display: none;
		}
	}
</style>
