<script lang="ts">
	import ExtraFieldInput from '../ExtraFieldInput.svelte';
	import Card from '../Card.svelte';
	import {
		FieldType,
		FIELD_TYPE_LABELS,
		NUMERIC_FIELD_TYPES,
		type EntityType,
		type FieldDef,
		type FieldParams
	} from '$lib/api/fields';
	import { fields } from '$lib/stores/fields.svelte';

	const ENTITIES: { key: EntityType; label: string }[] = [
		{ key: 'spool', label: 'Spool' },
		{ key: 'filament', label: 'Filament' },
		{ key: 'vendor', label: 'Vendor' }
	];

	let entity = $state<EntityType>('spool');
	$effect(() => {
		fields.ensure(entity);
	});
	let defs = $derived(fields.get(entity));

	// Editor state ----------------------------------------------------------
	let editing = $state(false);
	let isNew = $state(false);
	let error = $state('');
	let saving = $state(false);

	let key = $state('');
	let name = $state('');
	let order = $state(0);
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
		key = '';
		name = '';
		order = Math.max(0, ...defs.map((f) => f.order)) + 1;
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
		key = f.key;
		name = f.name;
		order = f.order;
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

	async function save() {
		error = '';
		if (!/^[a-z0-9_]+$/.test(key)) {
			error = 'Key must contain only lowercase letters, numbers and underscores.';
			return;
		}
		if (key === 'new_field') {
			error = 'Please choose a different key.';
			return;
		}
		if (isNew && defs.some((f) => f.key === key)) {
			error = 'A field with this key already exists.';
			return;
		}
		if (!name.trim()) {
			error = 'Name is required.';
			return;
		}
		if (isChoice && choices.length === 0) {
			error = 'Choice fields need at least one choice.';
			return;
		}
		if (!isNew && isChoice) {
			const missing = originalChoices.filter((c) => !choices.includes(c));
			if (missing.length) {
				error = `Existing choices cannot be removed: ${missing.join(', ')}.`;
				return;
			}
		}

		const params: FieldParams = {
			name: name.trim(),
			order: Math.max(0, Math.round(order)),
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
			error = e instanceof Error ? e.message : 'Failed to save field.';
		} finally {
			saving = false;
		}
	}

	async function del(f: FieldDef) {
		if (!confirm(`Delete extra field "${f.name}"? This removes its value from all ${entity}s.`)) return;
		try {
			await fields.remove(entity, f.key);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete field.';
		}
	}

	function defaultPreview(f: FieldDef): string {
		if (!f.default_value) return '—';
		try {
			const v = JSON.parse(f.default_value);
			if (Array.isArray(v)) return v.map((x) => x ?? '').join(' – ');
			if (typeof v === 'boolean') return v ? 'Yes' : 'No';
			return String(v);
		} catch {
			return '—';
		}
	}
</script>

<div class="tabs">
	{#each ENTITIES as e (e.key)}
		<button class="tab" class:active={entity === e.key} onclick={() => (entity = e.key)}>{e.label}</button>
	{/each}
</div>

<Card divided>
	{#if defs.length === 0}
		<div class="empty">No extra fields defined for {entity}s yet.</div>
	{:else}
		<div class="row head-row">
			<span class="c-key">Key</span>
			<span class="c-name">Name</span>
			<span class="c-type">Type</span>
			<span class="c-def">Default</span>
			<span class="c-act"></span>
		</div>
		{#each defs as f (f.key)}
			<div class="row">
				<span class="c-key mono">{f.key}</span>
				<span class="c-name">{f.name}{#if f.unit}<span class="unit"> ({f.unit})</span>{/if}</span>
				<span class="c-type">
					{FIELD_TYPE_LABELS[f.field_type]}
					{#if f.field_type === FieldType.choice}<span class="unit">{f.multi_choice ? ' · multi' : ''}</span>{/if}
				</span>
				<span class="c-def">{defaultPreview(f)}</span>
				<span class="c-act">
					<button class="mini" onclick={() => startEdit(f)}>Edit</button>
					<button class="mini danger" onclick={() => del(f)}>Delete</button>
				</span>
			</div>
		{/each}
	{/if}
</Card>

{#if editing}
	<div class="editor">
		<div class="editor-title">{isNew ? 'New' : 'Edit'} {entity} field</div>
		<div class="form">
			<label class="fld">
				<span>Key</span>
				<input class="in mono" bind:value={key} disabled={!isNew} placeholder="lower_snake_case" />
			</label>
			<label class="fld">
				<span>Order</span>
				<input class="in mono" type="number" min="0" bind:value={order} />
			</label>
			<label class="fld wide">
				<span>Name</span>
				<input class="in" bind:value={name} placeholder="Display name" />
			</label>
			<label class="fld">
				<span>Type</span>
				<select class="in" value={fieldType} disabled={!isNew} onchange={(e) => onTypeChange(e.currentTarget.value as FieldType)}>
					{#each Object.values(FieldType) as t (t)}
						<option value={t}>{FIELD_TYPE_LABELS[t]}</option>
					{/each}
				</select>
			</label>
			{#if showsUnit}
				<label class="fld">
					<span>Unit</span>
					<input class="in" bind:value={unit} placeholder="g, °C…" maxlength="16" />
				</label>
			{/if}

			{#if isChoice}
				<label class="fld">
					<span>Multiple</span>
					<input type="checkbox" bind:checked={multiChoice} disabled={!isNew} />
				</label>
				<div class="fld wide">
					<span>Choices</span>
					<div class="chips">
						{#each choices as c (c)}
							<span class="chip">
								{c}
								{#if isNew || !originalChoices.includes(c)}
									<button class="chip-x" onclick={() => removeChoice(c)} aria-label="Remove">✕</button>
								{/if}
							</span>
						{/each}
						<input
							class="chip-in"
							bind:value={choiceInput}
							placeholder="add choice…"
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
				<span>Default value</span>
				<div class="def-input">
					{#if isChoice && choices.length === 0}
						<span class="hint">Add choices first</span>
					{:else}
						<ExtraFieldInput field={draftField} value={defaultJson} onchange={(v) => (defaultJson = v)} />
					{/if}
				</div>
			</div>
		</div>

		{#if error}<div class="error">{error}</div>{/if}

		<div class="editor-actions">
			<button class="btn ghost" onclick={cancel}>Cancel</button>
			<button class="btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save field'}</button>
		</div>
	</div>
{:else}
	<button class="add-btn" onclick={startAdd}>＋ Add {entity} field</button>
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
	.row {
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 10px 14px;
		font-size: 12.5px;
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
	.chip-x {
		background: none;
		border: none;
		color: #8a6a4d;
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
		background: var(--accent);
		color: #fff;
	}
	.btn.primary:hover {
		background: var(--accent-hover);
	}
	@media (max-width: 620px) {
		.form {
			grid-template-columns: 1fr;
		}
		.row {
			grid-template-columns: 1fr 1fr auto;
		}
		.c-type,
		.c-def {
			display: none;
		}
	}
</style>
