<script lang="ts">
	import type { LabelElement } from '$lib/labels/types';
	import type { PlaceholderGroup } from '$lib/labels/template';
	import { _ } from 'svelte-i18n';

	interface Props {
		el: LabelElement | null;
		groups: PlaceholderGroup[];
		onchange: (el: LabelElement) => void;
		ondelete: () => void;
	}
	let { el, groups, onchange, ondelete }: Props = $props();

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
	<div class="empty">{$_('labels.select_element')}</div>
{:else}
	<div class="inspector">
		<div class="kind">{$_('labels.kind.' + el.type)}</div>

		<div class="row2">
			<label
				>{$_('labels.x_mm')}<input
					type="number"
					step="0.5"
					value={el.x}
					onchange={(e) => update({ x: num(e) })}
				/></label
			>
			<label
				>{$_('labels.y_mm')}<input
					type="number"
					step="0.5"
					value={el.y}
					onchange={(e) => update({ y: num(e) })}
				/></label
			>
		</div>

		{#if el.type === 'qr'}
			<label
				>{$_('labels.size_mm')}<input
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
				{$_('labels.center_logo')}</label
			>
			<label
				>{$_('labels.encodes')}
				<select value={el.encoding} onchange={(e) => update({ encoding: e.currentTarget.value })}>
					<option value="scheme">{$_('labels.enc_scheme')}</option>
					<option value="url">{$_('labels.enc_url')}</option>
				</select>
			</label>
			<p class="hint">
				{#if el.encoding === 'url'}
					{$_('labels.hint_enc_url')}
				{:else}
					{$_('labels.hint_enc_scheme')}
				{/if}
			</p>
		{:else if el.type === 'text'}
			<div class="row2">
				<label
					>{$_('labels.width_mm')}<input
						type="number"
						step="0.5"
						min="2"
						value={el.w}
						onchange={(e) => update({ w: num(e) })}
					/></label
				>
				<label
					>{$_('labels.font_mm')}<input
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
					>{$_('labels.align')}
					<select value={el.align} onchange={(e) => update({ align: e.currentTarget.value })}>
						<option value="left">{$_('labels.align_left')}</option>
						<option value="center">{$_('labels.align_center')}</option>
						<option value="right">{$_('labels.align_right')}</option>
					</select>
				</label>
				<label class="check"
					><input
						type="checkbox"
						checked={el.bold}
						onchange={(e) => update({ bold: e.currentTarget.checked })}
					/>
					{$_('labels.bold')}</label
				>
			</div>
			<label class="color-row"
				>{$_('filament.fields.color_hex')}
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
				{$_('labels.wrap_text')}</label
			>
			{#if el.wrap === false}
				<p class="hint">{$_('labels.hint_nowrap')}</p>
			{/if}
			<label
				>{$_('labels.text_template')}
				<textarea rows="3" value={el.template} onchange={(e) => update({ template: e.currentTarget.value })}
				></textarea>
			</label>
			<label
				>{$_('labels.insert_field')}
				<select
					value=""
					onchange={(e) => {
						insertField(e.currentTarget.value);
						e.currentTarget.value = '';
					}}
				>
					<option value="" disabled>{$_('labels.choose_field')}</option>
					{#each groups as g (g.entity)}
						<optgroup label={$_(g.labelKey)}>
							{#each g.items as item (item.token)}
								<option value={item.token}>{item.labelKey ? $_(item.labelKey) : item.label}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>
			<p class="hint">{$_('labels.hint_wrap')} <code>{'{Temp: {filament.nozzleTemp}°C}'}</code></p>
		{:else if el.type === 'swatch'}
			<div class="row2">
				<label
					>{$_('labels.width_mm')}<input
						type="number"
						step="0.5"
						min="2"
						value={el.w}
						onchange={(e) => update({ w: num(e) })}
					/></label
				>
				<label
					>{$_('labels.height_mm')}<input
						type="number"
						step="0.5"
						min="2"
						value={el.h}
						onchange={(e) => update({ h: num(e) })}
					/></label
				>
			</div>
			<label
				>{$_('labels.corner_radius_mm')}<input
					type="number"
					step="0.5"
					min="0"
					value={el.radius}
					onchange={(e) => update({ radius: num(e) })}
				/></label
			>
			<p class="hint">{$_('labels.hint_swatch')}</p>
		{:else if el.type === 'rect'}
			<div class="row2">
				<label
					>{$_('labels.width_mm')}<input
						type="number"
						step="0.5"
						min="1"
						value={el.w}
						onchange={(e) => update({ w: num(e) })}
					/></label
				>
				<label
					>{$_('labels.height_mm')}<input
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
					>{$_('labels.radius_mm')}<input
						type="number"
						step="0.5"
						min="0"
						value={el.radius}
						onchange={(e) => update({ radius: num(e) })}
					/></label
				>
				<label
					>{$_('labels.stroke_mm')}<input
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
					>{$_('labels.fill')}
					<input
						type="color"
						value={el.fill || '#ffffff'}
						onchange={(e) => update({ fill: e.currentTarget.value })}
					/></label
				>
				<label class="color-row"
					>{$_('labels.stroke')}
					<input
						type="color"
						value={el.stroke || '#000000'}
						onchange={(e) => update({ stroke: e.currentTarget.value })}
					/></label
				>
			</div>
			<button class="clear-fill" onclick={() => update({ fill: '' })}>{$_('labels.clear_fill')}</button>
		{/if}

		<button class="delete" onclick={ondelete}>{$_('labels.delete_element')}</button>
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
