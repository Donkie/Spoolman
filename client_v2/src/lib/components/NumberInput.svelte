<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	// A themed numeric input. Native spinners are hidden app-wide (see app.css);
	// this component supplies its own up/down steppers styled to match the dark UI.
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
		/** Render with an error outline. */
		invalid?: boolean;
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
		unit,
		dense = false,
		disabled = false,
		onchange,
		onclear
	}: Props = $props();

	// Commit mode keeps a local draft so keystrokes don't fire onchange; the controlled
	// `value` re-seeds it whenever the parent changes it (e.g. a new element is selected).
	let draft = $state('');
	$effect(() => {
		if (onchange) draft = String(value ?? '');
	});
	const shown = $derived(onchange ? draft : String(value ?? ''));

	function clamp(n: number): number {
		if (min != null && n < min) n = min;
		if (max != null && n > max) n = max;
		return n;
	}
	function onInput(v: string) {
		if (onchange) draft = v;
		else value = v;
	}
	function commit() {
		if (!onchange) return;
		if (onclear && draft.trim() === '') onclear();
		else onchange(clamp(parseFloat(draft) || 0));
	}
	function bump(dir: 1 | -1) {
		const cur = parseFloat(shown);
		const base = Number.isFinite(cur) ? cur : (min ?? 0);
		let next = clamp(base + dir * step);
		next = Math.round(next * 1e6) / 1e6; // trim float noise
		if (onchange) {
			draft = String(next);
			onchange(next);
		} else {
			value = String(next);
		}
	}
</script>

<div class="ni" class:spaced class:invalid class:dense class:disabled style:width>
	<!-- value/oninput (not bind:value) so the value stays a string — Svelte would
	     otherwise coerce a type=number binding to a number. -->
	<input
		class="mono"
		type="number"
		value={shown}
		oninput={(e) => onInput(e.currentTarget.value)}
		onchange={commit}
		{min}
		{max}
		{step}
		{placeholder}
		{disabled}
		inputmode="decimal"
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
</style>
