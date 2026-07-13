<script lang="ts">
	import Swatch from './Swatch.svelte';
	import Button from './Button.svelte';
	import NumberInput from './NumberInput.svelte';
	import ExtraFieldsSection from './ExtraFieldsSection.svelte';
	import type { Filament, Extra } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource, type NewFilamentDraft } from '$lib/api/spoolSource';
	import { fields } from '$lib/stores/fields.svelte';
	import { externalColors, getExternalMaterials, type ExternalFilament } from '$lib/api/external';

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
		density: '1.24',
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
	const COMMON_MATERIALS: { name: string; density: number }[] = [
		{ name: 'PLA', density: 1.24 },
		{ name: 'PETG', density: 1.27 },
		{ name: 'ABS', density: 1.04 },
		{ name: 'ASA', density: 1.07 },
		{ name: 'TPU', density: 1.21 },
		{ name: 'Nylon', density: 1.14 },
		{ name: 'PC', density: 1.2 },
		{ name: 'PVA', density: 1.23 },
		{ name: 'HIPS', density: 1.04 },
		{ name: 'PP', density: 0.9 }
	];

	// --- display helpers for a chosen (existing) filament ------------------
	function cName(c: Choice) {
		return c.source === 'catalog' ? c.filament.name : c.ext.name;
	}
	function cVendor(c: Choice) {
		return c.source === 'catalog'
			? (inventory.vendorById(c.filament.vendorId)?.name ?? 'No manufacturer')
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
		return inventory.vendorById(f.vendorId)?.name ?? 'No manufacturer';
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
	let firstUsed = $state('');
	let lastUsed = $state('');
	let extraValues = $state<Extra>({});

	const FILL_MODES: { key: FillMode; label: string }[] = [
		{ key: 'full', label: 'Full' },
		{ key: 'used', label: 'Used' },
		{ key: 'remaining', label: 'Remaining' },
		{ key: 'measured', label: 'Measured' }
	];
	let fillHelp = $derived(
		fillMode === 'used'
			? 'Weight of filament already used.'
			: fillMode === 'remaining'
				? 'Weight of filament still on the spool.'
				: fillMode === 'measured'
					? 'Total weight on a scale now (filament + empty spool).'
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
		firstUsed = '';
		lastUsed = '';
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
			density: '1.24',
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
			? 'Optional — leave blank for no manufacturer'
			: vendorMatch
				? `Using existing manufacturer “${vendorMatch}”`
				: `New manufacturer “${vendorTrimmed}” will be created`
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
					density: Number(nf.density) || 1.24,
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
			if (firstUsed) body.first_used = new Date(firstUsed).toISOString();
			if (lastUsed) body.last_used = new Date(lastUsed).toISOString();
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

	let targetName = $derived(creating ? nf.name.trim() || 'new filament' : chosen ? cName(chosen) : '');
	let summary = $derived(
		chosen || creating
			? `${countN} spool${countN === 1 ? '' : 's'} of ${targetName} · ${netWeight || '?'} g net each`
			: ''
	);

	// --- validation ---------------------------------------------------------
	// Mirrors the filament creation API (spoolman/api/v1/filament.py):
	// density & diameter are required and must be > 0; name/material ≤ 64 chars;
	// weight > 0, spool_weight/price ≥ 0; color_hex must be 6 or 8 hex chars.
	function numErr(
		v: string,
		{ required = false, min, gt }: { required?: boolean; min?: number; gt?: number } = {}
	) {
		const t = v.trim();
		if (t === '') return required ? 'Required' : '';
		const n = Number(t);
		if (!Number.isFinite(n)) return 'Must be a number';
		if (gt != null && n <= gt) return `Must be greater than ${gt}`;
		if (min != null && n < min) return `Must be ${min} or more`;
		return '';
	}
	const HEX_RE = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

	let errors = $derived.by(() => {
		const e: Record<string, string> = {};
		if (creating) {
			if (nf.name.trim().length === 0) e.name = 'Required';
			else if (nf.name.trim().length > 64) e.name = 'At most 64 characters';
			if (nf.material.trim().length > 64) e.material = 'At most 64 characters';
			if (nf.vendorName.trim().length > 64) e.vendor = 'At most 64 characters';
			e.density = numErr(nf.density, { required: true, gt: 0 });
			e.diameter = numErr(nf.diameter, { required: true, gt: 0 });
			e.nozzleTemp = numErr(nf.nozzleTemp, { min: 0 });
			e.bedTemp = numErr(nf.bedTemp, { min: 0 });
			if (nf.colorHex.trim() && !HEX_RE.test(nf.colorHex.trim())) e.colorHex = 'Use 6 or 8 hex digits';
		}
		e.count = numErr(count, { required: true, gt: 0 });
		e.netWeight = numErr(netWeight, { gt: 0 });
		e.spoolWeight = numErr(spoolWeight, { min: 0 });
		e.price = numErr(price, { min: 0 });
		if (fillMode !== 'full') e.fillWeight = numErr(fillWeight, { min: 0 });
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
				<span class="title">Add spools</span>
				{#if step === 2}
					<span class="step-hint">Step 2 · spool details</span>
				{/if}
				<button class="x" onclick={close} aria-label="Close">✕</button>
			</div>

			{#if step === 1}
				<div class="body">
					<input
						class="search-big"
						value={query}
						oninput={(e) => onSearch(e.currentTarget.value)}
						placeholder="Search your catalog and SpoolmanDB…"
					/>
					<div class="results">
						<div class="res-hdr">Your catalog</div>
						{#if searching && localResults.length === 0}
							<div class="res-note">Searching…</div>
						{:else if localResults.length === 0}
							<div class="res-note">No filaments in your catalog</div>
						{:else}
							{#each localResults as f (f.id)}
								<button class="res-item" onclick={() => choose({ source: 'catalog', filament: f })}>
									<Swatch colors={f.colors} size={18} radius={5} />
									<div class="res-name">
										<span class="rn">{f.name}</span>
										<span class="rs">{vendorName(f)} · {f.material}</span>
									</div>
									<span class="tag in-catalog">in catalog</span>
								</button>
							{/each}
						{/if}

						<div class="res-hdr">SpoolmanDB <span class="hdr-note">community database</span></div>
						{#if extError}
							<div class="res-note">SpoolmanDB unavailable</div>
						{:else if searching && externalResults.length === 0}
							<div class="res-note">Searching…</div>
						{:else if externalResults.length === 0}
							<div class="res-note">
								Type to search {query.trim() ? '— no matches' : 'thousands of filaments'}
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
						<span>Create a new filament{query.trim() ? ` “${query.trim()}”` : ''}</span>
						<span class="cn-sub">not in your catalog or SpoolmanDB</span>
					</button>
				</div>
			{:else}
				<div class="body">
					<!-- Filament section: chosen card, or inline new-filament fields -->
					{#if creating}
						<div class="fil-section">
							<div class="fs-head">
								<span class="fs-title">New filament</span>
								<button class="fs-back" onclick={() => (step = 1)}>use an existing one</button>
							</div>
							<div class="form">
								<label class="wide">
									Manufacturer
									<input
										list="vendor-list"
										bind:value={nf.vendorName}
										placeholder="Manufacturer"
										class:invalid={errors.vendor}
									/>
									{#if errors.vendor}
										<span class="err">{errors.vendor}</span>
									{:else}
										<span class="hint" class:accent={vendorTrimmed && !vendorMatch}>{vendorHint}</span>
									{/if}
								</label>
								<label class="wide">
									Filament name <span class="req">*</span>
									<input
										bind:value={nf.name}
										placeholder="e.g. PolyTerra Matte Sage"
										class:invalid={errors.name}
									/>
									{#if errors.name}<span class="err">{errors.name}</span>{/if}
								</label>
								<label>
									Material
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
									Color
									<div class="color-row">
										<input
											class="color-pick"
											type="color"
											value={colorPicker}
											oninput={(e) => onColorPick(e.currentTarget.value)}
											aria-label="Pick color"
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
								{showAdvanced ? '▾' : '▸'} Advanced specs
								{#if !showAdvanced}<span class="adv-note"
										>density, diameter, temperatures (auto-filled from material)</span
									>{/if}
							</button>
							{#if showAdvanced}
								<div class="form">
									<label
										>Density <span class="u">g/cm³</span> <span class="req">*</span>
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
										>Diameter <span class="u">mm</span> <span class="req">*</span>
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
										>Nozzle <span class="u">°C</span>
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
										>Bed <span class="u">°C</span>
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
							<button class="change" onclick={() => (step = 1)}>change</button>
						</div>
						{#if chosen.source === 'external'}
							<div class="import-note">
								This filament will be added to your catalog when you add the spools.
							</div>
						{/if}
					{/if}

					<!-- Spool section -->
					<div class="form">
						<label
							>Count
							<NumberInput bind:value={count} min={1} step={1} spaced invalid={!!errors.count} />
							{#if errors.count}<span class="err">{errors.count}</span>{/if}
						</label>
						<label
							>Net weight <span class="u">g</span>
							<NumberInput bind:value={netWeight} min={0} step={50} spaced invalid={!!errors.netWeight} />
							{#if errors.netWeight}<span class="err">{errors.netWeight}</span>{/if}
						</label>
						<label
							>Empty spool <span class="u">g</span>
							<NumberInput
								bind:value={spoolWeight}
								min={0}
								step={10}
								placeholder="—"
								spaced
								invalid={!!errors.spoolWeight}
							/>
							{#if errors.spoolWeight}<span class="err">{errors.spoolWeight}</span>{/if}
						</label>
						<label
							>Price / spool <span class="u">{settings.currency}</span>
							<input class="mono" bind:value={price} placeholder="—" class:invalid={errors.price} />
							{#if errors.price}<span class="err">{errors.price}</span>{/if}
						</label>
						<label>Lot №<input class="mono" bind:value={lot} placeholder="—" /></label>
						<label class="wide"
							>Location<input list="add-locations" bind:value={location} placeholder="e.g. Shelf A" /></label
						>
					</div>
					<datalist id="add-locations"
						>{#each locations as loc (loc)}<option value={loc}></option>{/each}</datalist
					>

					<div class="fill">
						<div class="fill-label">Fill level</div>
						<div class="seg">
							{#each FILL_MODES as m (m.key)}
								<button class="seg-btn" class:active={fillMode === m.key} onclick={() => (fillMode = m.key)}
									>{m.label}</button
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
						<label>First used<input type="datetime-local" bind:value={firstUsed} /></label>
						<label>Last used<input type="datetime-local" bind:value={lastUsed} /></label>
					</div>

					<div class="form comment-row">
						<label class="wide"
							>Comment<textarea rows="2" bind:value={comment} placeholder="—"></textarea></label
						>
					</div>

					<ExtraFieldsSection entity="spool" extra={extraValues} onchange={setExtra} />

					<div class="submit-row">
						<div class="summary">{summary}</div>
						<div class="actions">
							<Button variant="outline" disabled={!canSubmit || submitting} onclick={() => submit(true)}
								>Add &amp; new</Button
							>
							<Button disabled={!canSubmit || submitting} onclick={() => submit(false)}>
								{submitting ? 'Adding…' : `Add ${countN} spool${countN === 1 ? '' : 's'}`}
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
	.form input[type='datetime-local'] {
		color-scheme: dark;
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
