<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import NumberInput from '../NumberInput.svelte';
	import EditableField from '../EditableField.svelte';
	import Combobox from '../Combobox.svelte';
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
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

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

	// Existing locations for the location picker: pick an existing one from the
	// dropdown or type a new one. Merge the server's configured locations with the
	// spool's current value so it's never absent from the list.
	let serverLocations = $state<string[]>([]);
	$effect(() => {
		spoolSource
			.locations()
			.then((l) => (serverLocations = l))
			.catch(() => {});
	});
	let locationOptions = $derived(
		[...new Set([...serverLocations, spool.location].filter((l): l is string => !!l))].sort()
	);

	// Mirrors the v1 client's "Adjust Spool Filament" modal: length/weight are
	// signed deltas applied via PUT /spool/{id}/use (positive consumes, negative
	// adds filament back); measured_weight is the new absolute gross weight
	// (spool + remaining filament) applied via PUT /spool/{id}/measure.
	type AdjustMode = 'length' | 'weight' | 'measured_weight';
	const ADJUST_MODE_KEY = 'spoolman-v2-adjust-mode';
	const ADJUST_MODES: {
		key: AdjustMode;
		labelKey: () => string;
		fieldLabelKey: () => string;
		unit: string;
		helpKey: () => string;
	}[] = [
		{
			key: 'length',
			labelKey: m['spool.form.measurementType.length'],
			fieldLabelKey: m['inspector.consumeAmount'],
			unit: 'mm',
			helpKey: m['inspector.adjustHelp']
		},
		{
			key: 'weight',
			labelKey: m['spool.form.measurementType.weight'],
			fieldLabelKey: m['inspector.consumeAmount'],
			unit: 'g',
			helpKey: m['inspector.adjustHelp']
		},
		{
			key: 'measured_weight',
			labelKey: m['spool.fields.measuredWeight'],
			fieldLabelKey: m['inspector.newGross'],
			unit: 'g',
			helpKey: m['inspector.measuredHelp']
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
			adjustError =
				adjustMode === 'length' ? m['inspector.enterValidLength']() : m['inspector.enterValidWeight']();
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
			adjustError = e instanceof Error ? e.message : m['inspector.adjustFailed']();
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
				{filament.material} · {filament.diameter} mm · {spool.unused
					? m['library.unused']()
					: m['library.inUse']()}
			</div>
		</div>
		<div class="actions">
			<Button variant="outline" onclick={openAdjust}>⚖ {m['inspector.adjustWeight']()}</Button>
			<Button variant="outline" onclick={() => goto(resolve(`/labels?spools=${spool.id}`))}
				>◱ {m['printing.qrcode.button']()}</Button
			>
			<Button variant="outline" onclick={archive}>{m['buttons.archive']()}</Button>
		</div>
	</div>

	<div class="gauge">
		<div class="gauge-line">
			<span class="big mono">{grams(spool.remaining)} g</span>
			<span class="of"
				>{m['inspector.ofRemaining']({
					weight: grams(spool.initial),
					length: lengthMeters(spool.remaining, filament).toFixed(0)
				})}</span
			>
			<span class="used">{m['inspector.used']()} <span class="mono">{grams(used)} g</span></span>
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
							{m.labelKey()}
						</button>
					{/each}
				</div>
				<div class="adjust-row">
					<span class="adj-label">{adjustInfo.fieldLabelKey()}</span>
					<NumberInput
						bind:value={adjustVal}
						unit={adjustInfo.unit}
						step={0.01}
						disabled={adjustBusy}
						width="130px"
					/>
					<Button onclick={applyAdjust} disabled={adjustBusy}
						>{adjustBusy ? m['inspector.applying']() : m['inspector.apply']()}</Button
					>
				</div>
				{#if adjustError}
					<span class="adj-error">{adjustError}</span>
				{:else if adjustInfo.helpKey}
					<span class="adj-help">{adjustInfo.helpKey()}</span>
				{/if}
			</div>
		{/if}
	</div>

	<div class="grid">
		<div class="col">
			<SectionLabel>{m['library.section.spool']()}</SectionLabel>
			<FieldGrid>
				<Field label={m['spool.fields.location']()}>
					<Combobox
						value={spool.location}
						placeholder={m['library.noLocation']()}
						options={locationOptions}
						underline
						oninput={(v) => set({ location: v })}
					/>
				</Field>
				<Field label={m['spool.fields.lotNr']()}>
					<EditableField value={spool.lot} mono oninput={(v) => set({ lot: v })} />
				</Field>
				<Field label={m['spool.fields.price']()}>
					<NumberInput
						dense
						width="240px"
						unit={settings.currencySymbol}
						min={0}
						placeholder={m['inspector.filamentDefault']({
							price: settings.formatPriceValue(filament.price)
						})}
						value={spool.price ?? ''}
						onchange={(v) => set({ price: v })}
						onclear={() => set({ price: undefined })}
					/>
				</Field>
				<Field label={m['spool.fields.registered']()}>{spool.registeredLabel}</Field>
				<Field label={m['spool.fields.firstUsed']()}>
					<DateTimeField value={spool.firstUsed} oninput={(iso) => set({ firstUsed: iso })} />
				</Field>
				<Field label={m['spool.fields.lastUsed']()}>
					<DateTimeField value={spool.lastUsed} oninput={(iso) => set({ lastUsed: iso })} />
				</Field>
				<Field label={m['spool.fields.comment']()}>
					<EditableField value={spool.comment} oninput={(v) => set({ comment: v })} />
				</Field>
			</FieldGrid>

			<ExtraFieldsSection entity="spool" extra={spool.extra} onchange={extraSaver.change} />
		</div>

		<div class="col">
			<SectionLabel>
				{m['library.section.filament']()}
				{#snippet right()}
					<button class="link" onclick={() => params.select('filament', filament.id)}
						>{m['inspector.openFilament']()}</button
					>
				{/snippet}
			</SectionLabel>
			<FieldGrid>
				<Field label={m['filament.fields.material']()}>{filament.material}</Field>
				<Field label={m['filament.fields.colorHex']()}>
					<span class="color-row">
						<Swatch colors={filament.colors} size={11} radius={3} />
						<span class="mono"
							>{filament.colors.length > 1
								? m['inspector.multi']({ count: filament.colors.length })
								: filament.colors[0].toUpperCase()}</span
						>
					</span>
				</Field>
				<Field label={m['filament.fields.diameter']()} mono>{filament.diameter} mm</Field>
				<Field label={m['filament.fields.density']()} mono>{filament.density} g/cm³</Field>
				<Field label={m['inspector.nozzleBed']()} mono>{filament.nozzleTemp}° / {filament.bedTemp}°</Field>
				<Field label={m['inspector.filamentWeight']()} mono>{filament.weight} g</Field>
				{#if filament.spoolWeight}
					<Field label={m['vendor.fields.emptySpoolWeight']()} mono>{filament.spoolWeight} g</Field>
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
		background: var(--track);
		margin-top: 12px;
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 4px;
		background: linear-gradient(90deg, var(--accent), var(--accent-hover));
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
		color: var(--accent-muted-2);
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
