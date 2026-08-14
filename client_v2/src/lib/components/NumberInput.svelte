<script lang="ts">
	import { untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { getFieldLabelId } from './fieldLabel';
	import { normalizeDecimal, numericInput, parseDecimal } from '$lib/utils/numeric';
	// A themed numeric input. It is a text input rather than `type="number"`: that
	// lets it accept a decimal comma ("1,75") as well as a point, and lets it refuse
	// letters outright instead of silently reporting an unparseable value as empty.
	// See $lib/utils/numeric.ts. Steppers are ours too, styled to match the dark UI.
	//
	// Two usage modes:
	//   1. String/bindable (default): `bind:value` with a string; updates live on input.
	//   2. Numeric/commit: pass `onchange` (and a number/string `value`); the value is
	//      controlled and `onchange` fires with the parsed number on blur/step. Handy for
	//      callers that keep numbers in an immutable object and commit on change.
	interface Props {
		value: string | number;
		min?: number;
		max?: number;
		step?: number;
		placeholder?: string;
		/** Wrapper width (any CSS length). Defaults to filling its container. */
		width?: string;
		/** Add the 5px top margin used by form fields under their label. */
		spaced?: boolean;
		/** Render with an error outline. Also announced via aria-invalid. */
		invalid?: boolean;
		/** Announce the field as required. The visible marker is the caller's `*`. */
		required?: boolean;
		/** Optional unit shown inside the input on the right (e.g. "mm", "g"). */
		unit?: string;
		/** Compact sizing for dense side panels (smaller font/padding). */
		dense?: boolean;
		/** Disable the input and steppers. */
		disabled?: boolean;
		/** Commit callback. When set, the component runs in numeric/commit mode. */
		onchange?: (value: number) => void;
		/** Commit-mode only: called instead of `onchange` when the field is left empty,
		    for fields where blank means "unset" (e.g. a price that falls back to a default). */
		onclear?: () => void;
		/** Accessible name, for use outside a <Field> or <label> that supplies one. */
		ariaLabel?: string;
	}
	let {
		value = $bindable(),
		min,
		max,
		step = 1,
		placeholder,
		width = '100%',
		spaced = false,
		invalid = false,
		required = false,
		unit,
		dense = false,
		disabled = false,
		onchange,
		onclear,
		ariaLabel
	}: Props = $props();

	// Named by the enclosing <Field>'s label cell when there is one; see fieldLabel.ts.
	const labelId = getFieldLabelId();

	// What the parent sees is always canonical (a dot, or a number). What the user
	// sees is the text they typed, kept here as a draft — that's how a decimal comma,
	// and a half-finished "1," or "", survive a round trip through the parent.
	// The draft is dropped as soon as the parent moves the value somewhere the draft
	// doesn't mean (a clamp, a preset button, another element selected); a value that
	// merely echoes back what was typed leaves it alone. In commit mode the draft is
	// also what defers `onchange` until blur or a step.
	let draft = $state<string | null>(null);
	const external = $derived(value == null ? '' : String(value));
	const shown = $derived(draft ?? external);
	$effect(() => {
		const incoming = external;
		untrack(() => {
			if (draft !== null && parseDecimal(draft) !== parseDecimal(incoming)) draft = null;
		});
	});
	// A minus sign is only offered where a negative value is actually allowed.
	const negative = $derived(min == null || min < 0);

	function clamp(n: number): number {
		if (min != null && n < min) n = min;
		if (max != null && n > max) n = max;
		return n;
	}
	function onInput(v: string) {
		draft = v;
		if (!onchange) value = normalizeDecimal(v);
	}
	function commit() {
		if (!onchange) return;
		const raw = (draft ?? external).trim();
		if (onclear && raw === '') onclear();
		else onchange(clamp(parseDecimal(raw) ?? 0));
	}
	function bump(dir: 1 | -1) {
		const base = parseDecimal(shown) ?? min ?? 0;
		let next = clamp(base + dir * step);
		next = Math.round(next * 1e6) / 1e6; // trim float noise
		draft = String(next);
		if (onchange) onchange(next);
		else value = String(next);
	}
	// A text input has no native stepping, so keep the arrow keys a number input gave us.
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			bump(1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			bump(-1);
		}
	}
