<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Every href below comes from a src/lib/library/params.ts helper, which already
	   resolves against the deploy base path; resolving again would double-apply it. */
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import NumberInput from '../NumberInput.svelte';
	import EditableField from '../EditableField.svelte';
	import Combobox from '../Combobox.svelte';
	import Scale from '@lucide/svelte/icons/scale';
	import Printer from '@lucide/svelte/icons/printer';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import DateTimeField from '../DateTimeField.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import LinkedText from '../LinkedText.svelte';
	import VendorSection from './VendorSection.svelte';
	import ChangeFilamentModal from './ChangeFilamentModal.svelte';
	import NfcBindModal from './NfcBindModal.svelte';
	import NfcWriteModal from './NfcWriteModal.svelte';
	import OverrideMark from './OverrideMark.svelte';
	import Nfc from '@lucide/svelte/icons/nfc';
	import Link from '@lucide/svelte/icons/link';
	import type { Filament, Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import * as params from '$lib/library/params';
	import { lengthMeters, pct, weightAuto } from '$lib/utils/format';
	import { usageLabel } from '$lib/utils/library';
	import { spoolSource } from '$lib/api/spoolSource';
	import { classifyDeleteFailure } from '$lib/library/deletion';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';
	import { trackSave } from '$lib/utils/autosave';
	import { page } from '$app/state';
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
		comment: '',
		registeredLabel: '',
		extra: {}
	};

	let filament = $derived(inventory.filamentById(spool.filamentId) ?? MISSING_FIL);
	// Undefined when the filament has no manufacturer set (or it isn't cached yet) —
	// the display falls back to a plain "no manufacturer" note instead of a link.
	let vendor = $derived(inventory.vendorById(filament.vendorId));
	let used = $derived(spool.initial - spool.remaining);

	// --- inherited fields ---------------------------------------------------
	// Full weight, tare weight and price each exist on both a spool and its
	// filament, and the spool's own value wins wherever it has one. Which of the
	// two is actually in force used to be invisible here — the case behind #1013,
	// where a spool kept the tare weight it was created with, this panel showed the
	// filament's newer one, and "adjust by measured weight" subtracted neither of
	// the numbers on screen. So both ends are marked: the spool's fields say what
	// they shadow, and the filament's below say what applies instead.
	//
	// Only where the two actually disagree, though. Merely *having* a value of its
	// own is already visible — the field holds a number instead of showing the
	// filament's as its placeholder — and the API gives every spool it creates a copy
	// of the filament's figures, so marking those too would annotate almost every
	// spool and teach everyone to stop reading the marks.
	const grams = (n: number) => `${n} g`;
	const differs = (own: number | undefined, inherited: number | undefined) =>
		own != null && inherited != null && own !== inherited;

	let weightOverride = $derived(
		differs(spool.initialOverride, filament.weight)
			? m['inspector.override.overridesFilament']({ value: grams(filament.weight) })
			: undefined
	);
	let tareOverride = $derived(
		differs(spool.spoolWeight, filament.spoolWeight)
			? m['inspector.override.overridesFilament']({ value: grams(filament.spoolWeight!) })
			: undefined
	);
	let priceOverride = $derived(
		differs(spool.price, filament.price)
			? m['inspector.override.overridesFilament']({ value: settings.formatPrice(filament.price) })
			: undefined
	);
	/** The same three disagreements, phrased for the filament's own rows below. */
	let shadowedBySpool = $derived({
		weight: weightOverride ? grams(spool.initialOverride!) : undefined,
		tare: tareOverride ? grams(spool.spoolWeight!) : undefined,
		price: priceOverride ? settings.formatPrice(spool.price!) : undefined
	});
	// The manufacturer's empty-spool weight seeds new filaments rather than being a
	// live fallback, so its row names whichever nearer level holds the value that
	// ends up applying — this spool's if it has one, otherwise the filament's.
	let effectiveTare = $derived(spool.spoolWeight ?? filament.spoolWeight);
	let vendorTareShadowedBy = $derived(
		!differs(effectiveTare, vendor?.emptyWeight)
			? undefined
			: spool.spoolWeight != null
				? m['inspector.override.bySpool']({ value: grams(spool.spoolWeight) })
				: m['inspector.override.byFilament']({ value: grams(filament.spoolWeight!) })
	);

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
	const saver = makeSaver<number, Partial<Spool>>((id, patch) => trackSave(spoolSource.saveSpool(id, patch)));
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
	// Optimistic flip, then persist. The list filters archived spools out by
	// default, so unarchiving from here is the only way back once one is hidden.
	function toggleArchived() {
		const next = !spool.archived;
		inventory.patchSpool(spool.id, { archived: next });
		spoolSource.setSpoolArchived(spool.id, next).catch((e) => {
			inventory.patchSpool(spool.id, { archived: !next });
			console.error('Archive toggle failed', e);
		});
	}

	function set(patch: Partial<Spool>) {
		inventory.patchSpool(spool.id, patch);
		saver.push(spool.id, patch);
	}

	/**
	 * Set (or, with `undefined`, clear) the spool's own full weight.
	 *
	 * Not a plain `set`: the gauge and the remaining weight are computed from the
	 * *effective* full weight, so the cache needs those refreshed too — mirroring
	 * `Spool.from_db`'s formula, clamp included, the same way the filament fan-out
	 * in the inventory store does. Only the override itself is sent, because
	 * `remaining` maps to `remaining_weight`, which would rewrite the used weight.
	 */
	function setFullWeight(v: number | undefined) {
		const effective = v ?? filament.weight;
		inventory.patchSpool(spool.id, {
			initialOverride: v,
			initial: effective,
			remaining: Math.max(effective - spool.usedWeight, 0)
		});
		saver.push(spool.id, { initial: v });
	}

	const extraSaver = makeExtraSaver(
		() => spool.id,
		(id, e) => inventory.patchSpool(id, { extra: e }),
		(id, p) => trackSave(spoolSource.saveSpool(id, { extra: p })),
		() => spool.extra
	);
	$effect(() => () => extraSaver.flush());

	// --- delete -------------------------------------------------------------

	// Nothing references a spool, so unlike a filament this can never be refused.
	// It is also what unblocks deleting a filament, since archiving leaves the
	// foreign key in place. Warn when there is filament left on it, because at that
	// point archiving is almost certainly what was meant.
	let confirmOpen = $state(false);
	let deleting = $state(false);

	// --- change filament ----------------------------------------------------
	// Kept out of the inline-edit path: swapping the filament moves the spool's
	// full weight with it, so it gets a dialog that says what will happen instead
	// of a debounced autosave (#1010).
	let changeFilamentOpen = $state(false);

	// --- NFC bind / write -----------------------------------------------------
	// Always offered, regardless of detected hardware: the write modal's
	// "download raw binary" option works with neither a server reader nor Web
	// NFC, and each modal disables the paths that don't apply.
	let nfcBindOpen = $state(false);
	let nfcWriteOpen = $state(false);

	let confirmLines = $derived(
		spool.remaining > 0
			? [
					m['inspector.delete.spoolBody']({ id: spool.id, name: filament.name }),
					m['inspector.delete.spoolRemaining']({ weight: weightAuto(spool.remaining) })
				]
			: [m['inspector.delete.spoolBody']({ id: spool.id, name: filament.name })]
	);

	async function remove() {
		deleting = true;
		// The pending edit belongs to a spool that is about to stop existing.
		saver.cancel();
		extraSaver.cancel();
		try {
			await spoolSource.deleteSpool(spool.id);
			toasts.success(m['inspector.delete.spoolDone']());
			params.clearSelection();
		} catch (e) {
			console.error('Failed to delete spool', e);
			if (classifyDeleteFailure(e) === 'gone') {
				toasts.error(m['inspector.delete.errorGone']());
				inventory.removeSpool(spool.id);
				params.clearSelection();
			} else {
				toasts.error(m['inspector.delete.errorUnknown']());
			}
		} finally {
			deleting = false;
			confirmOpen = false;
		}
	}
