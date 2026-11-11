<script lang="ts">
	// Moving lists in and out of this instance.
	//
	// The import is deliberately two steps: picking a file checks it and shows what
	// would happen, and only then does a second, separate click write anything. The
	// endpoint refuses a file outright when any row is wrong, so the check is exact
	// rather than indicative — what the preview says is what the write does.
	import Card from '../Card.svelte';
	import SettingRow from './SettingRow.svelte';
	import Button from '../Button.svelte';
	import Toggle from '../Toggle.svelte';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import {
		exportUrl,
		formatFromFilename,
		importFile,
		type ImportResult,
		type OnConflict,
		type TransferEntity,
		type TransferFormat
	} from '$lib/api/dataTransfer';
	import { HttpError } from '$lib/api/http';
	import * as m from '$lib/paraglide/messages';

	const entities: TransferEntity[] = ['spools', 'filaments', 'vendors'];

	let entity = $state<TransferEntity>('spools');
	let format = $state<TransferFormat>('csv');
	let onConflict = $state<OnConflict>('skip');

	let file = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let busy = $state(false);
	let preview = $state<ImportResult | null>(null);
	let applied = $state<ImportResult | null>(null);
	let failure = $state<string | null>(null);

	// A preview describes one file read one way. Changing any of that makes it stale,
	// so it is cleared rather than left on screen next to settings it no longer matches.
	function reset() {
		preview = null;
		applied = null;
		failure = null;
	}

	function chooseFile(e: Event) {
		const picked = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		reset();
		file = picked;
		if (picked) {
			const guessed = formatFromFilename(picked.name);
			if (guessed) format = guessed;
			void run(true);
		}
	}

	function clearFile() {
		file = null;
		reset();
		if (fileInput) fileInput.value = '';
	}

	async function run(dryRun: boolean) {
		if (!file || busy) return;
		busy = true;
		failure = null;
		try {
			const result = await importFile(entity, file, { fmt: format, dryRun, onConflict });
			if (dryRun) {
				preview = result;
				applied = null;
			} else if (result.problems.length) {
				// The file went stale between the check and the write — a field deleted in
				// another tab, say. Show it as a fresh check rather than as a success.
				preview = result;
				applied = null;
			} else {
				applied = result;
				preview = null;
				clearFileKeepResult();
			}
		} catch (err) {
			failure =
				err instanceof HttpError && err.status === 400
					? (err.body?.message as string) || err.message
					: err instanceof Error
						? err.message
						: String(err);
			preview = null;
		} finally {
			busy = false;
		}
	}

	// After a successful write the file has been consumed: keeping it selected invites
	// a second click that would import everything twice.
	function clearFileKeepResult() {
		file = null;
		if (fileInput) fileInput.value = '';
	}

	let canWrite = $derived(!!preview && preview.problems.length === 0 && !busy);

	function countLine(counts: { created: number; matched: number; updated: number }): string {
		return m['settings.data.counts']({
			created: counts.created,
			matched: counts.matched,
			updated: counts.updated
		});
	}
</script>

