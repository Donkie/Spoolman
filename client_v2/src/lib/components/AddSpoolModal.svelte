<script lang="ts">
	import Swatch from './Swatch.svelte';
	import Button from './Button.svelte';
	import NumberInput from './NumberInput.svelte';
	import DateTimeField from './DateTimeField.svelte';
	import ExtraFieldsSection from './ExtraFieldsSection.svelte';
	import type { Filament, Extra } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource, type NewFilamentDraft } from '$lib/api/spoolSource';
	import { fields } from '$lib/stores/fields.svelte';
	import { externalColors, getExternalMaterials, type ExternalFilament } from '$lib/api/external';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		/** When set, open straight to step 2 with this local filament chosen. */
		presetFilamentId?: string | null;
		onclose?: () => void;
	}
	let { open, presetFilamentId = null, onclose }: Props = $props();

	// A chosen filament is one from the local catalog, a SpoolmanDB entry, or —
	// when `creating` — a brand-new filament described by the `nf` form.
	type Choice = { source: 'catalog'; filament: Filament } | { source: 'external'; ext: ExternalFilament };

	let step = $state<1 | 2>(1);
	let query = $state('');
	let localResults = $state<Filament[]>([]);
	let externalResults = $state<ExternalFilament[]>([]);
	let searching = $state(false);
	let extError = $state(false);
	let chosen = $state<Choice | null>(null);
	let creating = $state(false);
	let submitting = $state(false);
	let locations = $state<string[]>([]);

	// New-filament fields + lookups for the combobox / auto-fill.
	let nf = $state({
		vendorName: '',
		name: '',
		material: '',
		colorHex: '',
		density: '',
		diameter: '1.75',
		nozzleTemp: '',
		bedTemp: ''
	});
	let showAdvanced = $state(false);
	let vendorNames = $state<string[]>([]);
	let materialNames = $state<string[]>([]);
	let materialSpecs = $state<Record<string, { density: number; nozzle: number | null; bed: number | null }>>(
		{}
	);

	// Common 3D-printing materials with their typical densities (g/cm³). These are
	// always offered for selection and map to a density, even when SpoolmanDB is
	// unreachable; SpoolmanDB presets (with temps) merge on top where available.
	// Densities are kept in sync with SpoolmanDB's materials.json
	// (https://github.com/Donkie/SpoolmanDB/blob/main/materials.json) — note the
	// merge only overrides on exact (lowercased) name match, so SpoolmanDB's
	// longer names (e.g. "Flexible (TPU)", "Polycarbonate (PC)") won't refine
	// these short keys at runtime; the values below must match on their own.
	const COMMON_MATERIALS: { name: string; density: number }[] = [
		{ name: 'PLA', density: 1.24 },
		{ name: 'PETG', density: 1.27 },
		{ name: 'ABS', density: 1.04 },
		{ name: 'ASA', density: 1.05 },
		{ name: 'TPU', density: 1.21 },
		{ name: 'Nylon', density: 1.52 },
		{ name: 'PC', density: 1.3 },
		{ name: 'PVA', density: 1.23 },
		{ name: 'HIPS', density: 1.03 },
		{ name: 'PP', density: 0.9 }
	];

	// --- display helpers for a chosen (existing) filament ------------------
	function cName(c: Choice) {
		return c.source === 'catalog' ? c.filament.name : c.ext.name;
	}
	function cVendor(c: Choice) {
		return c.source === 'catalog'
			? (inventory.vendorById(c.filament.vendorId)?.name ?? m['add.noManufacturer']())
			: c.ext.manufacturer;
	}
	function cMaterial(c: Choice) {
		return c.source === 'catalog' ? c.filament.material : c.ext.material;
	}
	function cColors(c: Choice) {
		return c.source === 'catalog' ? c.filament.colors : externalColors(c.ext);
	}
	function cWeight(c: Choice) {
		return c.source === 'catalog' ? c.filament.weight : c.ext.weight;
	}
	function cSpoolWeight(c: Choice): number | undefined {
		if (c.source === 'external') return c.ext.spool_weight;
		return c.filament.spoolWeight ?? inventory.vendorById(c.filament.vendorId)?.emptyWeight;
	}
	function cPrice(c: Choice): number | undefined {
		return c.source === 'catalog' ? c.filament.price : undefined;
	}
	function vendorName(f: Filament): string {
		return inventory.vendorById(f.vendorId)?.name ?? m['add.noManufacturer']();
	}

	// --- search -------------------------------------------------------------
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearch(v: string) {
		query = v;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(runSearch, 250);
	}
	async function runSearch() {
		searching = true;
		extError = false;
		const [local, external] = await Promise.allSettled([
			spoolSource.searchFilaments(query.trim()),
			spoolSource.searchExternalFilaments(query.trim())
		]);
		localResults = local.status === 'fulfilled' ? local.value : [];
		if (external.status === 'fulfilled') externalResults = external.value;
		else {
			externalResults = [];
			extError = true;
		}
		searching = false;
	}

	let initialized = false;
	$effect(() => {
		if (open && !initialized) {
			initialized = true;
			runSearch();
			fields.ensure('spool');
			spoolSource
				.locations()
				.then((l) => (locations = l))
				.catch(() => {});
			Promise.all([
				spoolSource.vendorNames().catch(() => [] as string[]),
				spoolSource.materials().catch(() => [] as string[]),
				getExternalMaterials().catch(() => [])
			]).then(([vn, localMats, extMats]) => {
				vendorNames = vn;
				const specs: typeof materialSpecs = {};
				const names = new Set<string>(localMats);
				// Seed with the built-in common materials first…
				for (const m of COMMON_MATERIALS) {
					specs[m.name.toLowerCase()] = { density: m.density, nozzle: null, bed: null };
					names.add(m.name);
				}
				// …then let SpoolmanDB presets (with temps) refine/extend them.
				for (const m of extMats) {
					specs[m.material.toLowerCase()] = { density: m.density, nozzle: m.extruder_temp, bed: m.bed_temp };
					names.add(m.material);
				}
				materialSpecs = specs;
				materialNames = [...names].sort();
			});
			if (presetFilamentId) {
				const f = inventory.filamentById(presetFilamentId);
				if (f) choose({ source: 'catalog', filament: f });
			}
		} else if (!open) {
			initialized = false;
		}
	});

	// --- spool form ---------------------------------------------------------
	type FillMode = 'full' | 'used' | 'remaining' | 'measured';
	let count = $state('1');
	let countN = $derived(Math.max(1, Math.floor(Number(count) || 1)));
	let netWeight = $state('');
	let spoolWeight = $state('');
	let price = $state('');
	let location = $state('');
	let lot = $state('');
	let comment = $state('');
	let fillMode = $state<FillMode>('full');
	let fillWeight = $state('');

	// Which field's help popup is currently expanded (null = none).
	let openHelp = $state<string | null>(null);
	// Nullable ISO timestamps, driven by the custom DateTimeField picker.
	let firstUsed = $state<string | undefined>(undefined);
	let lastUsed = $state<string | undefined>(undefined);
	let extraValues = $state<Extra>({});

	const FILL_MODES: { key: FillMode; labelKey: () => string }[] = [
		{ key: 'full', labelKey: m['add.fill.full'] },
		{ key: 'used', labelKey: m['spool.fields.usedWeight'] },
		{ key: 'remaining', labelKey: m['spool.fields.remainingWeight'] },
		{ key: 'measured', labelKey: m['spool.fields.measuredWeight'] }
	];
	let fillHelp = $derived(
		fillMode === 'used'
			? m['spool.fieldsHelp.usedWeight']()
			: fillMode === 'remaining'
				? m['spool.fieldsHelp.remainingWeight']()
				: fillMode === 'measured'
					? m['spool.fieldsHelp.measuredWeight']()
					: ''
	);

	function seedExtraDefaults(): Extra {
		const out: Extra = {};
		for (const f of fields.get('spool')) if (f.default_value != null) out[f.key] = f.default_value;
		return out;
	}
	function setExtra(key: string, json: string | undefined) {
		const next = { ...extraValues };
		if (json === undefined) delete next[key];
		else next[key] = json;
		extraValues = next;
	}

	function resetSpoolForm() {
		count = '1';
		location = '';
		lot = '';
		comment = '';
		fillMode = 'full';
		fillWeight = '';
		firstUsed = undefined;
		lastUsed = undefined;
		extraValues = seedExtraDefaults();
	}

	function choose(c: Choice) {
		creating = false;
		chosen = c;
		netWeight = String(cWeight(c) || 1000);
		const sw = cSpoolWeight(c);
		spoolWeight = sw ? String(sw) : '';
		const p = cPrice(c);
		price = p ? String(p) : '';
		resetSpoolForm();
		step = 2;
	}

	function startCreate() {
		creating = true;
		chosen = null;
		showAdvanced = false;
		nf = {
			vendorName: '',
			name: query.trim(),
			material: '',
			colorHex: '',
			density: '',
			diameter: '1.75',
			nozzleTemp: '',
			bedTemp: ''
		};
		netWeight = '1000';
		spoolWeight = '';
		price = '';
		resetSpoolForm();
		step = 2;
	}

	// Vendor combobox: reuse an existing vendor if the name matches, else create.
	let vendorTrimmed = $derived(nf.vendorName.trim());
	let vendorMatch = $derived(vendorNames.find((v) => v.toLowerCase() === vendorTrimmed.toLowerCase()));
	let vendorHint = $derived(
		vendorTrimmed === ''
			? m['add.vendorHint.optional']()
			: vendorMatch
				? m['add.vendorHint.existing']({ name: vendorMatch })
				: m['add.vendorHint.new']({ name: vendorTrimmed })
	);
	function onMaterial(v: string) {
		nf.material = v;
		const spec = materialSpecs[v.trim().toLowerCase()];
		// Only prefill when the material is a known one; typing a custom material
		// leaves density/temps untouched.
		if (spec) {
			nf.density = String(spec.density);
			if (spec.nozzle != null) nf.nozzleTemp = String(spec.nozzle);
			if (spec.bed != null) nf.bedTemp = String(spec.bed);
		}
	}

	// Native color picker <-> hex text field. The picker only speaks #rrggbb, so
	// we feed it the first 6 valid digits and default to grey when the field is
	// empty/invalid; picking writes back an uppercase 6-digit hex.
	let colorPicker = $derived.by(() => {
		const h = nf.colorHex.trim().replace(/^#/, '');
		return /^[0-9a-fA-F]{6}/.test(h) ? '#' + h.slice(0, 6) : '#888888';
	});
	function onColorPick(v: string) {
		nf.colorHex = v.replace(/^#/, '').toUpperCase();
	}

	function reset() {
		step = 1;
		query = '';
		localResults = [];
		externalResults = [];
		chosen = null;
		creating = false;
		submitting = false;
	}
	function close() {
		reset();
		onclose?.();
	}

	async function submit(andAnother = false) {
		if (!canSubmit) return;
		submitting = true;
		try {
			let filamentId: number;
			if (creating) {
				const draft: NewFilamentDraft = {
					name: nf.name.trim(),
					vendorName: nf.vendorName.trim(),
					material: nf.material.trim(),
					density: Number(nf.density),
					diameter: Number(nf.diameter) || 1.75,
					weight: Number(netWeight) || undefined,
					spoolWeight: Number(spoolWeight) || undefined,
					colorHex: nf.colorHex.trim().replace(/^#/, '') || undefined,
					nozzleTemp: nf.nozzleTemp ? Number(nf.nozzleTemp) : undefined,
					bedTemp: nf.bedTemp ? Number(nf.bedTemp) : undefined,
					price: parseFloat(price) || undefined
				};
				const f = await spoolSource.createFilament(draft);
				filamentId = Number(f.id);
			} else if (chosen!.source === 'external') {
				const imported = await spoolSource.importExternalFilament(chosen!.ext);
				filamentId = Number(imported.id);
			} else {
				filamentId = Number(chosen!.filament.id);
			}

			const n = countN;
			const net = Number(netWeight) || 0;
			const spool = Number(spoolWeight) || 0;
			const body: Record<string, unknown> = {
				filament_id: filamentId,
				initial_weight: Number(netWeight) || undefined,
				spool_weight: Number(spoolWeight) || undefined,
				price: parseFloat(price) || undefined,
				location: location.trim() || undefined,
				lot_nr: lot.trim() || undefined,
				comment: comment.trim() || undefined
			};
			if (fillMode === 'used') body.used_weight = Number(fillWeight) || 0;
			else if (fillMode === 'remaining') body.remaining_weight = Number(fillWeight) || 0;
			else if (fillMode === 'measured')
				body.used_weight = Math.max(0, net + spool - (Number(fillWeight) || 0));
			if (firstUsed) body.first_used = firstUsed;
			if (lastUsed) body.last_used = lastUsed;
			if (Object.keys(extraValues).length) body.extra = extraValues;

			for (let i = 0; i < n; i++) await spoolSource.createSpool(body);
			if (andAnother) {
				reset();
				runSearch();
			} else {
				close();
			}
		} catch (e) {
			console.error('Failed to add spools', e);
			submitting = false;
		}
	}

	let targetName = $derived(
		creating ? nf.name.trim() || m['add.newFilament']() : chosen ? cName(chosen) : ''
	);
	let summary = $derived(chosen || creating ? m['add.summary']({ count: countN }) : '');

	// --- validation ---------------------------------------------------------
	// Mirrors the filament creation API (spoolman/api/v1/filament.py):
	// density & diameter are required and must be > 0; name/material ≤ 64 chars;
	// weight > 0, spool_weight/price ≥ 0; color_hex must be 6 or 8 hex chars.
	function numErr(
		v: string,
		{ required = false, min, max, gt }: { required?: boolean; min?: number; max?: number; gt?: number } = {}
	) {
		const t = v.trim();
		if (t === '') return required ? m['validation.required']() : '';
		const n = Number(t);
		if (!Number.isFinite(n)) return m['validation.mustBeNumber']();
		if (gt != null && n <= gt) return m['validation.mustBeGt']({ value: gt });
		if (min != null && n < min) return m['validation.mustBeMin']({ value: min });
		if (max != null && n > max) return m['validation.mustBeMax']({ value: max });
		return '';
	}
	const HEX_RE = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

	let errors = $derived.by(() => {
		const e: Record<string, string> = {};
		if (creating) {
			if (nf.name.trim().length === 0) e.name = m['validation.required']();
			else if (nf.name.trim().length > 64) e.name = m['validation.maxChars']({ max: 64 });
			if (nf.material.trim().length > 64) e.material = m['validation.maxChars']({ max: 64 });
			if (nf.vendorName.trim().length > 64) e.vendor = m['validation.maxChars']({ max: 64 });
			e.density = numErr(nf.density, { required: true, gt: 0 });
			e.diameter = numErr(nf.diameter, { required: true, gt: 0 });
			e.nozzleTemp = numErr(nf.nozzleTemp, { min: 0 });
			e.bedTemp = numErr(nf.bedTemp, { min: 0 });
			if (nf.colorHex.trim() && !HEX_RE.test(nf.colorHex.trim())) e.colorHex = m['validation.hexDigits']();
		}
		e.count = numErr(count, { required: true, gt: 0 });
		e.netWeight = numErr(netWeight, { gt: 0 });
		e.spoolWeight = numErr(spoolWeight, { min: 0 });
		e.price = numErr(price, { min: 0 });
		if (fillMode !== 'full') {
			// Cross-check the fill amount against the net/empty-spool weights above.
			// Only applies the upper bound when those weights are themselves valid so
			// we don't cascade an unrelated error into this field.
			const netN = Number(netWeight);
			const netValid = netWeight.trim() !== '' && Number.isFinite(netN) && netN > 0;
			const spoolN = Number.isFinite(Number(spoolWeight)) ? Number(spoolWeight) : 0;
			if (fillMode === 'measured') {
				// Weight on the scale = filament left + empty spool, so it can be at most
				// net+spool (full) and at least the empty-spool weight (nothing left).
				e.fillWeight = numErr(fillWeight, {
					min: spoolN,
					max: netValid ? netN + spoolN : undefined
				});
			} else {
				// used/remaining are amounts of filament, capped at the net weight.
				e.fillWeight = numErr(fillWeight, { min: 0, max: netValid ? netN : undefined });
			}
		}
		// Drop empty (no-error) entries.
		for (const k of Object.keys(e)) if (!e[k]) delete e[k];
		return e;
	});
	let canSubmit = $derived((creating || !!chosen) && Object.keys(errors).length === 0);
</script>

{#if open}
	<div
		class="overlay"
		role="button"
		tabindex="0"
		onclick={close}
		onkeydown={(e) => e.key === 'Escape' && close()}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">{m['topbar.addSpools']()}</span>
				{#if step === 2}
					<span class="step-hint">{m['add.step2']()}</span>
				{/if}
				<button class="x" onclick={close} aria-label={m['buttons.close']()}>✕</button>
			</div>

			{#if step === 1}
				<div class="body">
					<input
						class="search-big"
						value={query}
						oninput={(e) => onSearch(e.currentTarget.value)}
						placeholder={m['add.searchPlaceholder']()}
					/>
					<div class="results">
						<div class="res-hdr">{m['add.yourCatalog']()}</div>
						{#if searching && localResults.length === 0}
							<div class="res-note">{m['add.searching']()}</div>
						{:else if localResults.length === 0}
							<div class="res-note">{m['add.noCatalog']()}</div>
						{:else}
							{#each localResults as f (f.id)}
								<button class="res-item" onclick={() => choose({ source: 'catalog', filament: f })}>
									<Swatch colors={f.colors} size={18} radius={5} />
									<div class="res-name">
										<span class="rn">{f.name}</span>
										<span class="rs">{vendorName(f)} · {f.material}</span>
									</div>
									<span class="tag in-catalog">{m['add.inCatalog']()}</span>
								</button>
							{/each}
						{/if}

						<div class="res-hdr"><span class="hdr-note">{m['add.externalLibrary']()}</span></div>
						{#if extError}
							<div class="res-note">{m['add.dbUnavailable']()}</div>
						{:else if searching && externalResults.length === 0}
							<div class="res-note">{m['add.searching']()}</div>
						{:else if externalResults.length === 0}
							<div class="res-note">
								{query.trim() ? m['add.typeToSearchMatches']() : m['add.typeToSearchAll']()}
							</div>
						{:else}
							{#each externalResults as ext (ext.id)}
								<button class="res-item" onclick={() => choose({ source: 'external', ext })}>
									<Swatch colors={externalColors(ext)} size={18} radius={5} />
									<div class="res-name">
										<span class="rn">{ext.name}</span>
										<span class="rs">{ext.manufacturer} · {ext.material}</span>
									</div>
									<span class="tag external">SpoolmanDB</span>
								</button>
							{/each}
						{/if}
					</div>

					<button class="create-new" onclick={startCreate}>
						<span class="cn-plus">＋</span>
						<span>{m['add.createNew']()}</span>
						<span class="cn-sub">{m['add.createNewSub']()}</span>
					</button>
				</div>
			{:else}
				<div class="body">
					<!-- Filament section: chosen card, or inline new-filament fields -->
					{#if creating}
						<div class="fil-section">
							<div class="fs-head">
								<span class="fs-title">{m['add.newFilamentTitle']()}</span>
								<button class="fs-back" onclick={() => (step = 1)}>{m['add.useExisting']()}</button>
							</div>
							<div class="form">
								<label class="wide">
									{m['filament.fields.vendor']()}
									<input
										list="vendor-list"
										bind:value={nf.vendorName}
										placeholder={m['add.manufacturerPlaceholder']()}
										class:invalid={errors.vendor}
									/>
									{#if errors.vendor}
										<span class="err">{errors.vendor}</span>
									{:else}
										<span class="hint" class:accent={vendorTrimmed && !vendorMatch}>{vendorHint}</span>
									{/if}
								</label>
								<label class="wide">
									{m['filament.fields.name']()} <span class="req">*</span>
									<input
										bind:value={nf.name}
										placeholder={m['add.filamentNamePlaceholder']()}
										class:invalid={errors.name}
									/>
									{#if errors.name}<span class="err">{errors.name}</span>{/if}
								</label>
								<label>
									{m['filament.fields.material']()}
									<input
										list="material-list"
										value={nf.material}
										oninput={(e) => onMaterial(e.currentTarget.value)}
										placeholder="PLA"
										class:invalid={errors.material}
									/>
									{#if errors.material}<span class="err">{errors.material}</span>{/if}
								</label>
								<label class="color-field">
									{m['filament.fields.colorHex']()}
									<div class="color-row">
										<input
											class="color-pick"
											type="color"
											value={colorPicker}
											oninput={(e) => onColorPick(e.currentTarget.value)}
											aria-label={m['add.pickColor']()}
										/>
										<input
											class="mono"
											bind:value={nf.colorHex}
											placeholder="hex"
											maxlength="8"
											class:invalid={errors.colorHex}
										/>
									</div>
									{#if errors.colorHex}<span class="err">{errors.colorHex}</span>{/if}
								</label>
							</div>
							<datalist id="vendor-list"
								>{#each vendorNames as v (v)}<option value={v}></option>{/each}</datalist
							>
							<datalist id="material-list"
								>{#each materialNames as m (m)}<option value={m}></option>{/each}</datalist
							>

							<button class="adv-toggle" onclick={() => (showAdvanced = !showAdvanced)}>
								{showAdvanced ? '▾' : '▸'}
								{m['add.advanced']()}
								{#if !showAdvanced}<span class="adv-note">{m['add.advancedNote']()}</span>{/if}
							</button>
							{#if showAdvanced}
								<div class="form">
									<label
										>{m['filament.fields.density']()} <span class="u">g/cm³</span> <span class="req">*</span>
										<NumberInput
											bind:value={nf.density}
											min={0}
											step={0.01}
											spaced
											invalid={!!errors.density}
										/>
										{#if errors.density}<span class="err">{errors.density}</span>{/if}
									</label>
									<label
										>{m['filament.fields.diameter']()} <span class="u">mm</span> <span class="req">*</span>
										<NumberInput
											bind:value={nf.diameter}
											min={0}
											step={0.05}
											spaced
											invalid={!!errors.diameter}
										/>
										{#if errors.diameter}<span class="err">{errors.diameter}</span>{/if}
									</label>
									<label
										>{m['filament.fields.settingsBedTemp']()} <span class="u">°C</span>
										<NumberInput
											bind:value={nf.nozzleTemp}
											min={0}
											step={5}
											placeholder="—"
											spaced
											invalid={!!errors.nozzleTemp}
										/>
										{#if errors.nozzleTemp}<span class="err">{errors.nozzleTemp}</span>{/if}
									</label>
									<label
										>{m['filament.fields.settingsExtruderTemp']()} <span class="u">°C</span>
										<NumberInput
											bind:value={nf.bedTemp}
											min={0}
											step={5}
											placeholder="—"
											spaced
											invalid={!!errors.bedTemp}
										/>
										{#if errors.bedTemp}<span class="err">{errors.bedTemp}</span>{/if}
									</label>
								</div>
							{/if}
						</div>
						<div class="sec-divider"></div>
					{:else if chosen}
						<div class="chosen">
							<Swatch colors={cColors(chosen)} size={24} radius={6} />
							<div class="chosen-name">
								<div class="cn">
									{cName(chosen)}
									{#if chosen.source === 'external'}<span class="tag external sm">SpoolmanDB</span>{/if}
								</div>
								<div class="cs">{cVendor(chosen)} · {cMaterial(chosen)}</div>
							</div>
							<button class="change" onclick={() => (step = 1)}>{m['add.change']()}</button>
						</div>
						{#if chosen.source === 'external'}
							<div class="import-note">{m['add.importNote']()}</div>
						{/if}
					{/if}

					<!-- Spool section -->
					<div class="form">
						<label
							>{m['add.count']()}
							<NumberInput bind:value={count} min={1} step={1} spaced invalid={!!errors.count} />
							{#if errors.count}<span class="err">{errors.count}</span>{/if}
						</label>
						<label
							>{m['filament.fields.weight']()} <span class="u">g</span>
							<button
								type="button"
								class="help-toggle"
								aria-label={m['help.help']()}
								aria-controls="weight-help"
								aria-expanded={openHelp === 'weight'}
								onclick={() => (openHelp = openHelp === 'weight' ? null : 'weight')}>ⓘ</button
							>
							<NumberInput bind:value={netWeight} min={0} step={50} spaced invalid={!!errors.netWeight} />
							{#if openHelp === 'weight'}
								<span class="help-popup" id="weight-help" role="note"
									>{m['filament.fieldsHelp.weight']()}</span
								>
							{/if}
							{#if errors.netWeight}<span class="err">{errors.netWeight}</span>{/if}
						</label>
						<label
							>{m['filament.fields.spoolWeight']()} <span class="u">g</span>
							<button
								type="button"
								class="help-toggle"
								aria-label={m['help.help']()}
								aria-controls="spoolWeight-help"
								aria-expanded={openHelp === 'spoolWeight'}
								onclick={() => (openHelp = openHelp === 'spoolWeight' ? null : 'spoolWeight')}>ⓘ</button
							>
							<NumberInput
								bind:value={spoolWeight}
								min={0}
								step={10}
								placeholder="—"
								spaced
								invalid={!!errors.spoolWeight}
							/>
							{#if openHelp === 'spoolWeight'}
								<span class="help-popup" id="spoolWeight-help" role="note"
									>{m['filament.fieldsHelp.spoolWeight']()}</span
								>
							{/if}
							{#if errors.spoolWeight}<span class="err">{errors.spoolWeight}</span>{/if}
						</label>
						<label
							>{m['filament.fields.price']()} <span class="u">{settings.currency}</span>
							<input class="mono" bind:value={price} placeholder="—" class:invalid={errors.price} />
							{#if errors.price}<span class="err">{errors.price}</span>{/if}
						</label>
						<label>{m['spool.fields.lotNr']()}<input class="mono" bind:value={lot} placeholder="—" /></label>
						<label class="wide"
							>{m['spool.fields.location']()}<input
								list="add-locations"
								bind:value={location}
								placeholder={m['add.locationPlaceholder']()}
							/></label
						>
					</div>
					<datalist id="add-locations"
						>{#each locations as loc (loc)}<option value={loc}></option>{/each}</datalist
					>

					<div class="fill">
						<div class="fill-label">{m['add.fillLevel']()}</div>
						<div class="seg">
							{#each FILL_MODES as fill_mode (fill_mode.key)}
								<button
									class="seg-btn"
									class:active={fillMode === fill_mode.key}
									onclick={() => (fillMode = fill_mode.key)}>{fill_mode.labelKey()}</button
								>
							{/each}
						</div>
						{#if fillMode !== 'full'}
							<div class="fill-input">
								<NumberInput
									bind:value={fillWeight}
									min={0}
									step={10}
									placeholder="0"
									width="110px"
									invalid={!!errors.fillWeight}
								/>
								<span class="u">g</span>
								<span class="fill-help">{errors.fillWeight || fillHelp}</span>
							</div>
						{/if}
					</div>

					<div class="form dates">
						<label class="date-label"
							>{m['spool.fields.firstUsed']()}<DateTimeField
								value={firstUsed}
								oninput={(iso) => (firstUsed = iso)}
							/></label
						>
						<label class="date-label"
							>{m['spool.fields.lastUsed']()}<DateTimeField
								value={lastUsed}
								oninput={(iso) => (lastUsed = iso)}
							/></label
						>
					</div>

					<div class="form comment-row">
						<label class="wide"
							>{m['spool.fields.comment']()}<textarea rows="2" bind:value={comment} placeholder="—"
							></textarea></label
						>
					</div>

					<ExtraFieldsSection entity="spool" extra={extraValues} onchange={setExtra} />

					<div class="submit-row">
						<div class="summary">{summary}</div>
						<div class="actions">
							<Button variant="outline" disabled={!canSubmit || submitting} onclick={() => submit(true)}
								>{m['add.addAndNew']()}</Button
							>
							<Button disabled={!canSubmit || submitting} onclick={() => submit(false)}>
								{submitting ? m['add.adding']() : m['add.addN']({ count: countN })}
							</Button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 50;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 16px 16px;
	}
	.modal {
		width: 640px;
		max-width: 100%;
		max-height: 84vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.modal-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 20px 0;
		flex: none;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.step-hint {
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.x {
		margin-left: auto;
		color: var(--text-dim);
		cursor: pointer;
		font-size: 15px;
		padding: 4px 8px;
		background: none;
		border: none;
	}
	.x:hover {
		color: var(--text);
	}
	.body {
		padding: 14px 20px 20px;
		overflow-y: auto;
	}
	.search-big {
		width: 100%;
		background: var(--input-bg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		padding: 11px 14px;
		font-size: 14px;
		color: var(--text);
		box-shadow: 0 0 0 3px rgba(190, 104, 47, 0.15);
	}
	.results {
		margin-top: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		overflow: hidden;
		max-height: 40vh;
		overflow-y: auto;
	}
	.res-hdr {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 7px 14px;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		background: #222;
		border-top: 1px solid var(--border);
		position: sticky;
		top: 0;
	}
	.hdr-note {
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-faint);
	}
	.res-note {
		padding: 10px 14px;
		font-size: 12px;
		color: var(--text-dim);
		border-top: 1px solid var(--border-soft);
	}
	.res-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		cursor: pointer;
		border: none;
		border-top: 1px solid var(--border-soft);
		background: none;
		color: inherit;
		width: 100%;
		text-align: left;
		font-family: inherit;
	}
	.res-item:hover {
		background: #2c2c2c;
	}
	.res-name {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rn {
		font-weight: 600;
	}
	.rs {
		color: var(--text-muted);
		font-size: 12px;
	}
	.tag {
		font-size: 10.5px;
		padding: 1px 7px;
		border-radius: 8px;
		flex: none;
		white-space: nowrap;
	}
	.tag.in-catalog {
		background: var(--surface-raised);
		color: #b8b8b8;
	}
	.tag.external {
		background: var(--accent-wash);
		border: 1px solid var(--accent-border);
		color: var(--accent-soft);
	}
	.tag.sm {
		margin-left: 6px;
	}
	.create-new {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		margin-top: 10px;
		padding: 11px 14px;
		border: 1px dashed var(--accent-border);
		border-radius: var(--radius-md);
		background: none;
		color: var(--accent-link);
		cursor: pointer;
		font-family: inherit;
		font-size: 13px;
		text-align: left;
	}
	.create-new:hover {
		border-color: var(--accent);
		background: var(--accent-wash-soft);
	}
	.cn-plus {
		font-size: 15px;
		flex: none;
	}
	.cn-sub {
		margin-left: auto;
		color: var(--text-faint);
		font-size: 11.5px;
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--surface-2);
		border: 1px solid #363636;
		border-radius: var(--radius-md);
		padding: 10px 14px;
	}
	.chosen-name {
		flex: 1;
		min-width: 0;
	}
	.cn {
		font-weight: 600;
	}
	.cs {
		font-size: 11.5px;
		color: var(--text-muted);
	}
	.change {
		font-size: 12px;
		color: var(--accent-link);
		cursor: pointer;
		background: none;
		border: none;
	}
	.import-note {
		margin-top: 10px;
		padding: 8px 12px;
		border: 1px solid var(--unused-bg);
		background: var(--accent-wash-soft);
		border-radius: var(--radius);
		font-size: 11.5px;
		color: #b8a68f;
	}
	.fil-section {
		background: var(--surface);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-md);
		padding: 12px 14px;
	}
	.fs-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 4px;
	}
	.fs-title {
		font-weight: 600;
		font-size: 13px;
	}
	.fs-back {
		font-size: 12px;
		color: var(--accent-link);
		background: none;
		border: none;
		cursor: pointer;
	}
	.sec-divider {
		height: 1px;
		background: var(--border-soft);
		margin: 16px 0 4px;
	}
	.color-field .color-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 5px;
	}
	.color-field .color-row input {
		margin-top: 0;
		flex: 1;
		min-width: 0;
	}
	.color-pick {
		flex: none !important;
		width: 30px !important;
		height: 30px;
		padding: 2px !important;
		border: 1px solid var(--border-strong) !important;
		border-radius: 6px;
		background: none;
		cursor: pointer;
	}
	.color-pick::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.color-pick::-webkit-color-swatch {
		border: none;
		border-radius: 4px;
	}
	.color-pick::-moz-color-swatch {
		border: none;
		border-radius: 4px;
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
	.help-toggle {
		position: relative;
		border: none;
		background: none;
		padding: 0;
		margin-left: 2px;
		font-size: 12px;
		/* Keep the line box the same height as plain-text labels so grid rows
		   with a help button stay aligned with those without one. */
		line-height: 1;
		color: var(--text-faint);
		cursor: pointer;
		vertical-align: middle;
	}
	.help-toggle::before {
		/* Roomy tap target on touch, laid out over the glyph so it doesn't
		   affect the inline height of the label. */
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 32px;
		height: 32px;
		transform: translate(-50%, -50%);
	}
	.help-toggle:hover,
	.help-toggle[aria-expanded='true'] {
		color: var(--accent-soft);
	}
	.help-popup {
		display: block;
		margin-top: 6px;
		padding: 8px 10px;
		border-radius: 7px;
		background: var(--surface-2, rgba(127, 127, 127, 0.12));
		border: 1px solid var(--border-strong);
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--text-muted);
		/* Flows inline in the form, so it wraps and stays inside the modal on mobile. */
		max-width: 100%;
	}
	.hint.accent {
		color: var(--accent-soft);
	}
	.form textarea {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		padding: 9px 12px;
		color: var(--text);
		font-size: 13px;
		font-family: inherit;
		margin-top: 5px;
		resize: vertical;
	}
	.form textarea:focus {
		border-color: var(--accent);
	}
	.comment-row {
		grid-template-columns: 1fr;
	}
	.dates {
		grid-template-columns: 1fr 1fr;
	}
	/* Give the custom DateTimeField trigger the same top gap as text inputs. */
	.date-label :global(.dtf) {
		margin-top: 8px;
	}
	.fill {
		margin-top: 14px;
	}
	.fill-label {
		font-size: 11.5px;
		color: var(--text-muted);
		margin-bottom: 6px;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border-strong);
		border-radius: 7px;
		overflow: hidden;
	}
	.seg-btn {
		padding: 7px 14px;
		background: none;
		border: none;
		border-right: 1px solid var(--border-strong);
		color: var(--text-2);
		font-size: 12.5px;
		cursor: pointer;
		font-family: inherit;
	}
	.seg-btn:last-child {
		border-right: none;
	}
	.seg-btn.active {
		background: var(--accent-wash);
		color: var(--accent-soft);
		font-weight: 600;
	}
	.fill-input {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.fill-help {
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.submit-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 18px;
	}
	.summary {
		flex: 1;
		font-size: 12px;
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		gap: 8px;
		flex: none;
	}
	@media (max-width: 620px) {
		.form {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
