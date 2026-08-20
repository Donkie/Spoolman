<script lang="ts">
	// The "describe a filament that doesn't exist yet" form, as a pair of cards.
	//
	// Two dialogs need it: the add-spools flow, where it is step 2's first half, and
	// the change-filament dialog, where refilling a shelf slot with something new is
	// the whole point (issue #1010). Keeping it here means the layout that makes the
	// flow legible — one card per record about to be created, so it is never a
	// mystery which record a field lands on (#1038) — holds in both places.
	//
	// The manufacturer gets its own card because it is its own record: a vendor
	// combobox sitting among the filament fields, quietly creating a second entity,
	// was the most confusing part of the flow.
	//
	// Validation is drawn here but decided by the caller: `err` says what to show for
	// a field and `touch` records that it has been left, so the caller keeps its own
	// policy for when an error is revealed (see AddSpoolModal's `touched`/`attempted`).
	// This component only reports and displays.
	import ColorEditor from './ColorEditor.svelte';
	import NumberInput from './NumberInput.svelte';
	import Combobox from './Combobox.svelte';
	import ExtraFieldsSection from './ExtraFieldsSection.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Extra, Filament } from '$lib/types';
	import type { FilamentDraft, FilamentWeights } from '$lib/filament/draft';
	import { applyMaterialSpec } from '$lib/filament/draft';
	import { spoolSource } from '$lib/api/spoolSource';
	import { settings } from '$lib/stores/settings.svelte';
	import { loadMaterials, type MaterialSpec } from '$lib/data/materials';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		draft: FilamentDraft;
		/** The error to display for a field, or '' — the caller decides what is revealed. */
		err: (key: string) => string;
		/** Called when a field is left, so the caller can start revealing its error. */
		touch: (key: string) => void;
		/** Custom-field values for the filament being created. */
		extra: Extra;
		onextra: (key: string, json: string | undefined) => void;
		/**
		 * Custom-field values for a manufacturer this form would create. Only drawn
		 * while the typed name is a new one: linking an existing manufacturer must
		 * never offer to rewrite its values (#1055).
		 */
		vendorExtra: Extra;
		onVendorExtra: (key: string, json: string | undefined) => void;
		/** Whether the typed manufacturer name will create a record. Read-only to callers. */
		vendorIsNew?: boolean;
		/** Open the specs block. Callers set it when the draft came from a real filament. */
		showAdvanced: boolean;
		/** The filament this draft was copied from, if any — drives the heading and nudges. */
		cloneSource?: Filament | null;
		/**
		 * Weight, spool weight and price. Only drawn — and so only worth passing —
		 * when `showWeights`: the add-spools flow writes each of them to the spool it
		 * creates as well as to the filament, so it shows them in its spool block.
		 */
		weights?: FilamentWeights;
		showWeights?: boolean;
		/** Escape hatch in the filament card's heading, e.g. back to picking an existing one. */
		backLabel?: string;
		onback?: () => void;
	}
	let {
		draft = $bindable(),
		err,
		touch,
		extra,
		onextra,
		vendorExtra,
		onVendorExtra,
		vendorIsNew = $bindable(false),
		showAdvanced = $bindable(),
		cloneSource = null,
		weights = $bindable({ weight: '', spoolWeight: '', price: '' }),
		showWeights = false,
		backLabel,
		onback
	}: Props = $props();

	let nameInput = $state<HTMLInputElement | undefined>();
	let vendorNames = $state<string[]>([]);
	let materialNames = $state<string[]>([]);
	let materialSpecs = $state<Record<string, MaterialSpec>>({});

	spoolSource
		.vendorNames()
		.then((vn) => (vendorNames = vn))
		.catch(() => {});
	loadMaterials()
		.then(({ names, specs }) => {
			materialNames = names;
			materialSpecs = specs;
		})
		.catch(() => {});

	// Vendor combobox: reuse an existing vendor if the name matches, else create.
	let vendorTrimmed = $derived(draft.vendorName.trim());
	let vendorMatch = $derived(vendorNames.find((v) => v.toLowerCase() === vendorTrimmed.toLowerCase()));
	let vendorHint = $derived(
		vendorTrimmed === ''
			? m['add.vendorHint.optional']()
			: vendorMatch
				? m['add.vendorHint.existing']({ name: vendorMatch })
				: m['add.vendorHint.new']({ name: vendorTrimmed })
	);
	// Accents the manufacturer hint when the typed name will create a second record
	// alongside the filament, rather than link an existing one. Written back to the
	// caller, which needs it to decide whether the vendor's fields are sent at all.
	$effect(() => {
		vendorIsNew = vendorTrimmed !== '' && !vendorMatch;
	});
	// Nudge, not an error: Spoolman allows same-named filaments, but keeping the
	// original's name on a duplicate is almost always an oversight.
	let nameStillSource = $derived(!!cloneSource && draft.name.trim() === cloneSource.name.trim());

	// When duplicating, the name is the one field that must change, so put the
	// caret in it (at the end — the colour word is usually a suffix, and the rest
	// of the name is worth keeping rather than retyping).
	$effect(() => {
		if (cloneSource && nameInput) {
			nameInput.focus();
			nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
		}
	});
