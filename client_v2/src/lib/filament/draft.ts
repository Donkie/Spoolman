// The new-filament form, as data.
//
// Two dialogs now let you describe a filament that exists in neither the local
// catalog nor SpoolmanDB: the add-spools flow, and the change-filament dialog
// (issue #1010 — "I ran out of slot #13 and refilled it with something new").
// Both need the same fields, the same rules and the same mapping onto the API,
// so all three live here and the components only draw them.
//
// Every value is a string, because that is what the user typed: a half-entered
// "1," has to survive a keystroke without being coerced to a number and back.
// Conversion happens once, at submit, in {@link toNewFilamentDraft}.

import type { Extra, Filament, MultiColorDirection } from '$lib/types';
import type { NewFilamentDraft } from '$lib/api/spoolSource';
import { parseDecimal } from '$lib/utils/numeric';
import { HEX_RE, numErr } from '$lib/utils/validate';
import type { MaterialSpec } from '$lib/data/materials';
import * as m from '$lib/paraglide/messages';

/** What identifies and specifies a filament, as typed into a form. */
export interface FilamentDraft {
	vendorName: string;
	name: string;
	material: string;
	colors: string[];
	multiColorDirection: MultiColorDirection | undefined;
	density: string;
	diameter: string;
	nozzleTemp: string;
	bedTemp: string;
	articleNumber: string;
	comment: string;
}

/**
 * The three numbers that describe how much filament a full spool of this holds
 * and what it cost. Kept out of {@link FilamentDraft} because the add-spools flow
 * writes them to the spool it creates as well as to the filament, and so shows
 * them in its own spool block rather than among the filament fields.
 */
export interface FilamentWeights {
	weight: string;
	spoolWeight: string;
	price: string;
}

/** 1.75 mm is what the overwhelming majority of spools are; 2.85 is the exception. */
const DEFAULT_DIAMETER = '1.75';

/** A blank draft, optionally seeded with a name the user has already typed elsewhere. */
export function emptyFilamentDraft(name = ''): FilamentDraft {
	return {
		vendorName: '',
		name,
		material: '',
		colors: [],
		multiColorDirection: undefined,
		density: '',
		diameter: DEFAULT_DIAMETER,
		nozzleTemp: '',
		bedTemp: '',
		articleNumber: '',
		comment: ''
	};
}

/**
 * A draft copied from an existing filament — the "I bought the same filament in
 * another colour" case. Everything that describes the *product* carries over;
 * everything that identifies the *variant* is left for the user: the colour is
 * cleared and the article number (a per-colour SKU) is dropped. The name is kept
 * as a starting point since it is usually one word away from the new one.
 */
