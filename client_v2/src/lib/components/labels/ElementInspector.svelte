<script lang="ts">
	import type { LabelElement, ElementType } from '$lib/labels/types';
	import type { PlaceholderGroup } from '$lib/labels/template';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		el: LabelElement | null;
		groups: PlaceholderGroup[];
		onchange: (el: LabelElement) => void;
		ondelete: () => void;
	}
	let { el, groups, onchange, ondelete }: Props = $props();

	const KIND_LABELS: Record<ElementType, () => string> = {
		qr: m['labels.kind.qr'],
		rect: m['labels.kind.rect'],
		swatch: m['labels.kind.swatch'],
		text: m['labels.kind.text']
	};

	// Emit an updated element with a shallow patch applied.
	function update(patch: Record<string, unknown>) {
		if (el) onchange({ ...el, ...patch } as LabelElement);
	}
	function num(e: Event): number {
		return parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
	}
	function insertField(token: string) {
		if (el?.type === 'text') update({ template: `${el.template}{${token}}` });
	}
</script>

{#if !el}
	<div class="empty">{m['labels.selectElement']()}</div>
{:else}
	<div class="inspector">
		<div class="kind">{KIND_LABELS[el.type]()}</div>

		<div class="row2">
			<label
				>{m['labels.xMm']()}<input
					type="number"
					step="0.5"
					value={el.x}
					onchange={(e) => update({ x: num(e) })}
				/></label
			>
			<label
				>{m['labels.yMm']()}<input
					type="number"
					step="0.5"
					value={el.y}
					onchange={(e) => update({ y: num(e) })}
				/></label
			>
		</div>

		{#if el.type === 'qr'}
			<label
				>{m['labels.sizeMm']()}<input
					type="number"
					step="0.5"
					min="5"
					value={el.size}
					onchange={(e) => update({ size: num(e) })}
				/></label
			>
			<label class="check"
				><input
					type="checkbox"
					checked={el.logo}
					onchange={(e) => update({ logo: e.currentTarget.checked })}
				/>
				{m['labels.centerLogo']()}</label
			>
			<label
				>{m['labels.encodes']()}
				<select value={el.encoding} onchange={(e) => update({ encoding: e.currentTarget.value })}>
					<option value="scheme">{m['labels.encScheme']()}</option>
					<option value="url">{m['labels.encUrl']()}</option>
				</select>
			</label>
			<p class="hint">
				{#if el.encoding === 'url'}
					{m['labels.hintEncUrl']()}
				{:else}
					{m['labels.hintEncScheme']()}
				{/if}
			</p>
		{:else if el.type === 'text'}
			<div class="row2">
				<label
					>{m['labels.widthMm']()}<input
						type="number"
						step="0.5"
						min="2"
						value={el.w}
						onchange={(e) => update({ w: num(e) })}
					/></label
				>
				<label
					>{m['labels.fontMm']()}<input
						type="number"
						step="0.25"
						min="1"
						value={el.fontSize}
						onchange={(e) => update({ fontSize: num(e) })}
					/></label
				>
			</div>
			<div class="row2">
				<label
					>{m['labels.align']()}
					<select value={el.align} onchange={(e) => update({ align: e.currentTarget.value })}>
						<option value="left">{m['labels.alignLeft']()}</option>
						<option value="center">{m['labels.alignCenter']()}</option>
						<option value="right">{m['labels.alignRight']()}</option>
					</select>
				</label>
				<label class="check"
					><input
						type="checkbox"
						checked={el.bold}
						onchange={(e) => update({ bold: e.currentTarget.checked })}
					/>
					{m['labels.bold']()}</label
				>
			</div>
			<label class="color-row"
				>{m['filament.fields.colorHex']()}
				<input
					type="color"
					value={el.color}
					onchange={(e) => update({ color: e.currentTarget.value })}
				/></label
			>
			<label class="check"
				><input
					type="checkbox"
					checked={el.wrap !== false}
					onchange={(e) => update({ wrap: e.currentTarget.checked })}
				/>
				{m['labels.wrapText']()}</label
			>
			{#if el.wrap === false}
				<p class="hint">{m['labels.hintNowrap']()}</p>
			{/if}
			<label
				>{m['labels.textTemplate']()}
				<textarea rows="3" value={el.template} onchange={(e) => update({ template: e.currentTarget.value })}
				></textarea>
			</label>
			<label
				>{m['labels.insertField']()}
				<select
					value=""
					onchange={(e) => {
						insertField(e.currentTarget.value);
						e.currentTarget.value = '';
					}}
				>
					<option value="" disabled>{m['labels.chooseField']()}</option>
					{#each groups as g (g.entity)}
						<optgroup label={g.labelKey()}>
							{#each g.items as item (item.token)}
								<option value={item.token}>{item.labelKey ? item.labelKey() : item.label}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>
			<p class="hint">{m['labels.hintWrap']()} <code>{'{Temp: {filament.nozzleTemp}°C}'}</code></p>
		{:else if el.type === 'swatch'}
			<div class="row2">
				<label
					>{m['labels.widthMm']()}<input
						type="number"
						step="0.5"
						min="2"
						value={el.w}
						onchange={(e) => update({ w: num(e) })}
					/></label
				>
				<label
					>{m['labels.heightMm']()}<input
						type="number"
						step="0.5"
						min="2"
						value={el.h}
						onchange={(e) => update({ h: num(e) })}
					/></label
				>
			</div>
			<label
				>{m['labels.cornerRadiusMm']()}<input
					type="number"
					step="0.5"
					min="0"
					value={el.radius}
					onchange={(e) => update({ radius: num(e) })}
				/></label
			>
			<p class="hint">{m['labels.hintSwatch']()}</p>
		{:else if el.type === 'rect'}
			<div class="row2">
				<label
					>{m['labels.widthMm']()}<input
						type="number"
						step="0.5"
						min="1"
						value={el.w}
						onchange={(e) => update({ w: num(e) })}
					/></label
				>
				<label
					>{m['labels.heightMm']()}<input
						type="number"
						step="0.5"
						min="1"
						value={el.h}
						onchange={(e) => update({ h: num(e) })}
					/></label
				>
			</div>
			<div class="row2">
				<label
					>{m['labels.radiusMm']()}<input
						type="number"
						step="0.5"
						min="0"
						value={el.radius}
						onchange={(e) => update({ radius: num(e) })}
					/></label
				>
				<label
					>{m['labels.strokeMm']()}<input
						type="number"
						step="0.1"
						min="0"
						value={el.strokeWidth}
						onchange={(e) => update({ strokeWidth: num(e) })}
					/></label
				>
			</div>
			<div class="row2">
				<label class="color-row"
					>{m['labels.fill']()}
					<input
						type="color"
						value={el.fill || '#ffffff'}
						onchange={(e) => update({ fill: e.currentTarget.value })}
					/></label
				>
				<label class="color-row"
					>{m['labels.stroke']()}
					<input
						type="color"
						value={el.stroke || '#000000'}
						onchange={(e) => update({ stroke: e.currentTarget.value })}
					/></label
				>
			</div>
			<button class="clear-fill" onclick={() => update({ fill: '' })}>{m['labels.clearFill']()}</button>
		{/if}

		<button class="delete" onclick={ondelete}>{m['labels.deleteElement']()}</button>
	</div>
{/if}

<style>
	.empty {
		color: var(--text-dim);
		font-size: 12.5px;
		padding: 16px 4px;
		line-height: 1.5;
	}
	.inspector {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.kind {
		text-transform: capitalize;
		font-weight: 600;
		font-size: 13px;
		color: var(--accent-soft);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	input[type='number'],
	select,
	textarea {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 6px;
		padding: 7px 9px;
		color: var(--text);
		font-size: 12.5px;
		font-family: inherit;
	}
	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	textarea {
		resize: vertical;
	}
	.check {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		color: var(--text-2);
		align-self: end;
		padding-bottom: 7px;
	}
	.check input {
		width: auto;
	}
	.color-row {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		font-size: 12.5px;
		color: var(--text-2);
	}
	.color-row input[type='color'] {
		width: 40px;
		height: 26px;
		padding: 0;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 6px;
	}
	.hint {
		font-size: 11px;
		color: var(--text-dim);
		line-height: 1.4;
		margin: 0;
	}
	.hint code {
		font-family: var(--font-mono);
		font-size: 10.5px;
	}
	.clear-fill {
		background: none;
		border: 1px solid var(--border-strong);
		color: var(--text-2);
		border-radius: 6px;
		padding: 6px;
		font-size: 12px;
		cursor: pointer;
	}
	.clear-fill:hover {
		border-color: var(--accent);
	}
	.delete {
		margin-top: 6px;
		background: none;
		border: 1px solid var(--danger);
		color: var(--danger);
		border-radius: 6px;
		padding: 7px;
		font-size: 12.5px;
		cursor: pointer;
	}
	.delete:hover {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
	}
</style>