</script>

<div class="ni" class:spaced class:invalid class:dense class:disabled style:width>
	<!-- value/oninput (not bind:value) so the value stays a string, and so the draft
	     above decides what is displayed. `numericInput` filters the keystrokes; min,
	     max and step are enforced by this component, not by the browser. -->
	<input
		class="mono"
		type="text"
		use:numericInput={{ negative }}
		value={shown}
		oninput={(e) => onInput(e.currentTarget.value)}
		onchange={commit}
		onkeydown={onKeydown}
		{placeholder}
		{disabled}
		aria-label={ariaLabel}
		aria-labelledby={ariaLabel ? undefined : labelId}
		aria-required={required ? 'true' : undefined}
		aria-invalid={invalid ? 'true' : undefined}
		inputmode="decimal"
		autocomplete="off"
		spellcheck="false"
	/>
	{#if unit}<span class="unit">{unit}</span>{/if}
	<div class="spin">
		<button
			type="button"
			tabindex="-1"
			{disabled}
			aria-label={m['common.increment']()}
			onmousedown={(e) => (e.preventDefault(), bump(1))}
		>
			<svg viewBox="0 0 10 6" width="9" height="6"
				><path
					d="M1 5 L5 1 L9 5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.4"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		</button>
		<button
			type="button"
			tabindex="-1"
			{disabled}
			aria-label={m['common.decrement']()}
			onmousedown={(e) => (e.preventDefault(), bump(-1))}
		>
			<svg viewBox="0 0 10 6" width="9" height="6"
				><path
					d="M1 1 L5 5 L9 1"
					fill="none"
					stroke="currentColor"
					stroke-width="1.4"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		</button>
	</div>
</div>

<style>
	.ni {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		overflow: hidden;
		/* Allow shrinking below the native input's preferred width when placed in
		   grid/flex cells (e.g. the label print panel's margin grid). */
		min-width: 0;
	}
	.ni.spaced {
		margin-top: 5px;
	}
	.ni:focus-within {
		border-color: var(--accent);
	}
	.ni.invalid {
		border-color: var(--danger);
	}
	.ni.dense {
		border-radius: 6px;
	}
	.ni.disabled {
		opacity: 0.55;
	}
	.ni.disabled input,
	.ni.disabled .spin button {
		cursor: not-allowed;
	}
	.ni input {
		flex: 1;
		/* width:0 (+ flex-grow) keeps the native input's intrinsic width from
		   forcing the whole control wider than its grid/flex cell. */
		width: 0;
		min-width: 0;
		border: none;
		background: none;
		padding: 9px 4px 9px 12px;
		color: var(--text);
		font-size: 13px;
	}
	.ni.dense input {
		padding: 7px 2px 7px 9px;
		font-size: 12.5px;
	}
	.ni input:focus {
		outline: none;
	}
	.unit {
		display: flex;
		align-items: center;
		padding: 0 8px 0 2px;
		color: var(--text-muted);
		font-size: 12px;
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
	}
	.ni.dense .unit {
		padding: 0 6px 0 2px;
		font-size: 11px;
	}
	.spin {
		flex: none;
		width: 22px;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--border-strong);
		overflow: hidden;
	}
	.ni.dense .spin {
		width: 18px;
	}
	.spin button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
	}
	.spin button:first-child {
		border-bottom: 1px solid var(--border-soft);
	}
	.spin button:hover {
		background: var(--surface-raised);
		color: var(--accent-soft);
	}
	.ni:focus-within .spin {
		border-left-color: var(--accent);
	}

	/* Touch layouts: grow the control to a comfortable tap size. The two steppers
	   are stacked, so they can't each be 44px tall inside one input, but a 48px
	   control makes each ~24px — clearing the WCAG 2.2 target-size floor — and the
	   wider column gives a bigger horizontal hit area. 16px text also stops mobile
	   Safari from zooming in on focus. */
	@media (max-width: 860px) {
		.ni,
		.ni.dense {
			min-height: 48px;
		}
		.ni input,
		.ni.dense input {
			font-size: 16px;
		}
		.spin,
		.ni.dense .spin {
			width: 32px;
		}
	}
</style>