</script>

<div class="insp">
	<Breadcrumbs
		items={[
			vendor
				? { label: vendor.name, href: params.selectHref(page.url.searchParams, 'vendor', vendor.id) }
				: { label: m['add.noManufacturer'](), muted: true },
			{
				label: filament.name,
				href: params.selectHref(page.url.searchParams, 'filament', filament.id)
			},
			{ label: '#' + spool.id }
		]}
	/>

	<div class="head">
		<Swatch colors={filament.colors} direction={filament.multiColorDirection} size={40} radius={9} />
		<div class="titles">
			<div class="title">
				{#if vendor}{vendor.name}{/if}
				{filament.name}
				<span class="idmono mono">#{spool.id}</span>
				{#if spool.archived}<span class="arch-badge">{m['spool.fields.archived']()}</span>{/if}
			</div>
			<div class="subtitle">
				{filament.material} · {filament.diameter} mm · {usageLabel(spool)}
			</div>
		</div>
		<div class="actions">
			<Button variant="outline" onclick={openAdjust} title={m['inspector.adjustWeight']()}
				><Scale size={15} /> <span class="btn-label">{m['inspector.adjustWeight']()}</span></Button
			>
			<Button
				variant="outline"
				href={resolve(`/labels?spools=${spool.id}`)}
				title={m['printing.qrcode.button']()}
				><Printer size={15} /> <span class="btn-label">{m['printing.qrcode.button']()}</span></Button
			>
			<Button
				variant="outline"
				onclick={toggleArchived}
				title={spool.archived ? m['buttons.unArchive']() : m['buttons.archive']()}
			>
				{#if spool.archived}<ArchiveRestore size={15} />
					<span class="btn-label">{m['buttons.unArchive']()}</span>
				{:else}<Archive size={15} /> <span class="btn-label">{m['buttons.archive']()}</span>{/if}
			</Button>
			<Button variant="outline" onclick={() => (nfcBindOpen = true)} title={m['nfc.bindButton']()}
				><Link size={15} /> <span class="btn-label">{m['nfc.bindButton']()}</span></Button
			>
			<Button variant="outline" onclick={() => (nfcWriteOpen = true)} title={m['nfc.encodeButton']()}
				><Nfc size={15} /> <span class="btn-label">{m['nfc.encodeButton']()}</span></Button
			>
			<!-- Set apart from the things you do to a spool you are keeping. -->
			<span class="sep" aria-hidden="true"></span>
			<Button
				variant="danger-ghost"
				title={m['inspector.delete.spool']()}
				ariaLabel={m['inspector.delete.spool']()}
				disabled={deleting}
				onclick={() => (confirmOpen = true)}><Trash2 size={15} /></Button
			>
		</div>
	</div>

	<ConfirmDialog
		open={confirmOpen}
		busy={deleting}
		title={m['inspector.delete.spoolTitle']()}
		lines={confirmLines}
		confirmLabel={deleting ? m['inspector.delete.deleting']() : m['buttons.delete']()}
		onconfirm={remove}
		onclose={() => (confirmOpen = false)}
	/>

	<ChangeFilamentModal
		open={changeFilamentOpen}
		{spool}
		current={filament}
		onclose={() => (changeFilamentOpen = false)}
	/>

	<NfcBindModal open={nfcBindOpen} {spool} onclose={() => (nfcBindOpen = false)} />

	<NfcWriteModal open={nfcWriteOpen} {spool} {filament} onclose={() => (nfcWriteOpen = false)} />

	<div class="gauge">
		<div class="gauge-line">
			<span class="big mono">{weightAuto(spool.remaining)}</span>
			<span class="of"
				>{m['inspector.ofRemaining']({
					weight: weightAuto(spool.initial),
					length: lengthMeters(spool.remaining, filament).toFixed(0)
				})}</span
			>
			<span class="used">{m['inspector.used']()} <span class="mono">{weightAuto(used)}</span></span>
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
				<Field label={m['spool.fields.location']()} help={m['spool.fieldsHelp.location']()}>
					<Combobox
						value={spool.location}
						placeholder={m['library.noLocation']()}
						options={locationOptions}
						underline
						oninput={(v) => set({ location: v })}
					/>
				</Field>
				<Field label={m['spool.fields.lotNr']()} help={m['spool.fieldsHelp.lotNr']()}>
					<EditableField value={spool.lot} mono oninput={(v) => set({ lot: v })} />
				</Field>
				<!-- Blank in any of the three below means "follow the filament", which is
				     what `onclear` restores; the placeholder is the value that then applies. -->
				<Field label={m['spool.fields.weight']()} help={m['spool.fieldsHelp.weight']()}>
					<NumberInput
						dense
						width="285px"
						unit="g"
						step={50}
						min={0}
						placeholder={m['inspector.defaultFrom.filament']({ value: String(filament.weight) })}
						value={spool.initialOverride ?? ''}
						onchange={(v) => setFullWeight(v)}
						onclear={() => setFullWeight(undefined)}
					/>
					{#if weightOverride}<OverrideMark label={weightOverride} />{/if}
				</Field>
				<Field label={m['spool.fields.spoolWeight']()} help={m['spool.fieldsHelp.spoolWeight']()}>
					<NumberInput
						dense
						width="285px"
						unit="g"
						step={10}
						min={0}
						placeholder={filament.spoolWeight != null
							? m['inspector.defaultFrom.filament']({ value: String(filament.spoolWeight) })
							: '—'}
						value={spool.spoolWeight ?? ''}
						onchange={(v) => set({ spoolWeight: v })}
						onclear={() => set({ spoolWeight: undefined })}
					/>
					{#if tareOverride}<OverrideMark label={tareOverride} />{/if}
				</Field>
				<Field label={m['spool.fields.price']()} help={m['spool.fieldsHelp.price']()}>
					<NumberInput
						dense
						width="285px"
						unit={settings.currencySymbol}
						min={0}
						placeholder={m['inspector.defaultFrom.filament']({
							value: settings.formatPriceValue(filament.price)
						})}
						value={spool.price ?? ''}
						onchange={(v) => set({ price: v })}
						onclear={() => set({ price: undefined })}
					/>
					{#if priceOverride}<OverrideMark label={priceOverride} />{/if}
				</Field>
				<Field label={m['spool.fields.registered']()}>{spool.registeredLabel}</Field>
				<Field label={m['spool.fields.firstUsed']()}>
					<DateTimeField value={spool.firstUsed} oninput={(iso) => set({ firstUsed: iso })} />
				</Field>
				<Field label={m['spool.fields.lastUsed']()}>
					<DateTimeField value={spool.lastUsed} oninput={(iso) => set({ lastUsed: iso })} />
				</Field>
				<Field label={m['spool.fields.comment']()}>
					<EditableField value={spool.comment} linkify oninput={(v) => set({ comment: v })} />
				</Field>
			</FieldGrid>

			<ExtraFieldsSection entity="spool" extra={spool.extra} onchange={extraSaver.change} manage />
		</div>

		<div class="col">
			<SectionLabel>
				{m['library.section.filament']()}
				{#snippet right()}
					<span class="sec-actions">
						<button class="link" onclick={() => (changeFilamentOpen = true)}
							><ArrowLeftRight size={13} /> {m['changeFilament.action']()}</button
						>
						<a
							class="link"
							href={params.selectHref(page.url.searchParams, 'filament', filament.id)}
							data-sveltekit-keepfocus
							data-sveltekit-noscroll>{m['inspector.openFilament']()} <ArrowRight size={13} /></a
						>
					</span>
				{/snippet}
			</SectionLabel>
			<FieldGrid>
				<Field label={m['filament.fields.material']()}>{filament.material}</Field>
				<Field label={m['filament.fields.colorHex']()}>
					<span class="color-row">
						<Swatch colors={filament.colors} direction={filament.multiColorDirection} size={11} radius={3} />
						<span class="mono"
							>{filament.colors.length > 1
								? m['inspector.multi']({ count: filament.colors.length })
								: (filament.colors[0]?.toUpperCase() ?? '—')}</span
						>
					</span>
				</Field>
				<Field label={m['filament.fields.diameter']()} mono>{filament.diameter} mm</Field>
				<Field label={m['filament.fields.density']()} mono>{filament.density} g/cm³</Field>
				<Field label={m['filament.fields.settingsExtruderTemp']()} mono>{filament.nozzleTemp} °C</Field>
				<Field label={m['filament.fields.settingsBedTemp']()} mono>{filament.bedTemp} °C</Field>
				<!-- These three are the filament's side of the overridable fields above.
				     A value the spool has replaced is dimmed and says which one applies,
				     so this column can never be read as the figure in use. -->
				<Field label={m['filament.fields.weight']()} help={m['filament.fieldsHelp.weight']()} mono>
					<span class:shadowed={shadowedBySpool.weight}>{filament.weight} g</span>
					{#if shadowedBySpool.weight}
						<OverrideMark label={m['inspector.override.bySpool']({ value: shadowedBySpool.weight })} />
					{/if}
				</Field>
				<Field label={m['filament.fields.spoolWeight']()} help={m['filament.fieldsHelp.spoolWeight']()} mono>
					<span class:shadowed={shadowedBySpool.tare}
						>{filament.spoolWeight != null ? `${filament.spoolWeight} g` : '—'}</span
					>
					{#if shadowedBySpool.tare}
						<OverrideMark label={m['inspector.override.bySpool']({ value: shadowedBySpool.tare })} />
					{/if}
				</Field>
				<Field label={m['filament.fields.price']()} mono>
					<span class:shadowed={shadowedBySpool.price}>{settings.formatPrice(filament.price)}</span>
					{#if shadowedBySpool.price}
						<OverrideMark label={m['inspector.override.bySpool']({ value: shadowedBySpool.price })} />
					{/if}
				</Field>
				<Field
					label={m['filament.fields.articleNumber']()}
					help={m['filament.fieldsHelp.articleNumber']()}
					mono>{filament.articleNumber || '—'}</Field
				>
				{#if filament.externalId}
					<Field label={m['filament.fields.externalId']()} mono>{filament.externalId}</Field>
				{/if}
				<Field label={m['filament.fields.registered']()}>{filament.registeredLabel}</Field>
				<Field label={m['filament.fields.comment']()}><LinkedText text={filament.comment} /></Field>
				<!-- The filament's own custom fields, as further rows of this grid: a
				     second "Extra fields" heading here would read as a peer of FILAMENT
				     and MANUFACTURER rather than as more of the filament. -->
				<ExtraFieldsSection entity="filament" extra={filament.extra} onchange={() => {}} readonly headless />
			</FieldGrid>

			<VendorSection
				{vendor}
				href={vendor ? params.selectHref(page.url.searchParams, 'vendor', vendor.id) : undefined}
				emptyWeightShadowedBy={vendorTareShadowedBy}
			/>
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
	.arch-badge {
		font-size: 9.5px;
		font-weight: 600;
		vertical-align: middle;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
		margin-left: 4px;
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}
	/* A filament value this spool has replaced: struck through rather than hidden,
	   so the inherited chain stays readable while making clear it is not in force. */
	.shadowed {
		color: var(--text-dim);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
		opacity: 0.7;
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 8px;
		flex: none;
	}
	.sep {
		width: 1px;
		align-self: stretch;
		margin: 4px 0 4px 2px;
		background: var(--border);
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
		background: var(--accent-fill);
		border-color: var(--accent-fill);
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
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11.5px;
		color: var(--accent-link);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		text-decoration: none;
	}
	.sec-actions {
		display: inline-flex;
		align-items: center;
		gap: 14px;
	}

	@container (max-width: 760px) {
		.grid {
			grid-template-columns: 1fr;
		}
		/* Keep the spool actions (adjust weight / print / archive) reachable on
		   narrow panels — including the mobile bottom sheet — by wrapping them onto
		   their own full-width row under the title instead of hiding them. */
		.head {
			flex-wrap: wrap;
		}
		.titles {
			flex: 1;
		}
		.actions {
			margin-left: 0;
			flex-basis: 100%;
			gap: 8px;
		}
	}

	/* Very narrow panels (e.g. the mobile bottom sheet) can't fit three labelled
	   buttons on one row without wrapping to a second, so drop the labels to icons.
	   The label text is only visually hidden — it stays in the accessibility tree,
	   so each button keeps its name — and min-width keeps a comfortable tap area. */
	@container (max-width: 560px) {
		.actions .btn-label {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
			border: 0;
		}
		.actions :global(.btn) {
			min-width: 44px;
			justify-content: center;
		}
	}
</style>
