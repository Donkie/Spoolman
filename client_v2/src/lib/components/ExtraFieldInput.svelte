<script lang="ts">
	import { FieldType, NUMERIC_FIELD_TYPES, type FieldDef } from '$lib/api/fields';
	import Toggle from './Toggle.svelte';
	import DateTimeField from './DateTimeField.svelte';
	import EditableField from './EditableField.svelte';
	import LinkedText from './LinkedText.svelte';
	import { formatDateTime } from '$lib/utils/datetime';
	import { numericInput, parseDecimal } from '$lib/utils/numeric';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		field: FieldDef;
		/** Current raw JSON-encoded value (or undefined if unset). */
		value: string | undefined;
		/** Emit the new JSON-encoded value, or undefined to leave unset. */
		onchange: (json: string | undefined) => void;
		/** Render the value as plain text instead of an editable input. */
		readonly?: boolean;
	}
	let { field, value, onchange, readonly = false }: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let parsed = $derived.by<any>(() => {
		if (value === undefined) return undefined;
		try {
			return JSON.parse(value);
		} catch {
			return undefined;
		}
	});

	const emit = (v: unknown) => onchange(v === undefined ? undefined : JSON.stringify(v));

	function onText(v: string) {
		// Emptying the box clears the field rather than storing an empty string. A field
		// holding "" is not distinguishable from an unset one anywhere it is read — it renders
		// as em-dash, groups as "unassigned" and matches the unset filter — so storing one only
		// creates a value that looks unset but isn't. Single-choice below does the same.
		emit(v === '' ? undefined : v);
	}
	// The numeric fields are text inputs guarded by `numericInput` so a decimal comma
	// is accepted and letters can't be typed at all; `parseDecimal` reads either
	// separator. What the user typed is kept in `drafts` and shown back for as long as
	// it means the same number as the stored value — otherwise emitting "1," (which
	// stores 1) would immediately rewrite the box to "1" and eat the comma mid-typing.
	let drafts = $state<Record<string, string>>({});
	function shown(key: string, stored: unknown): string {
		const value = stored === undefined || stored === null ? '' : String(stored);
		const draft = drafts[key];
		return draft !== undefined && parseDecimal(draft) === parseDecimal(value) ? draft : value;
	}
	function typed(key: string, raw: string): string {
		drafts[key] = raw;
		return raw;
	}

	function onInt(v: string) {
		const n = parseDecimal(v);
		emit(n === null ? undefined : Math.round(n));
	}
	function onFloat(v: string) {
		emit(parseDecimal(v) ?? undefined);
	}

	// Ranges: [low, high], each number-or-null.
	let lo = $derived(Array.isArray(parsed) ? (parsed[0] ?? '') : '');
	let hi = $derived(Array.isArray(parsed) ? (parsed[1] ?? '') : '');
	function onRange(which: 0 | 1, raw: string, isInt: boolean) {
		const cur: [unknown, unknown] = Array.isArray(parsed) ? [parsed[0], parsed[1]] : [null, null];
		const parsedNum = parseDecimal(raw);
		cur[which] = parsedNum === null ? null : isInt ? Math.round(parsedNum) : parsedNum;
		if (cur[0] === null && cur[1] === null) emit(undefined);
		else emit(cur);
	}

	// Datetime: stored as a JSON-encoded ISO string; edited via the shared
	// DateTimeField picker (same control/format as builtin datetime fields).
	let dtValue = $derived(typeof parsed === 'string' ? parsed : undefined);
	function onDateTime(iso: string | undefined) {
		emit(iso);
	}

	// Multi-choice
	let selected = $derived(Array.isArray(parsed) ? (parsed as string[]) : []);
	function toggleChoice(choice: string, checked: boolean) {
		const next = checked ? [...selected, choice] : selected.filter((c) => c !== choice);
		emit(next.length ? next : undefined);
	}
</script>

