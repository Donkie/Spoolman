// Shared behaviour for every numeric field in the app.
//
// Two problems this solves, both of which `<input type="number">` handles badly:
//
//  1. Decimal comma. Most of the world writes "1,75", not "1.75". A native number
//     input only accepts the separator the *browser locale* dictates and reports
//     `.value === ''` for anything it considers invalid — so a user typing "1,75"
//     can silently end up submitting an empty field.
//  2. Junk characters. A number input happily accepts "e", "+" and "-" anywhere in
//     the text (they're legal in exponent syntax) and then reports the whole value
//     as empty, so "1e" reads back as nothing at all.
//
// So numeric fields are plain text inputs with `inputmode="decimal"`, guarded by the
// `numericInput` action below and parsed with `parseDecimal`. Both '.' and ',' are
// accepted while typing; everything stored or handed to a parent is canonical (dot).

/** Canonical form of a number as typed: decimal comma becomes a decimal point. */
export function normalizeDecimal(raw: string): string {
	return raw.replace(',', '.');
}

// Deliberately stricter than Number(): no hex, no exponents, no "Infinity", no
// embedded whitespace — a field that only ever holds a plain decimal number.
const DECIMAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Parse user-entered text as a number, accepting either decimal separator.
 * Returns null for anything that isn't a plain finite decimal — including empty
 * text and half-typed values like "-" or "," — so callers can tell "no value"
 * apart from a real 0.
 */
export function parseDecimal(raw: string | number | null | undefined): number | null {
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
	if (raw == null) return null;
	const t = normalizeDecimal(raw).trim();
	if (!DECIMAL_RE.test(t)) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

export interface NumericInputOptions {
	/** Allow a leading minus sign. Defaults to true. */
	negative?: boolean;
}

/**
 * Is this text *on its way* to being a number? "", "-", "1,", ",5" all qualify —
 * a keystroke filter has to let a partially typed number through.
 */
export function isPartialDecimal(s: string, negative = true): boolean {
	return negative ? /^-?\d*[.,]?\d*$/.test(s) : /^\d*[.,]?\d*$/.test(s);
}

/**
 * The usable part of `data` when inserted between `before` and `after`.
 *
 * Leading junk is skipped ("$12,5" → "12,5"), then characters are taken while the
 * field would still read as a number and dropped from the first one that wouldn't
 * ("12,5 g" → "12,5", "1.2.3" → "1.2"). Truncating rather than deleting the stray
 * separator matters: turning a pasted "1.2.3" into "1.23" would silently inflate a
 * weight tenfold. Used for pasted and dropped text, where rejecting the whole
 * insertion would be more annoying than cleaning it.
 */
export function filterDecimalInsertion(
	data: string,
	before = '',
	after = '',
	{ negative = true }: NumericInputOptions = {}
): string {
	let out = '';
	let started = false;
	for (const c of data) {
		if (isPartialDecimal(before + out + c + after, negative)) {
			out += c;
			started = true;
		} else if (started) {
			break; // stop at the first character that no longer fits
		}
	}
	return out;
}

/**
 * Svelte action that makes a text input reject anything that isn't part of a
 * decimal number, whether typed, pasted or dropped. Both '.' and ',' survive —
 * normalizing to a point is the reader's job (`parseDecimal`), so the user keeps
 * seeing the separator they typed.
 *
 * Svelte delegates `input`/`beforeinput` to the app root, so these node-level
 * listeners run before the component's own handlers: by the time an `oninput`
 * handler reads `.value`, it has already been cleaned.
 */
export function numericInput(node: HTMLInputElement, options: NumericInputOptions = {}) {
	let opts = options;
	const negative = () => opts.negative !== false;

	function onBeforeInput(e: InputEvent) {
		if (!e.inputType.startsWith('insert')) return; // deletions are always fine
		const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
		if (!data) return;
		const start = node.selectionStart ?? node.value.length;
		const end = node.selectionEnd ?? start;
		const before = node.value.slice(0, start);
		const after = node.value.slice(end);
		if (isPartialDecimal(before + data + after, negative())) return;

		// Not insertable as typed: drop the event and put back whatever was usable.
		e.preventDefault();
		const cleaned = filterDecimalInsertion(data, before, after, opts);
		if (!cleaned) return;
		node.setRangeText(cleaned, start, end, 'end');
		node.dispatchEvent(new Event('input', { bubbles: true }));
	}

	// Safety net for text that arrives without a beforeinput event (autofill,
	// speech input, a browser that skips it).
	function onInput() {
		if (isPartialDecimal(node.value, negative())) return;
		const caret = node.selectionStart ?? node.value.length;
		node.value = filterDecimalInsertion(node.value, '', '', opts);
		const pos = Math.min(caret, node.value.length);
		node.setSelectionRange(pos, pos);
	}

	node.addEventListener('beforeinput', onBeforeInput);
	node.addEventListener('input', onInput);

	return {
		update(next: NumericInputOptions = {}) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('beforeinput', onBeforeInput);
			node.removeEventListener('input', onInput);
		}
	};
}
