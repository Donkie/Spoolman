<script lang="ts">
	import ExtraFieldInput from '../ExtraFieldInput.svelte';
	import Card from '../Card.svelte';
	import {
		FieldType,
		NUMERIC_FIELD_TYPES,
		type EntityType,
		type FieldDef,
		type FieldParams
	} from '$lib/api/fields';
	import { fields } from '$lib/stores/fields.svelte';
	import { numericInput, parseDecimal } from '$lib/utils/numeric';
	import { tick } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	const ENTITIES: { key: EntityType; label: () => string }[] = [
		{ key: 'spool', label: m['library.section.spool'] },
		{ key: 'filament', label: m['library.section.filament'] },
		{ key: 'vendor', label: m['filament.fields.vendor'] }
	];

	const FIELD_TYPE_LABELS: Record<FieldType, () => string> = {
		[FieldType.text]: m['settings.extraFields.fieldType.text'],
		[FieldType.boolean]: m['settings.extraFields.fieldType.boolean'],
		[FieldType.choice]: m['settings.extraFields.fieldType.choice'],
		[FieldType.datetime]: m['settings.extraFields.fieldType.datetime'],
		[FieldType.float]: m['settings.extraFields.fieldType.float'],
		[FieldType.float_range]: m['settings.extraFields.fieldType.floatRange'],
		[FieldType.integer]: m['settings.extraFields.fieldType.integer'],
		[FieldType.integer_range]: m['settings.extraFields.fieldType.integerRange']
	};

	interface Props {
		/** Which entity's fields to manage — owned by the page, which keeps it in the URL. */
		entity: EntityType;
		onentity: (entity: EntityType) => void;
	}
	let { entity, onentity }: Props = $props();

	// Human label for the currently-selected entity, for messages/headings.
	const entityLabel = $derived(
		ENTITIES.find((e) => e.key === entity)?.label() ?? m['library.section.spool']()
	);
	$effect(() => {
		fields.ensure(entity);
	});
	let defs = $derived(fields.get(entity));

	// The editor edits ONE entity's field; switching tabs (or arriving on a
	// different tab through the URL) leaves it pointing at fields that are no
	// longer on screen, so put it away rather than let a save land on the wrong
	// entity.
	$effect(() => {
		void entity;
		editing = false;
		error = '';
		errorField = null;
	});

	// Editor state ----------------------------------------------------------
	let editing = $state(false);
	let isNew = $state(false);
	let error = $state('');
	// Which field the current error belongs to, so it can be outlined and focused
	// instead of leaving the reader to match a message to a box.
	let errorField = $state<string | null>(null);
	let saving = $state(false);
	let editorEl = $state<HTMLDivElement | undefined>();

	let key = $state('');
	let name = $state('');
	// The order box is a plain text field (numeric fields accept a decimal comma and
	// refuse letters — see $lib/utils/numeric.ts); `order` is the whole number it means.
	let orderText = $state('0');
	let order = $derived(Math.max(0, Math.round(parseDecimal(orderText) ?? 0)));
	let fieldType = $state<FieldType>(FieldType.text);
	let unit = $state('');
	let defaultJson = $state<string | undefined>(undefined);
	let choices = $state<string[]>([]);
	let originalChoices = $state<string[]>([]);
	let multiChoice = $state(false);
	let choiceInput = $state('');

	let isChoice = $derived(fieldType === FieldType.choice);
	let showsUnit = $derived(NUMERIC_FIELD_TYPES.has(fieldType));

	// A draft FieldDef so the default-value editor renders the right control.
	let draftField = $derived<FieldDef>({
		key: key || 'draft',
		entity_type: entity,
		name,
		order,
		field_type: fieldType,
		unit: unit || undefined,
		choices: isChoice ? choices : undefined,
		multi_choice: isChoice ? multiChoice : undefined
	});

	function startAdd() {
		isNew = true;
		editing = true;
		error = '';
		errorField = null;
		key = '';
		name = '';
		orderText = String(Math.max(0, ...defs.map((f) => f.order)) + 1);
		fieldType = FieldType.text;
		unit = '';
		defaultJson = undefined;
		choices = [];
		originalChoices = [];
		multiChoice = false;
		choiceInput = '';
	}

	function startEdit(f: FieldDef) {
		isNew = false;
		editing = true;
		error = '';
		errorField = null;
		key = f.key;
		name = f.name;
		orderText = String(f.order);
		fieldType = f.field_type;
		unit = f.unit ?? '';
		defaultJson = f.default_value ?? undefined;
		choices = [...(f.choices ?? [])];
		originalChoices = [...(f.choices ?? [])];
		multiChoice = f.multi_choice ?? false;
		choiceInput = '';
	}

	function cancel() {
		editing = false;
		error = '';
		errorField = null;
	}

	function onTypeChange(t: FieldType) {
		fieldType = t;
		defaultJson = undefined; // reset default when the type changes
		if (t !== FieldType.choice) {
			choices = [];
			multiChoice = false;
		}
	}

	function addChoice() {
		const v = choiceInput.trim();
		if (v && !choices.includes(v)) choices = [...choices, v];
		choiceInput = '';
	}
	function removeChoice(c: string) {
		if (!isNew && originalChoices.includes(c)) return; // append-only
		choices = choices.filter((x) => x !== c);
	}

	// Choices may not be removed once saved, but their order is free to change —
	// it is the order they are offered in wherever the field is used.
	let draggedChoice = $state<string | null>(null);

	function moveChoice(choice: string, before: string) {
		const next = [...choices];
		const from = next.indexOf(choice);
		const to = next.indexOf(before);
		if (from === -1 || to === -1 || from === to) return;
		next.splice(from, 1);
		next.splice(to, 0, choice);
		choices = next;
	}

	function moveChoiceBy(choice: string, offset: number) {
		const to = choices.indexOf(choice) + offset;
		if (to < 0 || to >= choices.length) return;
		moveChoice(choice, choices[to]);
	}

	function onChoiceDragOver(e: DragEvent, target: string) {
		if (draggedChoice === null) return;
		e.preventDefault();
		moveChoice(draggedChoice, target);
	}

	function onGripKeydown(e: KeyboardEvent, choice: string) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		moveChoiceBy(choice, e.key === 'ArrowLeft' ? -1 : 1);
	}

	/** Report a problem against the field it belongs to, and put the caret there. */
	function fail(field: string, message: string) {
		error = message;
		errorField = field;
		tick().then(() => editorEl?.querySelector<HTMLElement>(`[data-field="${field}"] input`)?.focus());
	}

	async function save() {
		error = '';
		errorField = null;
		if (!/^[a-z0-9_]+$/.test(key)) {
			fail('key', m['settings.extraFields.errors.keyFormat']());
			return;
		}
		if (isNew && defs.some((f) => f.key === key)) {
			fail('key', m['settings.extraFields.nonUniqueKeyError']());
			return;
		}
		if (!name.trim()) {
			fail('name', m['settings.extraFields.errors.nameRequired']());
			return;
		}
		if (isChoice && choices.length === 0) {
			fail('choices', m['settings.extraFields.errors.choiceNeeded']());
			return;
		}
		if (!isNew && isChoice) {
			const missing = originalChoices.filter((c) => !choices.includes(c));
			if (missing.length) {
				fail('choices', m['settings.extraFields.errors.choicesRemoved']({ choices: missing.join(', ') }));
				return;
			}
		}

		const params: FieldParams = {
			name: name.trim(),
			order,
			field_type: fieldType,
			unit: showsUnit && unit.trim() ? unit.trim() : null,
			default_value: defaultJson ?? null,
			choices: isChoice ? choices : null,
			multi_choice: isChoice ? multiChoice : null
		};

		saving = true;
		try {
			await fields.save(entity, key, params);
			editing = false;
		} catch (e) {
			error = e instanceof Error ? e.message : m['settings.extraFields.errors.saveFailed']();
		} finally {
			saving = false;
		}
	}

	async function del(f: FieldDef) {
		if (!confirm(m['settings.extraFields.deleteConfirm']({ name: f.name, entity: entityLabel }))) return;
		try {
			await fields.remove(entity, f.key);
		} catch (e) {
			error = e instanceof Error ? e.message : m['settings.extraFields.errors.deleteFailed']();
		}
	}

	function defaultPreview(f: FieldDef): string {
		if (!f.default_value) return '—';
		try {
			const v = JSON.parse(f.default_value);
			if (Array.isArray(v)) return v.map((x) => x ?? '').join(' – ');
			if (typeof v === 'boolean') return v ? m.yes() : m.no();
			return String(v);
		} catch {
			return '—';
		}
	}
