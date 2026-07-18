<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import type { MultiColorDirection } from '$lib/types';
	import * as m from '$lib/paraglide/messages';

	// Editor for a filament's colour(s): a single colour, or a multi-colour list
	// with a coaxial/longitudinal direction. Emits the full colour state on every
	// change via `onchange`. It keeps its own working list, so the parent should
	// remount it (`{#key ...}`) when switching to a different filament.
	interface Props {
		colors: string[];
		direction?: MultiColorDirection;
		onchange: (v: { colors: string[]; direction?: MultiColorDirection }) => void;
	}
	let { colors, direction, onchange }: Props = $props();

	// Initialised once from the props, then owned locally — the parent remounts this
	// component (`{#key ...}`) when it switches to a different filament, so capturing
	// only the initial prop values here is intentional.
	// svelte-ignore state_referenced_locally
	// A colour code counts as multi when there's more than one, or a direction is
	// already set (a half-entered multi-colour with one row so far).
	let multi = $state((colors?.length ?? 0) > 1 || !!direction);
	// Working rows hold raw hex text without the leading '#'; the empty string is
	// allowed while typing/adding and is dropped on emit.
	// svelte-ignore state_referenced_locally
	let list = $state<string[]>(colors?.length ? colors.map((c) => c.replace(/^#/, '')) : ['']);
	// svelte-ignore state_referenced_locally
	let dir = $state<MultiColorDirection>(direction ?? 'coaxial');

	// #rrggbb value the native colour picker accepts, from a (possibly partial) hex.
	function pickerValue(h: string): string {
		const s = (h || '').trim().replace(/^#/, '');
		return /^[0-9a-fA-F]{6}/.test(s) ? '#' + s.slice(0, 6) : '#888888';
	}

	// The first two valid colours drive the direction illustrations so they preview
	// the user's actual filament; fall back to neutral greys before any are entered.
	let validHexes = $derived(
		list.map((x) => x.trim().replace(/^#/, '')).filter((v) => /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v))
	);
	let c1 = $derived('#' + (validHexes[0] ?? '9aa0a6'));
	let c2 = $derived('#' + (validHexes[1] ?? 'd9dce1'));
	// Unique suffix so multiple editors' SVG gradient/clip ids never collide.
	const uid = Math.random().toString(36).slice(2, 8);

	function emit() {
		const hexes = list.map((c) => c.trim()).filter(Boolean);
		if (multi) onchange({ colors: hexes.map((h) => '#' + h.replace(/^#/, '')), direction: dir });
		else onchange({ colors: hexes.length ? ['#' + hexes[0].replace(/^#/, '')] : [], direction: undefined });
	}

	function setMode(toMulti: boolean) {
		if (toMulti === multi) return;
		multi = toMulti;
		if (multi) {
			// Ensure at least two rows to fill in for a multi-colour filament.
			while (list.length < 2) list.push('');
		} else {
			// Collapse to the first colour.
			list = [list[0] ?? ''];
		}
		emit();
	}

	function setColor(i: number, v: string) {
		list[i] = v;
		emit();
	}
	function pick(i: number, v: string) {
		list[i] = v.replace(/^#/, '').toUpperCase();
		emit();
	}
	function addColor() {
		list.push('');
		emit();
	}
	function removeColor(i: number) {
		list.splice(i, 1);
		if (list.length === 0) list.push('');
		emit();
	}
	function setDir(d: MultiColorDirection) {
		dir = d;
		emit();
	}
</script>

<div class="ce">
	<div class="seg mode">
		<button class="seg-btn" class:active={!multi} type="button" onclick={() => setMode(false)}>
			{m['filament.fields.singleColor']()}
		</button>
		<button class="seg-btn" class:active={multi} type="button" onclick={() => setMode(true)}>
			{m['filament.fields.multiColor']()}
		</button>
	</div>

	<div class="rows">
		{#each list as c, i (i)}
			<div class="color-row">
				<input
					class="color-pick"
					type="color"
					value={pickerValue(c)}
					oninput={(e) => pick(i, e.currentTarget.value)}
					aria-label={m['add.pickColor']()}
				/>
				<input
					class="mono hex"
					value={c}
					oninput={(e) => setColor(i, e.currentTarget.value)}
					placeholder="hex"
					maxlength="9"
				/>
				{#if multi}
					<button
						class="rm"
						type="button"
						onclick={() => removeColor(i)}
						disabled={list.length <= 1}
						aria-label={m['filament.fields.removeColor']()}><X size={14} /></button
					>
				{/if}
			</div>
		{/each}
	</div>

	{#if multi}
		<button class="add-color" type="button" onclick={addColor}>
			<Plus size={13} />
			{m['filament.fields.addColor']()}
		</button>
		<div class="dir-cards">
			<button
				class="dir-card"
				class:active={dir === 'coaxial'}
				type="button"
				onclick={() => setDir('coaxial')}
			>
				<!-- Coextruded: two colours run side-by-side, so different sides (X/Y)
				     show different colours. -->
				<svg class="dir-svg" viewBox="0 0 48 44" aria-hidden="true">
					<defs>
						<clipPath id="cx-{uid}"><rect x="8" y="6" width="32" height="26" rx="4" /></clipPath>
					</defs>
					<g clip-path="url(#cx-{uid})">
						<rect x="8" y="6" width="16" height="26" fill={c1} />
						<rect x="24" y="6" width="16" height="26" fill={c2} />
					</g>
					<rect
						x="8"
						y="6"
						width="32"
						height="26"
						rx="4"
						fill="none"
						stroke="var(--border-strong)"
						stroke-width="1.25"
					/>
					<path class="dir-arrow" d="M14 40 H34 M17 37 L14 40 L17 43 M31 37 L34 40 L31 43" />
				</svg>
				<span class="dc-label">{m['filament.fields.coaxial']()}</span>
			</button>
			<button
				class="dir-card"
				class:active={dir === 'longitudinal'}
				type="button"
				onclick={() => setDir('longitudinal')}
			>
				<!-- Longitudinal: colours change along the strand, so the print shifts
				     colour in Z as it grows upward. -->
				<svg class="dir-svg" viewBox="0 0 48 44" aria-hidden="true">
					<defs>
						<linearGradient id="lg-{uid}" x1="0" y1="1" x2="0" y2="0">
							<stop offset="0" stop-color={c1} />
							<stop offset="1" stop-color={c2} />
						</linearGradient>
					</defs>
					<rect
						x="14"
						y="6"
						width="28"
						height="26"
						rx="4"
						fill="url(#lg-{uid})"
						stroke="var(--border-strong)"
						stroke-width="1.25"
					/>
					<path class="dir-arrow" d="M8 42 L8 9 M5 13 L8 9 L11 13" />
				</svg>
				<span class="dc-label">{m['filament.fields.longitudinal']()}</span>
			</button>
		</div>
		<p class="dir-help">{m['filament.fieldsHelp.multiColorDirection']()}</p>
	{/if}
</div>

<style>
	.ce {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-start;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.color-pick {
		flex: none;
		width: 30px;
		height: 30px;
		padding: 2px;
		border: 1px solid var(--border-strong);
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
	.hex {
		flex: 1;
		min-width: 0;
		max-width: 180px;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		padding: 8px 12px;
		color: var(--text);
		font-size: 13px;
	}
	.hex:focus {
		border-color: var(--accent);
		outline: none;
	}
	.rm {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: none;
		color: var(--text-dim);
		cursor: pointer;
	}
	.rm:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--swatch-border-hover);
	}
	.rm:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.add-color {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		color: var(--accent-link);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
		padding: 0;
	}
	.dir-cards {
		display: flex;
		gap: 8px;
		width: 100%;
	}
	.dir-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: 1;
		padding: 8px 6px 6px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: none;
		color: var(--text-2);
		cursor: pointer;
		font-family: inherit;
	}
	.dir-card:hover {
		border-color: var(--swatch-border-hover);
	}
	.dir-card.active {
		border-color: var(--accent);
		background: var(--accent-wash);
		color: var(--accent-soft);
	}
	.dir-svg {
		width: 48px;
		height: 44px;
	}
	.dir-arrow {
		fill: none;
		stroke: var(--text-dim);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.dir-card.active .dir-arrow {
		stroke: var(--accent-soft);
	}
	.dc-label {
		font-size: 11.5px;
		font-weight: 600;
	}
	.dir-help {
		margin: 0;
		font-size: 11px;
		line-height: 1.45;
		color: var(--text-faint);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border-strong);
		border-radius: 7px;
		overflow: hidden;
	}
	.seg-btn {
		padding: 6px 12px;
		background: none;
		border: none;
		border-right: 1px solid var(--border-strong);
		color: var(--text-2);
		font-size: 12px;
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
</style>