<Card divided>
	<SettingRow title={m['settings.data.export.label']()} desc={m['settings.data.export.desc']()}>
		<div class="downloads">
			{#each entities as which (which)}
				<div class="dl-group">
					<span class="dl-name">{m[`settings.data.entity.${which}`]()}</span>
					<Button variant="ghost" href={exportUrl(which, 'csv')} title="CSV">
						<Download size={14} />
						CSV
					</Button>
					<Button variant="ghost" href={exportUrl(which, 'json')} title="JSON">
						<Download size={14} />
						JSON
					</Button>
				</div>
			{/each}
		</div>
	</SettingRow>

	<SettingRow title={m['settings.data.import.label']()} desc={m['settings.data.import.desc']()}>
		<div class="import-controls">
			<select
				class="pick"
				aria-label={m['settings.data.import.whatLabel']()}
				value={entity}
				onchange={(e) => {
					entity = e.currentTarget.value as TransferEntity;
					reset();
					if (file) void run(true);
				}}
			>
				{#each entities as which (which)}
					<option value={which}>{m[`settings.data.entity.${which}`]()}</option>
				{/each}
			</select>

			<input
				bind:this={fileInput}
				class="file"
				type="file"
				accept=".csv,.json,text/csv,application/json"
				aria-label={m['settings.data.import.fileLabel']()}
				onchange={chooseFile}
			/>
		</div>
	</SettingRow>

	<SettingRow
		title={m['settings.data.import.onConflict.label']()}
		desc={m['settings.data.import.onConflict.desc']()}
	>
		<Toggle
			checked={onConflict === 'update'}
			onchange={(v) => {
				onConflict = v ? 'update' : 'skip';
				reset();
				if (file) void run(true);
			}}
			ariaLabel={m['settings.data.import.onConflict.label']()}
		/>
	</SettingRow>
</Card>

{#if busy}
	<p class="note">{m['settings.data.import.checking']()}</p>
{/if}

{#if failure}
	<div class="panel bad">
		<div class="panel-head">{m['settings.data.import.failed']()}</div>
		<p class="msg">{failure}</p>
	</div>
{/if}

{#if preview}
	<div class="panel" class:bad={preview.problems.length > 0}>
		<div class="panel-head">
			{preview.problems.length
				? m['settings.data.import.refused']({ rows: preview.rows })
				: m['settings.data.import.preview']({ rows: preview.rows })}
		</div>

		{#if preview.problems.length}
			<ul class="problems">
				{#each preview.problems.slice(0, 50) as problem, i (i)}
					<li>
						{#if problem.row > 0}
							<!-- Row 0 means the complaint is about the file as a whole, so there is
							     no position to name — printing "row 0" would be nonsense. -->
							<span class="where mono">
								{problem.column
									? m['settings.data.import.at']({ row: problem.row, column: problem.column })
									: m['settings.data.import.atRow']({ row: problem.row })}
							</span>
						{/if}
						{problem.message}
					</li>
				{/each}
			</ul>
			{#if preview.problems.length > 50}
				<p class="msg">{m['settings.data.import.more']({ count: preview.problems.length - 50 })}</p>
			{/if}
		{:else}
			<dl class="summary">
				<dt>{m['settings.data.entity.vendors']()}</dt>
				<dd>{countLine(preview.vendors)}</dd>
				<dt>{m['settings.data.entity.filaments']()}</dt>
				<dd>{countLine(preview.filaments)}</dd>
				<dt>{m['settings.data.entity.spools']()}</dt>
				<dd>{countLine(preview.spools)}</dd>
			</dl>

			{#if preview.ignored_columns.length}
				<p class="msg">
					{m['settings.data.import.ignored']({ columns: preview.ignored_columns.join(', ') })}
				</p>
			{/if}

			<div class="actions">
				<Button variant="primary" disabled={!canWrite} onclick={() => run(false)}>
					<Upload size={15} />
					{m['settings.data.import.apply']()}
				</Button>
				<Button variant="ghost" onclick={clearFile}>{m['buttons.cancel']()}</Button>
			</div>
		{/if}
	</div>
{/if}

{#if applied}
	<div class="panel good">
		<div class="panel-head">{m['settings.data.import.done']({ rows: applied.rows })}</div>
		<dl class="summary">
			<dt>{m['settings.data.entity.vendors']()}</dt>
			<dd>{countLine(applied.vendors)}</dd>
			<dt>{m['settings.data.entity.filaments']()}</dt>
			<dd>{countLine(applied.filaments)}</dd>
			<dt>{m['settings.data.entity.spools']()}</dt>
			<dd>{countLine(applied.spools)}</dd>
		</dl>
	</div>
{/if}

<style>
	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		justify-content: flex-end;
		/* Without these two the block neither shrinks nor wraps, and the column
		   beside it — the title and description — is what collapses instead. */
		min-width: 0;
		max-width: 60%;
	}
	.dl-group {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.dl-name {
		font-size: 12px;
		color: var(--text-muted);
		margin-right: 2px;
	}
	.import-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		justify-content: flex-end;
		min-width: 0;
		max-width: 60%;
	}
	.pick,
	.file {
		font: inherit;
		font-size: 13px;
		color: var(--text);
		background: var(--surface-sunken);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 5px 8px;
		max-width: 100%;
	}
	.note {
		font-size: 12px;
		color: var(--text-muted);
		margin: 10px 2px 0;
	}
	.panel {
		margin-top: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		padding: 12px 14px;
	}
	.panel.bad {
		border-color: var(--danger, #c0392b);
	}
	.panel.good {
		border-color: var(--success, #2e7d32);
	}
	.panel-head {
		font-weight: 600;
		font-size: 13px;
		margin-bottom: 8px;
	}
	.summary {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 14px;
		margin: 0;
		font-size: 13px;
	}
	.summary dt {
		color: var(--text-muted);
	}
	.summary dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.problems {
		margin: 0;
		padding-left: 18px;
		font-size: 13px;
		max-height: 260px;
		overflow-y: auto;
	}
	.problems li {
		margin-bottom: 3px;
	}
	.where {
		color: var(--text-muted);
		margin-right: 6px;
	}
	.msg {
		font-size: 12px;
		color: var(--text-muted);
		margin: 8px 0 0;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
</style>
