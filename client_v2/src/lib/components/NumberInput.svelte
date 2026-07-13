<script lang="ts">
	import { _ } from 'svelte-i18n';
	// A themed numeric input. Native spinners are hidden app-wide (see app.css);
	// this component supplies its own up/down steppers styled to match the dark UI.
	interface Props {
		value: string;
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
	}
	let {
		value = $bindable(),
		min,
		max,
		step = 1,
		placeholder,
		width = '100%',
		spaced = false,
		invalid = false
	}: Props = $props();

	function clamp(n: number): number {
		if (min != null && n < min) n = min;
		if (max != null && n > max) n = max;
		return n;
	}
	function bump(dir: 1 | -1) {
		const cur = parseFloat(value);
		const base = Number.isFinite(cur) ? cur : (min ?? 0);
		let next = clamp(base + dir * step);
		next = Math.round(next * 1e6) / 1e6; // trim float noise
		value = String(next);
	}
</script>

<div class="ni" class:spaced class:invalid style:width>
	<!-- value/oninput (not bind:value) so the value stays a string — Svelte would
	     otherwise coerce a type=number binding to a number. -->
	<input
		class="mono"
		type="number"
		{value}
		oninput={(e) => (value = e.currentTarget.value)}
		{min}
		{max}
		{step}
		{placeholder}
		inputmode="decimal"
	/>
	<div class="spin">
		<button
			type="button"
			tabindex="-1"
			aria-label={$_('common.increment')}
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
			aria-label={$_('common.decrement')}
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
		position: relative;
		display: block;
	}
	.ni.spaced {
		margin-top: 5px;
	}
	.ni input {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		padding: 9px 30px 9px 12px;
		color: var(--text);
		font-size: 13px;
	}
	.ni input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.ni.invalid input {
		border-color: var(--danger);
	}
	.spin {
		position: absolute;
		top: 1px;
		right: 1px;
		bottom: 1px;
		width: 22px;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--border-strong);
		border-radius: 0 7px 7px 0;
		overflow: hidden;
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