export function filamentDraftFrom(f: Filament, vendorName: string): FilamentDraft {
	return {
		vendorName,
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
}

/** The weights of an existing filament, for a draft copied from it. */
export function filamentWeightsFrom(f: Filament): FilamentWeights {
	return {
		weight: String(f.weight || 1000),
		spoolWeight: f.spoolWeight ? String(f.spoolWeight) : '',
		price: f.price ? String(f.price) : ''
	};
}

/**
 * Fill in density and print temps for a material the app knows about, leaving the
 * draft untouched for one it doesn't — typing a custom material must not wipe
 * figures the user entered by hand.
 */
export function applyMaterialSpec(
	draft: FilamentDraft,
	material: string,
	specs: Record<string, MaterialSpec>
): void {
	draft.material = material;
	const spec = specs[material.trim().toLowerCase()];
	if (!spec) return;
	draft.density = String(spec.density);
	if (spec.nozzle != null) draft.nozzleTemp = String(spec.nozzle);
	if (spec.bed != null) draft.bedTemp = String(spec.bed);
}

/**
 * The filament fields that can carry an error, in the order they appear in the
 * cards, so pressing submit sends you to the first one you'd have reached by
 * reading down. Callers weave in the fields they draw themselves — the weight
 * trio included, since where those sit differs per dialog.
 */
export const FILAMENT_FIELD_ORDER = [
	'vendor',
	'name',
	'material',
	'colorHex',
	'density',
	'diameter',
	'nozzleTemp',
	'bedTemp'
];

/**
 * Filament fields inside the collapsed "Advanced specs" block. An error in here
 * is invisible until the block is opened — the one case where a form really can
 * look complete and still refuse to submit — so jumping to one has to open it.
 * Callers add their own: a dialog that shows the weight trio in this component
 * puts spoolWeight and price in there too.
 */
export const FILAMENT_ADVANCED_KEYS = ['density', 'diameter', 'nozzleTemp', 'bedTemp'];

/**
 * Field errors for the filament half of a form, keyed by field name ('' entries
 * dropped, so an empty object means valid).
 *
 * Mirrors the filament creation API (spoolman/api/v1/filament.py): density and
 * diameter are required and must be > 0; name/material/vendor are capped at 64
 * chars; colors must be 6 or 8 hex digits. Material is required by this client
 * even though the API accepts a filament without one — a blank material would
 * otherwise surface as "Density is required", an error on the field you didn't
 * fill in because of the one you did miss. Pass `weights` for the callers that
 * show those fields here rather than on a spool.
 */
export function filamentDraftErrors(draft: FilamentDraft, weights?: FilamentWeights): Record<string, string> {
	const e: Record<string, string> = {};
	if (draft.name.trim().length === 0) e.name = m['validation.required']();
	else if (draft.name.trim().length > 64) e.name = m['validation.maxChars']({ max: 64 });
	if (draft.material.trim().length === 0) e.material = m['validation.required']();
	else if (draft.material.trim().length > 64) e.material = m['validation.maxChars']({ max: 64 });
	if (draft.vendorName.trim().length > 64) e.vendor = m['validation.maxChars']({ max: 64 });
	e.density = numErr(draft.density, { required: true, gt: 0 });
	e.diameter = numErr(draft.diameter, { required: true, gt: 0 });
	e.nozzleTemp = numErr(draft.nozzleTemp, { min: 0 });
	e.bedTemp = numErr(draft.bedTemp, { min: 0 });
	if (draft.colors.some((c) => c.trim() && !HEX_RE.test(c.trim()))) e.colorHex = m['validation.hexDigits']();
	if (weights) {
		e.netWeight = numErr(weights.weight, { gt: 0 });
		e.spoolWeight = numErr(weights.spoolWeight, { min: 0 });
		e.price = numErr(weights.price, { min: 0 });
	}
	for (const k of Object.keys(e)) if (!e[k]) delete e[k];
	return e;
}

/** Number as typed, or undefined when blank/unparseable — the API omits either way. */
function num(v: string): number | undefined {
	return parseDecimal(v) ?? undefined;
}

/**
 * Same, but treating zero as "not given". The weight/price trio is optional on a
 * filament and a recorded zero says nothing a missing value doesn't, so a blank
 * and a typed 0 are sent identically rather than pinning the record to 0.
 */
function numPos(v: string): number | undefined {
	return num(v) || undefined;
}

/** Turn a validated draft into the body {@link spoolSource.createFilament} expects. */
export function toNewFilamentDraft(
	draft: FilamentDraft,
	weights: FilamentWeights,
	extra: Extra
): NewFilamentDraft {
	return {
		name: draft.name.trim(),
		vendorName: draft.vendorName.trim(),
		material: draft.material.trim(),
		// Both are required and > 0 by the time this runs, so the fallbacks below are
		// only there to keep the types honest.
		density: num(draft.density) ?? 0,
		diameter: numPos(draft.diameter) ?? Number(DEFAULT_DIAMETER),
		weight: numPos(weights.weight),
		spoolWeight: numPos(weights.spoolWeight),
		colors: draft.colors,
		multiColorDirection: draft.multiColorDirection,
		nozzleTemp: numPos(draft.nozzleTemp),
		bedTemp: numPos(draft.bedTemp),
		price: numPos(weights.price),
		articleNumber: draft.articleNumber.trim() || undefined,
		comment: draft.comment.trim() || undefined,
		extra
	};
}
