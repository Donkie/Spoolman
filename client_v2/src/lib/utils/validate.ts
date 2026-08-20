// Form-validation helpers shared by the dialogs that write filaments and spools.
//
// These mirror the API's own rules (spoolman/api/v1/filament.py, spool.py) so a
// form can say what is wrong before the request goes out, rather than surfacing a
// 422 after the fact.

import { parseDecimal } from './numeric';
import * as m from '$lib/paraglide/messages';

export interface NumErrOptions {
	/** Empty text is an error rather than "no value given". */
	required?: boolean;
	min?: number;
	max?: number;
	/** Strict lower bound, for the fields the API rejects at zero (density, diameter). */
	gt?: number;
}

/**
 * Validate one numeric field as typed, returning a translated message or '' when
 * it is fine. Empty text passes unless `required` — an optional number left blank
 * is not an error.
 *
 * Parsing goes through {@link parseDecimal}, so a decimal comma is accepted here
 * exactly as it is in the inputs themselves.
 */
export function numErr(v: string, { required = false, min, max, gt }: NumErrOptions = {}): string {
	const t = v.trim();
	if (t === '') return required ? m['validation.required']() : '';
	const n = parseDecimal(t);
	if (n === null) return m['validation.mustBeNumber']();
	if (gt != null && n <= gt) return m['validation.mustBeGt']({ value: gt });
	if (min != null && n < min) return m['validation.mustBeMin']({ value: min });
	if (max != null && n > max) return m['validation.mustBeMax']({ value: max });
	return '';
}

/** A color as the API accepts it: 6 hex digits, or 8 with alpha. Leading '#' optional. */
export const HEX_RE = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