</script>

<!-- The one marker for "this must be filled in", used on every required field and
     on nothing else. It is decoration: the control itself carries aria-required, so
     screen readers hear the requirement rather than an asterisk. -->
{#snippet req()}<span class="req" title={m['validation.required']()} aria-hidden="true">*</span>{/snippet}

<section class="new-section man-section">
	<label class="ent-field" data-field="vendor" onfocusout={() => touch('vendor')}>
		<span class="ent-label">{m['add.section.manufacturer']()}</span>
		<span class="ent-note">{m['add.section.manufacturerNote']()}</span>
		<Combobox
			value={draft.vendorName}
			options={vendorNames}
			placeholder={m['add.manufacturerPlaceholder']()}
			invalid={!!err('vendor')}
			oninput={(v) => (draft.vendorName = v)}
		/>
		{#if err('vendor')}
			<span class="err">{err('vendor')}</span>
		{:else}
			<span class="hint" class:accent={vendorIsNew}>{vendorHint}</span>
		{/if}
	</label>
	<!-- Outside the <label> above: these are inputs of their own, and only shown
	     while the typed name will create a manufacturer. Linking an existing one
	     must not offer to rewrite its custom fields (#1055). -->
	{#if vendorIsNew}
		<ExtraFieldsSection entity="vendor" extra={vendorExtra} onchange={onVendorExtra} />
	{/if}
</section>
<section class="new-section">
	<div class="fs-head">
		<span class="ent-label">{m['add.section.filament']()}</span>
		{#if backLabel && onback}
			<button class="fs-back" onclick={onback}>{backLabel}</button>
		{/if}
	</div>
	<div class="fs-title">
		{cloneSource ? m['add.duplicateTitle']({ name: cloneSource.name }) : m['add.newFilamentTitle']()}
	</div>
	<div class="ent-note">
		{cloneSource ? m['add.duplicateNote']() : m['add.section.filamentNote']()}
	</div>
	<div class="form">
		<label class="wide" data-field="name" onfocusout={() => touch('name')}>
			{m['filament.fields.name']()}
			{@render req()}
			<input
				bind:this={nameInput}
				bind:value={draft.name}
				placeholder={m['add.filamentNamePlaceholder']()}
				aria-required="true"
				aria-invalid={!!err('name')}
				class:invalid={!!err('name')}
			/>
			<!-- The rename nudge only outranks the naming hint while the copy still
			     carries the original's name; after that both cases get the same
			     advice, since color is what makes a filament name useful. -->
			{#if err('name')}<span class="err">{err('name')}</span>
			{:else if nameStillSource}<span class="hint accent">{m['add.duplicateRename']()}</span>
			{:else}<span class="hint">{m['add.nameHint']()}</span>{/if}
		</label>
		<label data-field="material" onfocusout={() => touch('material')}>
			{m['filament.fields.material']()}
			{@render req()}
			<Combobox
				value={draft.material}
				options={materialNames}
				placeholder="PLA"
				required
				invalid={!!err('material')}
				oninput={(v) => applyMaterialSpec(draft, v, materialSpecs)}
			/>
			{#if err('material')}<span class="err">{err('material')}</span>{/if}
		</label>
		{#if showWeights}
			<!-- Only shown where this form is the only thing being filled in: how much
			     filament a full spool holds is the number the rest of the app measures
			     against, so it belongs beside the name rather than under "advanced". -->
			<label data-field="netWeight" onfocusout={() => touch('netWeight')}>
				{m['filament.fields.weight']()}
				<NumberInput bind:value={weights.weight} min={0} unit="g" spaced invalid={!!err('netWeight')} />
				{#if err('netWeight')}<span class="err">{err('netWeight')}</span>{/if}
			</label>
		{/if}
		<label class="color-field wide" data-field="colorHex" onfocusout={() => touch('colorHex')}>
			{m['filament.fields.colorHex']()}
			<div class="color-editor-wrap">
				<ColorEditor
					colors={draft.colors}
					direction={draft.multiColorDirection}
					onchange={(v) => {
						draft.colors = v.colors;
						draft.multiColorDirection = v.direction;
					}}
				/>
			</div>
			{#if err('colorHex')}<span class="err">{err('colorHex')}</span>{/if}
		</label>
	</div>
	<button class="adv-toggle" onclick={() => (showAdvanced = !showAdvanced)}>
		{#if showAdvanced}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
		{m['add.advanced']()}
		{#if !showAdvanced}<span class="adv-note">{m['add.advancedNote']()}</span>{/if}
	</button>
	{#if showAdvanced}
		<div class="form">
			<label data-field="density" onfocusout={() => touch('density')}
				>{m['filament.fields.density']()}
				{@render req()}
				<NumberInput
					bind:value={draft.density}
					min={0}
					step={0.01}
					unit="g/cm³"
					spaced
					required
					invalid={!!err('density')}
				/>
				{#if err('density')}<span class="err">{err('density')}</span>{/if}
			</label>
			<label data-field="diameter" onfocusout={() => touch('diameter')}
				>{m['filament.fields.diameter']()}
				{@render req()}
				<NumberInput
					bind:value={draft.diameter}
					min={0}
					step={0.05}
					unit="mm"
					spaced
					required
					invalid={!!err('diameter')}
				/>
				{#if err('diameter')}<span class="err">{err('diameter')}</span>{/if}
			</label>
			<label data-field="nozzleTemp" onfocusout={() => touch('nozzleTemp')}
				>{m['filament.fields.settingsExtruderTemp']()}
				<NumberInput
					bind:value={draft.nozzleTemp}
					min={0}
					step={5}
					unit="°C"
					placeholder="—"
					spaced
					invalid={!!err('nozzleTemp')}
				/>
				{#if err('nozzleTemp')}<span class="err">{err('nozzleTemp')}</span>{/if}
			</label>
			<label data-field="bedTemp" onfocusout={() => touch('bedTemp')}
				>{m['filament.fields.settingsBedTemp']()}
				<NumberInput
					bind:value={draft.bedTemp}
					min={0}
					step={5}
					unit="°C"
					placeholder="—"
					spaced
					invalid={!!err('bedTemp')}
				/>
				{#if err('bedTemp')}<span class="err">{err('bedTemp')}</span>{/if}
			</label>
			{#if showWeights}
				<label data-field="spoolWeight" onfocusout={() => touch('spoolWeight')}
					>{m['filament.fields.spoolWeight']()}
					<NumberInput
						bind:value={weights.spoolWeight}
						min={0}
						unit="g"
						placeholder="—"
						spaced
						invalid={!!err('spoolWeight')}
					/>
					{#if err('spoolWeight')}<span class="err">{err('spoolWeight')}</span>{/if}
				</label>
				<label data-field="price" onfocusout={() => touch('price')}
					>{m['filament.fields.price']()} <span class="u">{settings.currency}</span>
					<NumberInput bind:value={weights.price} min={0} placeholder="—" spaced invalid={!!err('price')} />
					{#if err('price')}<span class="err">{err('price')}</span>{/if}
				</label>
			{/if}
			<label>
				{m['filament.fields.articleNumber']()}
				<input class="mono" bind:value={draft.articleNumber} placeholder="—" />
			</label>
			<label class="wide">
				{m['filament.fields.comment']()}
				<input bind:value={draft.comment} placeholder="—" />
			</label>
		</div>
	{/if}
	<!-- Outside the advanced block: a custom field only exists because someone
	     defined it, so it isn't an advanced detail to them. The section renders
	     nothing when no filament fields are defined. -->
	<ExtraFieldsSection entity="filament" {extra} onchange={onextra} />
</section>

<style>
	/* One card per record this flow will create. Whether the manufacturer is a new
	   one or an existing one being linked is left to the accent hint under the
	   field: --accent-border is lighter than --border-strong in the light theme, so
	   swapping borders to mark "new" would read as less emphasis, not more. */
	.new-section {
		background: var(--surface);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-md);
		padding: 12px 14px;
	}
	.man-section + .new-section {
		margin-top: 10px;
	}
	/* The manufacturer block holds a single field, so its heading is that field's
	   <label> — one accessible name, no heading/label echo. */
	.ent-field {
		display: block;
	}
	.ent-label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
	}
	.ent-note {
		display: block;
		font-size: 11.5px;
		color: var(--text-faint);
		margin: 2px 0 8px;
	}
	.fs-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.fs-title {
		font-weight: 600;
		font-size: 13px;
		margin-top: 2px;
	}
	.fs-back {
		margin-left: auto;
		font-size: 12px;
		color: var(--accent-link);
		background: none;
		border: none;
		cursor: pointer;
	}
	.color-editor-wrap {
		margin-top: 6px;
	}
	.adv-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		background: none;
		border: none;
		color: var(--accent-link);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
		padding: 0;
	}
	.adv-note {
		color: var(--text-faint);
	}
	.form {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 12px;
		margin-top: 14px;
	}
	.form label {
		display: block;
		font-size: 11.5px;
		color: var(--text-muted);
	}
	.form label.wide {
		grid-column: 1 / -1;
	}
	.u {
		color: var(--text-faint);
	}
	.form input {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		padding: 9px 12px;
		color: var(--text);
		font-size: 13px;
		margin-top: 5px;
	}
	.form input:focus {
		border-color: var(--accent);
	}
	.form input.invalid {
		border-color: var(--danger);
	}
	.err {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--danger-soft);
	}
	.req {
		color: var(--accent-soft);
	}
	.hint {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--text-faint);
	}
	.hint.accent {
		color: var(--accent-soft);
	}
	@media (max-width: 620px) {
		.form {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