{#if readonly}
	{@const withUnit = (v: string) => (field.unit ? `${v} ${field.unit}` : v)}
	{#if field.field_type === FieldType.integer_range || field.field_type === FieldType.float_range}
		<span class="mono"
			>{withUnit(lo === '' && hi === '' ? '—' : `${lo === '' ? '?' : lo}–${hi === '' ? '?' : hi}`)}</span
		>
	{:else if field.field_type === FieldType.datetime}
		<span class="mono">{formatDateTime(dtValue) || '—'}</span>
	{:else if field.field_type === FieldType.boolean}
		<span>{parsed === true ? m.yes() : m.no()}</span>
	{:else if field.field_type === FieldType.choice && field.multi_choice}
		<span>{selected.length ? selected.join(', ') : '—'}</span>
	{:else if field.field_type === FieldType.text}
		<LinkedText text={parsed !== undefined && parsed !== '' ? withUnit(String(parsed)) : ''} />
	{:else}
		<span class:mono={NUMERIC_FIELD_TYPES.has(field.field_type)}
			>{parsed !== undefined && parsed !== '' ? withUnit(String(parsed)) : '—'}</span
		>
	{/if}
{:else if field.field_type === FieldType.text}
	<EditableField value={parsed ?? ''} placeholder="" ariaLabel={field.name} linkify oninput={onText} />
{:else if field.field_type === FieldType.integer}
	<span class="numrow">
		<input
			class="edit mono"
			type="text"
			inputmode="decimal"
			use:numericInput
			value={shown('int', parsed)}
			aria-label={field.name}
			oninput={(e) => onInt(typed('int', e.currentTarget.value))}
		/>
		{#if field.unit}<span class="unit">{field.unit}</span>{/if}
	</span>
{:else if field.field_type === FieldType.float}
	<span class="numrow">
		<input
			class="edit mono"
			type="text"
			inputmode="decimal"
			use:numericInput
			value={shown('float', parsed)}
			aria-label={field.name}
			oninput={(e) => onFloat(typed('float', e.currentTarget.value))}
		/>
		{#if field.unit}<span class="unit">{field.unit}</span>{/if}
	</span>
{:else if field.field_type === FieldType.integer_range || field.field_type === FieldType.float_range}
	{@const isInt = field.field_type === FieldType.integer_range}
	<span class="numrow">
		<input
			class="edit mono narrow"
			type="text"
			inputmode="decimal"
			use:numericInput
			value={shown('lo', lo)}
			aria-label={`${field.name} ${m['settings.extraFields.min']()}`}
			oninput={(e) => onRange(0, typed('lo', e.currentTarget.value), isInt)}
			placeholder={m['settings.extraFields.min']()}
		/>
		<span class="dash">–</span>
		<input
			class="edit mono narrow"
			type="text"
			inputmode="decimal"
			use:numericInput
			value={shown('hi', hi)}
			aria-label={`${field.name} ${m['settings.extraFields.max']()}`}
			oninput={(e) => onRange(1, typed('hi', e.currentTarget.value), isInt)}
			placeholder={m['settings.extraFields.max']()}
		/>
		{#if field.unit}<span class="unit">{field.unit}</span>{/if}
	</span>
{:else if field.field_type === FieldType.datetime}
	<DateTimeField value={dtValue} oninput={onDateTime} />
{:else if field.field_type === FieldType.boolean}
	<Toggle checked={parsed === true} onchange={(v) => emit(v)} ariaLabel={field.name} />
{:else if field.field_type === FieldType.choice && !field.multi_choice}
	<select
		class="sel"
		value={parsed ?? ''}
		aria-label={field.name}
		onchange={(e) => emit(e.currentTarget.value || undefined)}
	>
		<option value="">—</option>
		{#each field.choices ?? [] as choice (choice)}
			<option value={choice}>{choice}</option>
		{/each}
	</select>
{:else if field.field_type === FieldType.choice && field.multi_choice}
	<div class="multi">
		{#each field.choices ?? [] as choice (choice)}
			<label class="chk">
				<input
					type="checkbox"
					checked={selected.includes(choice)}
					onchange={(e) => toggleChoice(choice, e.currentTarget.checked)}
				/>
				{choice}
			</label>
		{/each}
	</div>
{/if}

<style>
	.edit {
		background: none;
		border: none;
		border-bottom: 1px dashed var(--track);
		color: var(--text);
		font-size: 12.5px;
		padding: 2px 0;
		width: 100%;
	}
	.edit:focus {
		border-bottom-color: var(--accent);
	}
	.numrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}
	.narrow {
		width: 70px;
	}
	.unit,
	.dash {
		color: var(--text-dim);
		font-size: 12px;
		flex: none;
	}
	.sel {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		color: var(--text);
		padding: 3px 6px;
		font-size: 12.5px;
		width: 100%;
	}
	.multi {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: var(--text-2);
		cursor: pointer;
	}
</style>
