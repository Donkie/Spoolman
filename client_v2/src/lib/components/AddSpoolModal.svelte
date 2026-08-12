<script lang="ts">
	import { untrack, tick } from 'svelte';
	import Swatch from './Swatch.svelte';
	import ColorEditor from './ColorEditor.svelte';
	import Button from './Button.svelte';
	import NumberInput from './NumberInput.svelte';
	import Combobox from './Combobox.svelte';
	import DateTimeField from './DateTimeField.svelte';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ExtraFieldsSection from './ExtraFieldsSection.svelte';
	import type { Filament, Extra, MultiColorDirection } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { serverInfo } from '$lib/stores/serverInfo.svelte';
	import { spoolSource, type NewFilamentDraft } from '$lib/api/spoolSource';
	import { fields } from '$lib/stores/fields.svelte';
	import type { EntityType } from '$lib/api/fields';
	import { externalColors, externalDirection, type ExternalFilament } from '$lib/api/external';
	import { roundGrams, weightAuto } from '$lib/utils/format';
	import { parseDecimal } from '$lib/utils/numeric';
	import { loadMaterials, type MaterialSpec } from '$lib/data/materials';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		/** When set, open straight to step 2 with this local filament chosen. */
		presetFilamentId?: string | null;
		/** When set, open straight to step 2 on a new filament copied from this one. */
		duplicateFilamentId?: string | null;
		onclose?: () => void;
	}
	let { open, presetFilamentId = null, duplicateFilamentId = null, onclose }: Props = $props();

	// A chosen filament is one from the local catalog, a SpoolmanDB entry, or —
	// when `creating` — a brand-new filament described by the `nf` form.
	type Choice = { source: 'catalog'; filament: Filament } | { source: 'external'; ext: ExternalFilament };

	let step = $state<1 | 2>(1);
	let query = $state('');
	let searchInput = $state<HTMLInputElement | undefined>();
	let localResults = $state<Filament[]>([]);
	let externalResults = $state<ExternalFilament[]>([]);
	let searching = $state(false);
	let extError = $state(false);
	let chosen = $state<Choice | null>(null);
	let creating = $state(false);
	let submitting = $state(false);
	let locations = $state<string[]>([]);
	// The filament the current new-filament form was copied from, if any. Drives
	// the "duplicate of X" heading, the rename nudge, and the extra-field carry-over.
	let cloneSource = $state<Filament | null>(null);

	// New-filament fields + lookups for the combobox / auto-fill.
	let nf = $state({
		vendorName: '',
		name: '',
		material: '',
		colors: [] as string[],
		multiColorDirection: undefined as MultiColorDirection | undefined,
		density: '',
		diameter: '1.75',
		nozzleTemp: '',
		bedTemp: '',
		articleNumber: '',
		comment: ''
	});
	// Custom-field values for the filament being created. Separate from the spool's
	// `extraValues` below: the two entities have their own field definitions.
	let filamentExtra = $state<Extra>({});
	let showAdvanced = $state(false);
	let nameInput = $state<HTMLInputElement | undefined>();
	let modalEl = $state<HTMLDivElement | undefined>();
	// When to *show* an error, as opposed to have one: a field is revealed once the
	// user has left it, and everything is revealed once Add has been pressed. A form
	// you just opened stays quiet instead of shouting "Required" at fields you were
	// on your way to filling in. `errors` below is unaffected — it always describes
	// the form as it stands.
	let touched = $state<Record<string, boolean>>({});
	let attempted = $state(false);
	let vendorNames = $state<string[]>([]);
	let materialNames = $state<string[]>([]);
	let materialSpecs = $state<Record<string, MaterialSpec>>({});

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
	function cDirection(c: Choice): MultiColorDirection | undefined {
		return c.source === 'catalog' ? c.filament.multiColorDirection : externalDirection(c.ext);
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
			fields.ensure('filament');
			spoolSource
				.locations()
				.then((l) => (locations = l))
				.catch(() => {});
			spoolSource
				.vendorNames()
				.then((vn) => (vendorNames = vn))
				.catch(() => {});
			loadMaterials().then(({ names, specs }) => {
				materialNames = names;
				materialSpecs = specs;
			});
			if (presetFilamentId) {
				const f = inventory.filamentById(presetFilamentId);
				if (f) choose({ source: 'catalog', filament: f });
			} else if (duplicateFilamentId) {
				const f = inventory.filamentById(duplicateFilamentId);
				if (f) startDuplicate(f);
			}
		} else if (!open) {
			initialized = false;
		}
	});

	// Focus the search box whenever the search step is showing, so you can open
	// the modal and start typing immediately. Re-runs when the input remounts
	// (e.g. returning to step 1 from step 2).
	$effect(() => {
		if (open && step === 1 && searchInput) searchInput.focus();
	});

	// When duplicating, the name is the one field that must change, so put the
	// caret in it (at the end — the colour word is usually a suffix, and the rest
	// of the name is worth keeping rather than retyping).
	$effect(() => {
		if (open && cloneSource && nameInput) {
			nameInput.focus();
			nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
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
	// Ballpark empty-spool weights, offered in the Spool Weight help for people who
	// have no idea what to put there. Deliberately round: they're a starting point
	// to be corrected by weighing the spool, not a claim about any specific brand.
	const SPOOL_WEIGHT_PRESETS = [
		{ weight: 140, label: () => m['add.spoolWeightPreset.cardboard']({ weight: 140 }) },
		{ weight: 200, label: () => m['add.spoolWeightPreset.plastic']({ weight: 200 }) }
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

	/** `current` with a default filled in for every field it doesn't already carry. */
	function withDefaults(entity: EntityType, current: Extra): Extra {
		const out = { ...current };
		for (const f of fields.get(entity))
			if (f.default_value != null && !(f.key in out)) out[f.key] = f.default_value;
		return out;
	}
	// Definitions are fetched on open, so they can land after the form is already on
	// screen — opening straight into a preset or a duplicate leaves no time for the
	// request. Top up the defaults when they arrive; anything already there, seeded
	// or typed, is left alone. The writes are untracked so this doesn't re-run itself.
	$effect(() => {
		fields.get('spool');
		fields.get('filament');
		untrack(() => {
			extraValues = withDefaults('spool', extraValues);
			filamentExtra = withDefaults('filament', filamentExtra);
		});
	});

	function setExtraOn(current: Extra, key: string, json: string | undefined): Extra {
		const next = { ...current };
		if (json === undefined) delete next[key];
		else next[key] = json;
		return next;
	}
	function setExtra(key: string, json: string | undefined) {
		extraValues = setExtraOn(extraValues, key, json);
	}
	function setFilamentExtra(key: string, json: string | undefined) {
		filamentExtra = setExtraOn(filamentExtra, key, json);
	}

	/** Back to a quiet form: nothing revealed until the user leaves a field or submits. */
	function clearValidation() {
		touched = {};
		attempted = false;
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
		extraValues = withDefaults('spool', {});
		// Every route into step 2 lands here, so this is where the form goes quiet
		// again: pick a different filament and you start over, not mid-argument.
		clearValidation();
	}

	function choose(c: Choice) {
		creating = false;
		cloneSource = null;
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
		cloneSource = null;
		chosen = null;
		showAdvanced = false;
		nf = {
			vendorName: '',
			name: query.trim(),
			material: '',
			colors: [],
			multiColorDirection: undefined,
			density: '',
			diameter: '1.75',
			nozzleTemp: '',
			bedTemp: '',
			articleNumber: '',
			comment: ''
		};
		filamentExtra = withDefaults('filament', {});
		netWeight = '1000';
		spoolWeight = '';
		price = '';
		resetSpoolForm();
		step = 2;
	}

	/**
	 * Start a new filament copied from an existing one — the "I bought the same
	 * filament in another colour" case. Everything that describes the *product*
	 * carries over (manufacturer, material, specs, weights, price, custom fields — all
	 * of it still editable in the form); everything that identifies the *variant* is
	 * left for the user: the colour is cleared and the article number (a per-colour
	 * SKU) is dropped. The name is kept as a starting point since it's usually one
	 * word away from the new one,
	 * with a nudge below the field until it's changed.
	 */
	function startDuplicate(f: Filament) {
		creating = true;
		cloneSource = f;
		chosen = null;
		// Specs came from a real filament rather than a material guess, so open the
		// advanced block: it's what makes the copy visibly a copy.
		showAdvanced = true;
		nf = {
			vendorName: inventory.vendorById(f.vendorId)?.name ?? '',
			name: f.name,
			material: f.material,
			colors: [],
			multiColorDirection: undefined,
			density: String(f.density),
			diameter: String(f.diameter),
			nozzleTemp: f.nozzleTemp ? String(f.nozzleTemp) : '',
			bedTemp: f.bedTemp ? String(f.bedTemp) : '',
			articleNumber: '',
			comment: f.comment
		};
		filamentExtra = withDefaults('filament', { ...f.extra });
		netWeight = String(f.weight || 1000);
		spoolWeight = f.spoolWeight ? String(f.spoolWeight) : '';
		price = f.price ? String(f.price) : '';
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
	// Accents the manufacturer hint when the typed name will create a second record
	// alongside the filament, rather than link an existing one.
	let vendorIsNew = $derived(vendorTrimmed !== '' && !vendorMatch);
	// Nudge, not an error: Spoolman allows same-named filaments, but keeping the
	// original's name on a duplicate is almost always an oversight.
	let nameStillSource = $derived(!!cloneSource && nf.name.trim() === cloneSource.name.trim());

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

	function reset() {
		step = 1;
		query = '';
		localResults = [];
		externalResults = [];
		chosen = null;
		creating = false;
		cloneSource = null;
		clearValidation();
		submitting = false;
	}
	function close() {
		reset();
		onclose?.();
	}

	async function submit(andAnother = false) {
		if (submitting || !(creating || chosen)) return;
		// The button stays clickable while the form is incomplete: a dead button
		// answers "why can't I add this?" with silence. Pressing it instead reveals
		// every outstanding error at once, opens the section hiding one, lists them
		// above the button, and drops the caret in the first field to fix.
		if (problems.length > 0) {
			attempted = true;
			await focusField(problems[0].key);
			return;
		}
		submitting = true;
		try {
			let filamentId: number;
			// Set when this submit created a filament, so "Add & new" can offer the
			// next colour of it without going back through search.
			let created: Filament | null = null;
			if (creating) {
				const draft: NewFilamentDraft = {
					name: nf.name.trim(),
					vendorName: nf.vendorName.trim(),
					material: nf.material.trim(),
					density: Number(nf.density),
					diameter: Number(nf.diameter) || 1.75,
					weight: Number(netWeight) || undefined,
					spoolWeight: Number(spoolWeight) || undefined,
					colors: nf.colors,
					multiColorDirection: nf.multiColorDirection,
					nozzleTemp: nf.nozzleTemp ? Number(nf.nozzleTemp) : undefined,
					bedTemp: nf.bedTemp ? Number(nf.bedTemp) : undefined,
					price: parseFloat(price) || undefined,
					articleNumber: nf.articleNumber.trim() || undefined,
					comment: nf.comment.trim() || undefined,
					extra: filamentExtra
				};
				const f = await spoolSource.createFilament(draft);
				created = f;
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
				// Rounded, because this subtraction is where float dust gets born: weighing a full
				// 1000 g spool on a 128.11 g core gives 1000 + 128.11 − 1128.11 = 2.3e-13, and a
				// spool created with that much used is not an unused spool any more (#986).
				body.used_weight = roundGrams(Math.max(0, net + spool - (Number(fillWeight) || 0)));
			if (firstUsed) body.first_used = firstUsed;
			if (lastUsed) body.last_used = lastUsed;
			if (Object.keys(extraValues).length) body.extra = extraValues;

			for (let i = 0; i < n; i++) await spoolSource.createSpool(body);
			if (andAnother && created) {
				// Just added a brand-new filament: the overwhelmingly likely next entry
				// is a sibling of it (the multi-colour shopping trip this flow exists
				// for), so hand back the same form pre-copied instead of an empty search.
				reset();
				startDuplicate(created);
			} else if (andAnother) {
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
		const n = parseDecimal(t);
		if (n === null) return m['validation.mustBeNumber']();
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
			if (nf.colors.some((c) => c.trim() && !HEX_RE.test(c.trim()))) e.colorHex = m['validation.hexDigits']();
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

	// --- telling the user what is missing -----------------------------------
	// Every field that can carry an error, in the order it appears on the form, so
	// the summary reads top-to-bottom like the form does. Keys not listed here still
	// show up in the summary — under their raw key rather than a label — so a new
	// error can never block submission invisibly.
	const FIELD_LABELS: { key: string; label: () => string }[] = [
		{ key: 'vendor', label: m['filament.fields.vendor'] },
		{ key: 'name', label: m['filament.fields.name'] },
		{ key: 'material', label: m['filament.fields.material'] },
		{ key: 'colorHex', label: m['filament.fields.colorHex'] },
		{ key: 'density', label: m['filament.fields.density'] },
		{ key: 'diameter', label: m['filament.fields.diameter'] },
		{ key: 'nozzleTemp', label: m['filament.fields.settingsExtruderTemp'] },
		{ key: 'bedTemp', label: m['filament.fields.settingsBedTemp'] },
		{ key: 'count', label: m['add.count'] },
		{ key: 'netWeight', label: m['filament.fields.weight'] },
		{ key: 'spoolWeight', label: m['filament.fields.spoolWeight'] },
		{ key: 'price', label: m['filament.fields.price'] },
		{ key: 'fillWeight', label: m['add.fillLevel'] }
	];
	// Fields inside the collapsed "Advanced specs" block. An error in here is
	// invisible until the block is opened — the one case where the form really could
	// look complete and still refuse to submit — so both the summary and the toggle
	// have to account for it.
	const ADVANCED_KEYS = new Set(['density', 'diameter', 'nozzleTemp', 'bedTemp']);

	let problems = $derived.by(() => {
		const listed = new Set(FIELD_LABELS.map((f) => f.key));
		const out = FIELD_LABELS.filter((f) => errors[f.key]).map((f) => ({
			key: f.key,
			label: f.label(),
			msg: errors[f.key]
		}));
		for (const k of Object.keys(errors)) if (!listed.has(k)) out.push({ key: k, label: k, msg: errors[k] });
		return out;
	});
	// Shown next to the collapsed toggle so a hidden problem is still countable.
	let advancedProblems = $derived(problems.filter((p) => ADVANCED_KEYS.has(p.key)).length);

	function touch(key: string) {
		touched[key] = true;
	}
	/** The error to display for a field — empty until that field is revealed. */
	function err(key: string): string {
		return attempted || touched[key] ? (errors[key] ?? '') : '';
	}

	/** Scroll a field into view and put focus in it, opening its section if needed. */
	async function focusField(key: string) {
		if (ADVANCED_KEYS.has(key)) showAdvanced = true;
		await tick();
		const host = modalEl?.querySelector<HTMLElement>(`[data-field="${key}"]`);
		if (!host) return;
		host.scrollIntoView({ block: 'center', behavior: 'smooth' });
		// preventScroll: the smooth scroll above is already on its way there.
		host.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') close();
	}}
/>

<!-- The one marker for "this must be filled in", used on every required field and
     on nothing else. It is decoration: the control itself carries aria-required, so
     screen readers hear the requirement rather than an asterisk. -->
{#snippet req()}<span class="req" title={m['validation.required']()} aria-hidden="true">*</span>{/snippet}

{#if open}
	<div class="overlay">
		<!-- Click-outside catcher: a sibling of the modal (not a parent) so it doesn't
		     nest the modal's interactive controls inside an interactive element.
		     Keyboard close is handled by the window Escape listener above. -->
		<button class="backdrop" tabindex="-1" aria-hidden="true" onclick={close}></button>
		<div class="modal" role="dialog" aria-modal="true" tabindex="-1" bind:this={modalEl}>
			<div class="modal-head">
				<span class="title">{m['topbar.addSpools']()}</span>
				{#if step === 2}
					<!-- Creating a filament puts manufacturer and filament fields on this step
					     too, so the hint can't call the whole step "spool details". -->
					<span class="step-hint">{creating ? m['add.step2New']() : m['add.step2']()}</span>
					<!-- Says what the asterisks mean, once, where they're first seen. -->
					<span class="req-legend">{@render req()} {m['add.requiredLegend']()}</span>
				{/if}
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			{#if step === 1}
				<div class="body">
					<input
						bind:this={searchInput}
						class="search-big"
						value={query}
						oninput={(e) => onSearch(e.currentTarget.value)}
						placeholder={m['add.searchPlaceholder']({ name: serverInfo.externalDbName })}
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
									<Swatch colors={f.colors} direction={f.multiColorDirection} size={18} radius={5} />
									<div class="res-name">
										<span class="rn">{f.name}</span>
										<span class="rs">{vendorName(f)} · {f.material}</span>
									</div>
									<!-- See the note on the external rows below: weight disambiguates two
									     otherwise identical entries, so it sits outside the truncating
									     .res-name. A catalog filament may have no weight recorded (0). -->
									{#if f.weight}
										<span class="res-weight">{weightAuto(f.weight)}</span>
									{/if}
									<span class="tag in-catalog">{m['add.inCatalog']()}</span>
								</button>
							{/each}
						{/if}

						<div class="res-hdr"><span class="hdr-note">{serverInfo.externalDbName}</span></div>
						{#if extError}
							<div class="res-note">{m['add.dbUnavailable']({ name: serverInfo.externalDbName })}</div>
						{:else if searching && externalResults.length === 0}
							<div class="res-note">{m['add.searching']()}</div>
						{:else if externalResults.length === 0}
							<div class="res-note">
								{query.trim() ? m['add.typeToSearchMatches']() : m['add.typeToSearchAll']()}
							</div>
						{:else}
							{#each externalResults as ext (ext.id)}
								<button class="res-item" onclick={() => choose({ source: 'external', ext })}>
									<Swatch
										colors={externalColors(ext)}
										direction={externalDirection(ext)}
										size={18}
										radius={5}
									/>
									<div class="res-name">
										<span class="rn">{ext.name}</span>
										<span class="rs">{ext.manufacturer} · {ext.material}</span>
									</div>
									<!-- Weight is part of the identity here: vendors list the same filament in
									     several sizes, so the rows are otherwise indistinguishable. It sits
									     outside .res-name so the ellipsis can never eat the one field that
									     tells two matching results apart. -->
									{#if ext.weight}
										<span class="res-weight">{weightAuto(ext.weight)}</span>
									{/if}
									<span class="tag external">{serverInfo.externalDbName}</span>
								</button>
							{/each}
						{/if}
					</div>

					<button class="create-new" onclick={startCreate}>
						<span class="cn-plus"><Plus size={16} /></span>
						<span>{m['add.createNew']()}</span>
						<span class="cn-sub">{m['add.createNewSub']({ name: serverInfo.externalDbName })}</span>
					</button>
				</div>
			{:else}
				<div class="body">
					<!-- Step 2 can create up to three records at once, so it is laid out as one
					     block per entity — manufacturer, filament, spool — each with its own
					     heading. Without that, the fields read as one flat form and there is no
					     way to tell which record any given field lands on (#1038). The two
					     new-record blocks are accent-bordered cards; the spool block is the
					     plain remainder of the form, since a spool is always being created and
					     needs no such emphasis. -->
					{#if creating}
						<!-- Manufacturer: its own record, so its own card — a vendor combobox
						     sitting among the filament fields, quietly creating a second entity,
						     was the most confusing part of the flow. -->
						<section class="new-section man-section">
							<label class="ent-field" data-field="vendor" onfocusout={() => touch('vendor')}>
								<span class="ent-label">{m['add.section.manufacturer']()}</span>
								<span class="ent-note">{m['add.section.manufacturerNote']()}</span>
								<Combobox
									value={nf.vendorName}
									options={vendorNames}
									placeholder={m['add.manufacturerPlaceholder']()}
									invalid={!!err('vendor')}
									oninput={(v) => (nf.vendorName = v)}
								/>
								{#if err('vendor')}
									<span class="err">{err('vendor')}</span>
								{:else}
									<span class="hint" class:accent={vendorIsNew}>{vendorHint}</span>
								{/if}
							</label>
						</section>
						<section class="new-section">
							<div class="fs-head">
								<span class="ent-label">{m['add.section.filament']()}</span>
								<button class="fs-back" onclick={() => (step = 1)}>{m['add.useExisting']()}</button>
							</div>
							<div class="fs-title">
								{cloneSource
									? m['add.duplicateTitle']({ name: cloneSource.name })
									: m['add.newFilamentTitle']()}
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
										bind:value={nf.name}
										placeholder={m['add.filamentNamePlaceholder']()}
										aria-required="true"
										aria-invalid={!!err('name')}
										class:invalid={!!err('name')}
									/>
									<!-- The rename nudge only outranks the naming hint while the copy
								     still carries the original's name; after that both cases get the
								     same advice, since color is what makes a filament name useful. -->
									{#if err('name')}<span class="err">{err('name')}</span>
									{:else if nameStillSource}<span class="hint accent">{m['add.duplicateRename']()}</span>
									{:else}<span class="hint">{m['add.nameHint']()}</span>{/if}
								</label>
								<label data-field="material" onfocusout={() => touch('material')}>
									{m['filament.fields.material']()}
									<Combobox
										value={nf.material}
										options={materialNames}
										placeholder="PLA"
										invalid={!!err('material')}
										oninput={onMaterial}
									/>
									{#if err('material')}<span class="err">{err('material')}</span>{/if}
								</label>
								<label class="color-field wide" data-field="colorHex" onfocusout={() => touch('colorHex')}>
									{m['filament.fields.colorHex']()}
									<div class="color-editor-wrap">
										<ColorEditor
											colors={nf.colors}
											direction={nf.multiColorDirection}
											onchange={(v) => {
												nf.colors = v.colors;
												nf.multiColorDirection = v.direction;
											}}
										/>
									</div>
									{#if err('colorHex')}<span class="err">{err('colorHex')}</span>{/if}
								</label>
							</div>
							<button class="adv-toggle" onclick={() => (showAdvanced = !showAdvanced)}>
								{#if showAdvanced}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
								{m['add.advanced']()}
								<!-- A collapsed section can hide a required field (density is only
								     prefilled for known materials), so count what's wrong inside it
								     rather than let the block look settled. -->
								{#if !showAdvanced && attempted && advancedProblems > 0}
									<span class="adv-badge">{m['add.problems']({ count: advancedProblems })}</span>
								{:else if !showAdvanced}
									<span class="adv-note">{m['add.advancedNote']()}</span>
								{/if}
							</button>
							{#if showAdvanced}
								<div class="form">
									<label data-field="density" onfocusout={() => touch('density')}
										>{m['filament.fields.density']()}
										{@render req()}
										<NumberInput
											bind:value={nf.density}
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
											bind:value={nf.diameter}
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
											bind:value={nf.nozzleTemp}
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
											bind:value={nf.bedTemp}
											min={0}
											step={5}
											unit="°C"
											placeholder="—"
											spaced
											invalid={!!err('bedTemp')}
										/>
										{#if err('bedTemp')}<span class="err">{err('bedTemp')}</span>{/if}
									</label>
									<label>
										{m['filament.fields.articleNumber']()}
										<input class="mono" bind:value={nf.articleNumber} placeholder="—" />
									</label>
									<label class="wide">
										{m['filament.fields.comment']()}
										<input bind:value={nf.comment} placeholder="—" />
									</label>
								</div>
							{/if}
							<!-- Outside the advanced block: a custom field only exists because
							     someone defined it, so it isn't an advanced detail to them. The
							     section renders nothing when no filament fields are defined. -->
							<ExtraFieldsSection entity="filament" extra={filamentExtra} onchange={setFilamentExtra} />
						</section>
					{:else if chosen}
						<!-- No card here: the chosen-filament row is already a self-contained
						     bordered block, so it only needs the heading that names the entity. -->
						<div class="ent-label standalone">{m['add.section.filament']()}</div>
						<div class="chosen">
							<Swatch colors={cColors(chosen)} direction={cDirection(chosen)} size={24} radius={6} />
							<div class="chosen-name">
								<div class="cn">
									{cName(chosen)}
									{#if chosen.source === 'external'}<span class="tag external sm"
											>{serverInfo.externalDbName}</span
										>{/if}
								</div>
								<!-- Weight closes the loop on the search rows: it confirms which of several
								     same-named sizes was picked. This is the filament's full-spool weight, so
								     it stays put even if the Weight field below is edited for this spool. -->
								<div class="cs">
									{cVendor(chosen)} · {cMaterial(chosen)}{cWeight(chosen)
										? ' · ' + weightAuto(cWeight(chosen))
										: ''}
								</div>
							</div>
							<!-- Found the right product but the wrong colour? Branch off it here
							     rather than backing out and filling a blank form. -->
							{#if chosen.source === 'catalog'}
								{@const src = chosen.filament}
								<button class="change" onclick={() => startDuplicate(src)}>{m['add.duplicate']()}</button>
							{/if}
							<button class="change" onclick={() => (step = 1)}>{m['add.change']()}</button>
						</div>
						{#if chosen.source === 'external'}
							<div class="import-note">{m['add.importNote']()}</div>
						{/if}
					{/if}

					<!-- Spool section -->
					<div class="sec-divider"></div>
					<div class="ent-label standalone">{m['add.section.spool']()}</div>
					<div class="ent-note">{m['add.section.spoolNote']()}</div>
					{#if creating}
						<!-- Weight, spool weight and price below are written to the new filament as
						     well as to the spool, which is the one place in this layout where a
						     field genuinely belongs to two records. Say so rather than let the
						     heading imply the filament is unaffected. -->
						<div class="ent-note shared">{m['add.section.spoolSharedNote']()}</div>
					{/if}
					<div class="form">
						<label data-field="count" onfocusout={() => touch('count')}
							>{m['add.count']()}
							{@render req()}
							<NumberInput bind:value={count} min={1} step={1} spaced required invalid={!!err('count')} />
							{#if err('count')}<span class="err">{err('count')}</span>{/if}
						</label>
						<label data-field="netWeight" onfocusout={() => touch('netWeight')}
							>{m['filament.fields.weight']()}
							<button
								type="button"
								class="help-toggle"
								aria-label={m['help.help']()}
								aria-controls="weight-help"
								aria-expanded={openHelp === 'weight'}
								onclick={() => (openHelp = openHelp === 'weight' ? null : 'weight')}>ⓘ</button
							>
							<NumberInput
								bind:value={netWeight}
								min={0}
								step={50}
								unit="g"
								spaced
								invalid={!!err('netWeight')}
							/>
							{#if openHelp === 'weight'}
								<span class="help-popup" id="weight-help" role="note"
									>{m['filament.fieldsHelp.weight']()}</span
								>
							{/if}
							{#if err('netWeight')}<span class="err">{err('netWeight')}</span>{/if}
						</label>
						<label data-field="spoolWeight" onfocusout={() => touch('spoolWeight')}
							>{m['filament.fields.spoolWeight']()}
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
								unit="g"
								placeholder="—"
								spaced
								invalid={!!err('spoolWeight')}
							/>
							{#if openHelp === 'spoolWeight'}
								<span class="help-popup" id="spoolWeight-help" role="note">
									{m['filament.fieldsHelp.spoolWeight']()}
									<!-- Buttons nested in the <label>: a click on interactive content is
									     not forwarded to the labelled input, so picking a preset doesn't
									     also yank focus into the weight field. -->
									<span class="presets">
										<span class="presets-lead">{m['add.spoolWeightPresetsLead']()}</span>
										{#each SPOOL_WEIGHT_PRESETS as preset (preset.weight)}
											<button
												type="button"
												class="preset"
												onclick={() => {
													spoolWeight = String(preset.weight);
													openHelp = null;
												}}>{preset.label()}</button
											>
										{/each}
									</span>
								</span>
							{/if}
							{#if err('spoolWeight')}<span class="err">{err('spoolWeight')}</span>{/if}
						</label>
						<label data-field="price" onfocusout={() => touch('price')}
							>{m['filament.fields.price']()} <span class="u">{settings.currency}</span>
							<NumberInput bind:value={price} min={0} placeholder="—" spaced invalid={!!err('price')} />
							{#if err('price')}<span class="err">{err('price')}</span>{/if}
						</label>
						<label>{m['spool.fields.lotNr']()}<input class="mono" bind:value={lot} placeholder="—" /></label>
						<label class="wide">
							{m['spool.fields.location']()}
							<Combobox
								value={location}
								options={locations}
								placeholder={m['add.locationPlaceholder']()}
								oninput={(v) => (location = v)}
							/>
							<!-- Always-on rather than behind the ⓘ used elsewhere: "Location" reads as
							     metadata until you're told it means the physical shelf, and testers
							     didn't open a popup to find that out. -->
							<span class="hint">{m['add.locationHint']()}</span>
						</label>
					</div>

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
							<div class="fill-input" data-field="fillWeight" onfocusout={() => touch('fillWeight')}>
								<NumberInput
									bind:value={fillWeight}
									min={0}
									step={10}
									unit="g"
									placeholder="0"
									width="130px"
									invalid={!!err('fillWeight')}
									ariaLabel={m['add.fillLevel']()}
								/>
								<span class="fill-help" class:is-error={!!err('fillWeight')}
									>{err('fillWeight') || fillHelp}</span
								>
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

					<!-- Appears only once Add has been pressed, then stays as a live checklist:
					     rows disappear as they're fixed. Each row jumps to its field, which is
					     the whole point — reading "Density: Required" is no help if you can't
					     find Density. -->
					{#if attempted && problems.length > 0}
						<div class="problems" role="alert">
							<div class="p-head">
								<TriangleAlert size={14} />
								{m['add.problemsLead']({ count: problems.length })}
							</div>
							<ul class="p-list">
								{#each problems as p (p.key)}
									<li>
										<button type="button" class="p-item" onclick={() => focusField(p.key)}>
											<span class="p-name">{p.label}</span>
											<span class="p-msg">{p.msg}</span>
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div class="submit-row">
						<div class="summary">{summary}</div>
						<div class="actions">
							<Button variant="outline" disabled={submitting} onclick={() => submit(true)}
								>{m['add.addAndNew']()}</Button
							>
							<Button disabled={submitting} onclick={() => submit(false)}>
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
	.backdrop {
		position: fixed;
		inset: 0;
		border: none;
		margin: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.modal {
		position: relative;
		z-index: 1;
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
		/* Wraps rather than squeezes: the step hint and the asterisk legend both sit
		   here, and on a phone they don't fit on one line next to the title. */
		flex-wrap: wrap;
		gap: 4px 10px;
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
	.req-legend {
		font-size: 11.5px;
		color: var(--text-faint);
		white-space: nowrap;
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
		background: var(--surface);
		border-top: 1px solid var(--border);
		position: sticky;
		top: 0;
		/* Sit above scrolling rows: their swatches are position:relative, so
		   without this the header's opaque background hides the row text but the
		   positioned swatch still paints on top of the sticky header. */
		z-index: 1;
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
		background: var(--surface-raised);
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
	.res-weight {
		flex: none;
		white-space: nowrap;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--text);
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
		color: var(--text-2);
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
		border: 1px solid var(--swatch-border);
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
		color: var(--accent-muted-2);
	}
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
	.ent-label.standalone {
		margin-bottom: 6px;
	}
	.ent-note {
		display: block;
		font-size: 11.5px;
		color: var(--text-faint);
		margin: 2px 0 8px;
	}
	.ent-note.shared {
		color: var(--accent-muted-2);
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
	/* Separates the records being created from the spool block. Deliberately
	   heavier than --border-soft, which was invisible against the light theme's
	   card backgrounds and left the two blocks looking like one run of fields. */
	.sec-divider {
		height: 1px;
		background: var(--border);
		margin: 16px 0 12px;
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
	.adv-badge {
		border: 1px solid var(--danger);
		border-radius: 999px;
		padding: 1px 8px;
		font-size: 11px;
		color: var(--danger-soft);
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
	.presets {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
	}
	.presets-lead {
		color: var(--text-faint);
	}
	.preset {
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 999px;
		padding: 3px 10px;
		color: var(--accent-link);
		font-family: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	.preset:hover {
		border-color: var(--accent);
		background: var(--accent-wash-soft);
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
	.fill-help.is-error {
		color: var(--danger-soft);
	}
	.problems {
		margin-top: 18px;
		padding: 10px 12px;
		border: 1px solid var(--danger);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}
	.p-head {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		font-weight: 600;
		color: var(--danger-soft);
	}
	.p-list {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.p-item {
		display: flex;
		align-items: baseline;
		gap: 8px;
		width: 100%;
		/* Tall enough to be a comfortable tap target on the phone layout. */
		min-height: 26px;
		padding: 4px 6px;
		margin-left: -6px;
		border: none;
		border-radius: var(--radius);
		background: none;
		color: inherit;
		font-family: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}
	.p-item:hover {
		background: var(--surface-raised);
	}
	.p-name {
		font-weight: 600;
		color: var(--text-2);
		/* Reads as the link it is: clicking jumps to the field. */
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}
	.p-msg {
		color: var(--text-muted);
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