</script>

<!-- Same marker, same meaning, as the add-spool form: required, and nothing else. -->
{#snippet req()}<span class="req" title={m['validation.required']()} aria-hidden="true">*</span>{/snippet}

<div class="tabs">
	{#each ENTITIES as e (e.key)}
		<button class="tab" class:active={entity === e.key} onclick={() => onentity(e.key)}>{e.label()}</button>
	{/each}
</div>

<Card>
	{#if defs.length === 0}
		<div class="empty">{m['settings.extraFields.none']({ entity: entityLabel })}</div>
	{:else}
		<div class="table">
			<div class="row head-row">
				<span class="c-key">{m['settings.extraFields.params.key']()}</span>
				<span class="c-name">{m['settings.extraFields.params.name']()}</span>
				<span class="c-type">{m['settings.extraFields.params.fieldType']()}</span>
				<span class="c-def">{m['settings.extraFields.params.defaultValue']()}</span>
				<span class="c-act"></span>
			</div>
			{#each defs as f (f.key)}
				<div class="row">
					<span class="c-key mono">{f.key}</span>
					<span class="c-name"
						>{f.name}{#if f.unit}<span class="unit"> ({f.unit})</span>{/if}</span
					>
					<span class="c-type">
						{FIELD_TYPE_LABELS[f.field_type]()}
						{#if f.field_type === FieldType.choice}<span class="unit"
								>{f.multi_choice ? m['settings.extraFields.multiSuffix']() : ''}</span
							>{/if}
					</span>
					<span class="c-def">{defaultPreview(f)}</span>
					<span class="c-act">
						<button class="mini" onclick={() => startEdit(f)}>{m['buttons.edit']()}</button>
						<button class="mini danger" onclick={() => del(f)}>{m['buttons.delete']()}</button>
					</span>
				</div>
			{/each}
		</div>
	{/if}
</Card>

{#if editing}
	<div class="editor" bind:this={editorEl}>
		<div class="editor-title">
			{isNew
				? m['settings.extraFields.editorNew']({ entity: entityLabel })
				: m['settings.extraFields.editorEdit']({ entity: entityLabel })}
		</div>
		<div class="form">
			<label class="fld" data-field="key">
				<span>{m['settings.extraFields.params.key']()} {@render req()}</span>
				<input
					class="in mono"
					class:invalid={errorField === 'key'}
					bind:value={key}
					disabled={!isNew}
					aria-required="true"
					aria-invalid={errorField === 'key'}
					placeholder="lower_snake_case"
				/>
			</label>
			<label class="fld">
				<span>{m['settings.extraFields.params.order']()}</span>
				<input
					class="in mono"
					type="text"
					inputmode="numeric"
					use:numericInput={{ negative: false }}
					bind:value={orderText}
				/>
			</label>
			<label class="fld wide" data-field="name">
				<span>{m['settings.extraFields.params.name']()} {@render req()}</span>
				<input
					class="in"
					class:invalid={errorField === 'name'}
					bind:value={name}
					aria-required="true"
					aria-invalid={errorField === 'name'}
					placeholder={m['settings.extraFields.namePlaceholder']()}
				/>
			</label>
			<label class="fld">
				<span>{m['settings.extraFields.params.fieldType']()}</span>
				<select
					class="in"
					value={fieldType}
					disabled={!isNew}
					onchange={(e) => onTypeChange(e.currentTarget.value as FieldType)}
				>
					{#each Object.values(FieldType) as t (t)}
						<option value={t}>{FIELD_TYPE_LABELS[t]()}</option>
					{/each}
				</select>
			</label>
			{#if showsUnit}
				<label class="fld">
					<span>{m['settings.extraFields.params.unit']()}</span>
					<input class="in" bind:value={unit} placeholder="g, °C…" maxlength="16" />
				</label>
			{/if}

			{#if isChoice}
				<label class="fld">
					<span>{m['settings.extraFields.multiple']()}</span>
					<input type="checkbox" bind:checked={multiChoice} disabled={!isNew} />
				</label>
				<div class="fld wide" data-field="choices">
					<span>{m['settings.extraFields.params.choices']()} {@render req()}</span>
					<div class="chips" class:invalid={errorField === 'choices'}>
						{#each choices as c (c)}
							<span
								class="chip"
								class:dragging={draggedChoice === c}
								role="group"
								aria-label={c}
								ondragover={(e) => onChoiceDragOver(e, c)}
							>
								<button
									class="chip-grip"
									draggable="true"
									ondragstart={() => (draggedChoice = c)}
									ondragend={() => (draggedChoice = null)}
									onkeydown={(e) => onGripKeydown(e, c)}
									title={m['settings.extraFields.reorderChoice']()}
									aria-label={m['settings.extraFields.reorderChoice']()}
								>
									<GripVertical size={11} />
								</button>
								{c}
								{#if isNew || !originalChoices.includes(c)}
									<button class="chip-x" onclick={() => removeChoice(c)} aria-label={m['common.remove']()}
										><X size={12} /></button
									>
								{/if}
							</span>
						{/each}
						<input
							class="chip-in"
							bind:value={choiceInput}
							placeholder={m['settings.extraFields.addChoice']()}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ',') {
									e.preventDefault();
									addChoice();
								}
							}}
							onblur={addChoice}
						/>
					</div>
				</div>
			{/if}

			<div class="fld wide">
				<span>{m['settings.extraFields.params.defaultValue']()}</span>
				<div class="def-input">
					{#if isChoice && choices.length === 0}
						<span class="hint">{m['settings.extraFields.addChoicesFirst']()}</span>
					{:else}
						<ExtraFieldInput field={draftField} value={defaultJson} onchange={(v) => (defaultJson = v)} />
					{/if}
				</div>
			</div>
		</div>

		<!-- Save is never disabled: pressing it is how you find out what's missing,
		     and the field it came from is outlined and focused. -->
		{#if error}<div class="error" role="alert">{error}</div>{/if}

		<div class="editor-actions">
			<button class="btn ghost" onclick={cancel}>{m['buttons.cancel']()}</button>
			<button class="btn primary" onclick={save} disabled={saving}
				>{saving ? m['labels.saving']() : m['settings.extraFields.saveField']()}</button
			>
		</div>
	</div>
{:else}
	<button class="add-btn" onclick={startAdd}
		><Plus size={14} /> {m['settings.extraFields.addEntityField']({ entity: entityLabel })}</button
	>
{/if}

<style>
	.tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 10px;
	}
	.tab {
		padding: 6px 14px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: none;
		color: var(--text-dim);
		font-size: 12.5px;
		cursor: pointer;
		font-family: inherit;
	}
	.tab.active {
		background: var(--accent-wash);
		border-color: var(--accent-border);
		color: var(--accent-soft);
		font-weight: 600;
	}
	.empty {
		padding: 16px 14px;
		font-size: 12.5px;
		color: var(--text-dim);
	}
	/* One shared grid for every row so the header and data columns line up.
	   Rows are subgrids of this, so the auto-sized action column is computed
	   once across all rows instead of per-row (which caused the misalignment). */
	.table {
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr 1fr auto;
	}
	.row {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		gap: 12px;
		align-items: center;
		padding: 10px 14px;
		font-size: 12.5px;
	}
	.row:not(:first-child) {
		border-top: 1px solid var(--border-soft);
	}
	.head-row {
		color: var(--text-dim);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.unit {
		color: var(--text-dim);
	}
	.c-def {
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.c-act {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}
	.mini {
		padding: 3px 9px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: none;
		color: var(--text-2);
		font-size: 11.5px;
		cursor: pointer;
		font-family: inherit;
	}
	.mini:hover {
		border-color: var(--accent);
	}
	.mini.danger:hover {
		border-color: var(--danger);
		color: var(--danger-soft);
	}
	.add-btn {
		margin-top: 12px;
		border: 1px dashed var(--accent-border);
		color: var(--accent-link);
		border-radius: var(--radius);
		padding: 8px 14px;
		font-size: 12.5px;
		cursor: pointer;
		background: none;
		font-family: inherit;
	}
	.add-btn:hover {
		border-color: var(--accent);
	}
	.editor {
		margin-top: 12px;
		background: var(--surface);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-lg);
		padding: 14px;
	}
	.editor-title {
		font-weight: 600;
		font-size: 13px;
		margin-bottom: 12px;
	}
	.form {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}
	.fld {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 11.5px;
		color: var(--text-muted);
	}
	.fld.wide {
		grid-column: 1 / -1;
	}
	.in {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		color: var(--text);
		padding: 7px 10px;
		font-size: 13px;
	}
	.in:disabled {
		opacity: 0.55;
	}
	.in.invalid,
	.chips.invalid {
		border-color: var(--danger);
	}
	.req {
		color: var(--accent-soft);
	}
	.def-input {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		padding: 8px 10px;
	}
	.hint {
		color: var(--text-dim);
		font-size: 12px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		padding: 6px 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: var(--accent-wash);
		border: 1px solid var(--accent-border);
		color: var(--accent-soft);
		border-radius: var(--radius-sm);
		padding: 2px 7px;
		font-size: 12px;
	}
	.chip.dragging {
		opacity: 0.4;
	}
	.chip-grip {
		display: inline-flex;
		background: none;
		border: none;
		color: var(--accent-muted);
		cursor: grab;
		padding: 0;
	}
	.chip-x {
		background: none;
		border: none;
		color: var(--accent-muted);
		cursor: pointer;
		font-size: 10px;
		padding: 0;
	}
	.chip-in {
		flex: 1;
		min-width: 80px;
		background: none;
		border: none;
		color: var(--text);
		font-size: 12.5px;
	}
	.error {
		margin-top: 10px;
		color: var(--danger-soft);
		font-size: 12px;
	}
	.editor-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 14px;
	}
	.btn {
		border-radius: var(--radius);
		padding: 8px 14px;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		font-family: inherit;
	}
	.btn.ghost {
		background: none;
		border-color: var(--border-strong);
		color: var(--text-2);
	}
	.btn.primary {
		background: var(--accent-fill);
		color: #fff;
	}
	.btn.primary:hover {
		background: var(--accent-fill-hover);
	}
	@media (max-width: 620px) {
		.form {
			grid-template-columns: 1fr;
		}
		.table {
			grid-template-columns: 1fr 1fr auto;
		}
		.c-type,
		.c-def {
			display: none;
		}
	}
</style>
