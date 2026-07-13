<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import EditableField from '../EditableField.svelte';
	import DateTimeField from '../DateTimeField.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import type { Filament, Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import * as params from '$lib/library/params';
	import { lengthMeters, pct, grams } from '$lib/utils/format';
	import { spoolSource } from '$lib/api/spoolSource';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

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

	// Mirrors the v1 client's "Adjust Spool Filament" modal: length/weight are
	// signed deltas applied via PUT /spool/{id}/use (positive consumes, negative
	// adds filament back); measured_weight is the new absolute gross weight
	// (spool + remaining filament) applied via PUT /spool/{id}/measure.
	type AdjustMode = 'length' | 'weight' | 'measured_weight';
	const ADJUST_MODE_KEY = 'spoolman-v2-adjust-mode';
	const ADJUST_MODES: { key: AdjustMode; label: string; fieldLabel: string; unit: string; help: string }[] = [
		{
			key: 'length',
			label: 'Length',
			fieldLabel: 'Consume amount:',
			unit: 'mm',
			help: 'Positive consumes filament, negative adds it back.'
		},
		{
			key: 'weight',
			label: 'Weight',
			fieldLabel: 'Consume amount:',
			unit: 'g',
			help: 'Positive consumes filament, negative adds it back.'
		},
		{
			key: 'measured_weight',
			label: 'Measured Weight',
			fieldLabel: 'New gross weight:',
			unit: 'g',
			help: 'Total weight of the spool + remaining filament, as read from a scale.'
		}
	];

	function loadAdjustMode(): AdjustMode {
		if (typeof localStorage === 'undefined') return 'length';
		const v = localStorage.getItem(ADJUST_MODE_KEY);
		return v === 'weight' || v === 'measured_weight' ? v : 'length';
	}

	let adjustOpen = $state(false);
	let adjustMode = $state<AdjustMode>(loadAdjustMode());
	let adjustVal = $state('');
	let adjustError = $state('');
	let adjustBusy = $state(false);
	let adjustInfo = $derived(ADJUST_MODES.find((m) => m.key === adjustMode)!);

	// Debounced persistence for inline field edits; optimistic cache patch first.
	const saver = makeSaver<number, Partial<Spool>>((id, patch) =>
		spoolSource.saveSpool(id, patch).catch((e) => console.error('Save failed', e))
	);
	$effect(() => () => saver.flush());

	function resetAdjustInput() {
		adjustError = '';
		adjustVal = '';
	}
	function openAdjust() {
		adjustOpen = !adjustOpen;
		if (adjustOpen) resetAdjustInput();
	}
	function setAdjustMode(mode: AdjustMode) {
		adjustMode = mode;
		resetAdjustInput();
		if (typeof localStorage !== 'undefined') localStorage.setItem(ADJUST_MODE_KEY, mode);
	}
	async function applyAdjust() {
		const v = parseFloat(adjustVal);
		if (isNaN(v) || (adjustMode === 'measured_weight' && v < 0)) {
			adjustError = `Enter a valid ${adjustMode === 'length' ? 'length' : 'weight'}.`;
			return;
		}

		adjustError = '';
		adjustBusy = true;
		try {
			if (adjustMode === 'length') {
				await spoolSource.useSpoolLength(spool.id, v);
			} else if (adjustMode === 'weight') {
				await spoolSource.useSpoolWeight(spool.id, v);
			} else {
				await spoolSource.measureSpool(spool.id, v);
			}
			adjustOpen = false;
		} catch (e) {
			adjustError = e instanceof Error ? e.message : 'Failed to adjust weight.';
		} finally {
			adjustBusy = false;
		}
	}
	function archive() {
		inventory.patchSpool(spool.id, { archived: true });
		spoolSource.archiveSpool(spool.id).catch((e) => console.error('Archive failed', e));
	}

	function set(patch: Partial<Spool>) {
		inventory.patchSpool(spool.id, patch);
		saver.push(spool.id, patch);
	}

	function setPrice(raw: string) {
		const trimmed = raw.trim();
		if (trimmed === '') {
			set({ price: undefined });
			return;
		}
		const v = parseFloat(trimmed);
		if (!isNaN(v) && v >= 0) set({ price: v });
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
			<Button variant="outline" onclick={() => goto(`${base}/labels?spools=${spool.id}`)}
				>◱ Print label</Button
			>
			<Button variant="outline" onclick={archive}>Archive</Button>
		</div>
	</div>

	<div class="gauge">
		<div class="gauge-line">
			<span class="big mono">{grams(spool.remaining)} g</span>
			<span class="of"
				>of {grams(spool.initial)} g remaining · {lengthMeters(spool.remaining, filament).toFixed(0)} m</span
			>
			<span class="used">used <span class="mono">{grams(used)} g</span></span>
		</div>
		<div class="bar"><div class="bar-fill" style="width:{pct(spool.remaining, spool.initial)}%"></div></div>

		{#if adjustOpen}
			<div class="adjust">
				<div class="adjust-modes">
					{#each ADJUST_MODES as m (m.key)}
						<button
							type="button"
							class="mode-btn"
							class:active={adjustMode === m.key}
							onclick={() => setAdjustMode(m.key)}
						>
							{m.label}
						</button>
					{/each}
				</div>
				<div class="adjust-row">
					<span class="adj-label">{adjustInfo.fieldLabel}</span>
					<input
						class="adj-input mono"
						type="number"
						step="any"
						value={adjustVal}
						oninput={(e) => (adjustVal = e.currentTarget.value)}
						disabled={adjustBusy}
					/>
					<span class="adj-unit">{adjustInfo.unit}</span>
					<Button onclick={applyAdjust} disabled={adjustBusy}>{adjustBusy ? 'Applying…' : 'Apply'}</Button>
				</div>
				{#if adjustError}
					<span class="adj-error">{adjustError}</span>
				{:else if adjustInfo.help}
					<span class="adj-help">{adjustInfo.help}</span>
				{/if}
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
				<Field label="Price">
					<div class="price-row">
						<EditableField
							value={spool.price != null ? String(spool.price) : ''}
							placeholder={settings.formatPriceValue(filament.price) + ' · filament default'}
							mono
							oninput={setPrice}
						/>
						<span class="price-unit">{settings.currencySymbol}</span>
					</div>
				</Field>
				<Field label="Registered">{spool.registeredLabel}</Field>
				<Field label="First used">
					<DateTimeField value={spool.firstUsed} oninput={(iso) => set({ firstUsed: iso })} />
				</Field>
				<Field label="Last used">
					<DateTimeField value={spool.lastUsed} oninput={(iso) => set({ lastUsed: iso })} />
				</Field>
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
				<Field label="Spool weight" mono>{filament.weight} g</Field>
				{#if filament.spoolWeight}
					<Field label="Empty spool weight" mono>{filament.spoolWeight} g</Field>
				{/if}
			</FieldGrid>

			<ExtraFieldsSection entity="filament" extra={filament.extra} onchange={() => {}} readonly />
		</div>
	</div>
</div>

<style>
	.insp {
		/* The two-column grid below needs to react to this panel's own width, not
		   the viewport's — the library sidebar can leave it squeezed well before
		   the window itself is narrow (e.g. Firefox drops the time-of-day segment
		   from datetime-local inputs when their column gets too tight). */
		container-type: inline-size;
	}
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
		flex-direction: column;
		gap: 10px;
		margin-top: 14px;
		padding: 12px 14px;
		border: 1px solid var(--unused-bg);
		background: var(--accent-wash-soft);
		border-radius: var(--radius-md);
	}
	.adjust-modes {
		display: flex;
		gap: 4px;
	}
	.mode-btn {
		background: none;
		border: 1px solid var(--border-strong);
		color: var(--text-2);
		font-size: 11.5px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: var(--radius);
		cursor: pointer;
	}
	.mode-btn:hover {
		border-color: var(--accent);
		color: var(--text);
	}
	.mode-btn.active {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.adjust-row {
		display: flex;
		align-items: center;
		gap: 10px;
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
	.adj-help {
		font-size: 11px;
		color: var(--text-faint);
	}
	.adj-error {
		font-size: 11px;
		color: var(--danger-soft);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 32px;
		padding: 4px 20px 24px;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.price-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.price-row :global(.edit) {
		flex: 1;
		min-width: 0;
	}
	.price-unit {
		color: var(--text-dim);
		font-size: 12px;
		flex: none;
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

	@container (max-width: 760px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.actions {
			display: none;
		}
	}
</style>
