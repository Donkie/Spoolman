<script lang="ts">
	import Card from '$components/Card.svelte';
	import Pagination from '$components/Pagination.svelte';
	import { listAudit, listAuditEvents, type AuditEntry } from '$lib/api/admin';
	import { getSettings, parseSetting, setSetting } from '$lib/api/settings';
	import { isAbortError } from '$lib/api/http';
	import { formatDateTime } from '$lib/utils/datetime';
	import { trackSave } from '$lib/utils/autosave';
	import { auth } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';

	// Administrator-only, read-only. There is no way to write or delete an entry from
	// here by design — the server offers none. Entries appear as a side effect of what
	// they record and leave when the retention window passes over them.

	let pageSize = $state(50);
	let entries = $state<AuditEntry[]>([]);
	let total = $state(0);
	let page = $state(0);
	let event = $state('');
	let events = $state<string[]>([]);
	let loading = $state(true);
	let failed = $state(false);
	let retention = $state(90);

	$effect(() => {
		if (!auth.enabled || !auth.isAdmin) return;
		// Reading these here is what subscribes the effect to them, so changing any one
		// of them refetches.
		const limit = pageSize;
		const offset = page * pageSize;
		const filter = event;
		const controller = new AbortController();
		load(limit, offset, filter, controller.signal);
		return () => controller.abort();
	});

	$effect(() => {
		if (!auth.enabled || !auth.isAdmin) return;
		const controller = new AbortController();
		loadMeta(controller.signal);
		return () => controller.abort();
	});

	async function load(limit: number, offset: number, filter: string, signal: AbortSignal) {
		loading = true;
		try {
			const result = await listAudit({ limit, offset, event: filter }, signal);
			entries = result.entries;
			total = result.total;
			failed = false;
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load the audit log', e);
			failed = true;
		} finally {
			loading = false;
		}
	}

	async function loadMeta(signal: AbortSignal) {
		try {
			events = await listAuditEvents(signal);
			const settings = await getSettings(signal);
			retention = parseSetting(settings.auth_audit_retention_days, 90);
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load audit metadata', e);
		}
	}

	function saveRetention(value: string) {
		const days = Math.max(0, Math.floor(Number(value)));
		if (!Number.isFinite(days)) return;
		retention = days;
		trackSave(setSetting('auth_audit_retention_days', days));
	}

	/** A readable name for an event, falling back to the raw identifier. */
	function eventLabel(name: string): string {
		const key = `audit.events.${name}`;
		const messages = m as unknown as Record<string, (() => string) | undefined>;
		return messages[key]?.() ?? name;
	}

	function actorLabel(entry: AuditEntry): string {
		if (entry.actor_username) return entry.actor_username;
		if (entry.actor_user_id !== null) return m['audit.deletedActor']();
		return m['audit.anonymousActor']();
	}

	/** Render the detail object as `key: value` pairs, since its shape varies by event. */
	function detailText(entry: AuditEntry): string {
		if (!entry.detail) return '';
		return Object.entries(entry.detail)
			.map(([key, value]) => `${key}: ${value}`)
			.join(' · ');
	}
</script>

<svelte:head>
	<title>{m['documentTitle.audit']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">{m['audit.header']()}</div>
		<p class="desc">{m['audit.desc']()}</p>

		{#if !auth.enabled || !auth.isAdmin}
			<!-- Reachable by typing the URL. Say so rather than firing requests the
			     server will refuse. -->
			<p class="notice">{m['auth.forbidden']()}</p>
		{:else}
			<div class="bar">
				<label class="field">
					<span class="field-label">{m['audit.event']()}</span>
					<select
						bind:value={event}
						onchange={() => (page = 0)}
						aria-label={m['audit.event']()}
						class="filter"
					>
						<option value="">{m['audit.allEvents']()}</option>
						{#each events as name (name)}
							<option value={name}>{eventLabel(name)}</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span class="field-label">{m['audit.retention']()}</span>
					<span class="retention">
						<input
							class="num"
							type="number"
							min="0"
							value={retention}
							aria-label={m['audit.retention']()}
							onchange={(e) => saveRetention(e.currentTarget.value)}
						/>
						<span class="unit">{m['audit.retentionDays']()}</span>
					</span>
				</label>
			</div>
			<p class="desc small">{m['audit.retentionDesc']()}</p>

			<Card divided>
				{#if loading}
					<div class="empty">{m['auth.loading']()}…</div>
				{:else if failed}
					<div class="empty">{m['audit.loadFailed']()}</div>
				{:else if entries.length === 0}
					<div class="empty">{m['audit.empty']()}</div>
				{:else}
					{#each entries as entry (entry.id)}
						<div class="entry">
							<div class="when">{formatDateTime(entry.date)}</div>
							<div class="what">
								<div class="event">
									{eventLabel(entry.event)}
									{#if entry.target}<span class="target">{entry.target}</span>{/if}
								</div>
								<div class="meta">
									{actorLabel(entry)}
									{#if entry.ip}· {entry.ip}{/if}
								</div>
								{#if entry.detail}
									<div class="meta detail">{detailText(entry)}</div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</Card>

			{#if total > 0}
				<div class="pager">
					<Pagination
						page={page + 1}
						{pageSize}
						{total}
						onpage={(p) => (page = p - 1)}
						onpagesize={(size) => {
							pageSize = size;
							page = 0;
						}}
					/>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 22px 24px 48px;
	}
	.wrap {
		max-width: 900px;
		margin: 0 auto;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.desc {
		margin: 3px 0 14px;
		font-size: 12px;
		color: var(--text-dim);
	}
	.desc.small {
		margin: 6px 0 14px;
		font-size: 11.5px;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 18px;
		align-items: center;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.field-label {
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.retention {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.unit {
		font-size: 11.5px;
		color: var(--text-dim);
	}

	.filter,
	.num {
		height: 34px;
		padding: 0 8px;
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		background: var(--input-bg);
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		outline: none;
	}
	.filter {
		min-width: 180px;
	}
	.num {
		width: 76px;
		text-align: right;
	}
	.filter:focus,
	.num:focus {
		border-color: var(--accent);
	}

	.empty {
		padding: 16px;
		font-size: 12.5px;
		color: var(--text-dim);
	}

	.entry {
		display: flex;
		gap: 14px;
		padding: 10px 14px;
	}
	.when {
		flex: 0 0 150px;
		font-size: 11.5px;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.what {
		flex: 1;
		min-width: 0;
	}
	.event {
		font-size: 12.5px;
	}
	.target {
		margin-left: 6px;
		color: var(--text-2);
		font-weight: 500;
	}
	.meta {
		margin-top: 2px;
		font-size: 11.5px;
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}
	.meta.detail {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
	}

	.pager {
		margin-top: 12px;
	}
	.notice {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		color: var(--text-2);
		font-size: 0.82rem;
	}

	@media (max-width: 640px) {
		.entry {
			flex-direction: column;
			gap: 2px;
		}
		.when {
			flex: none;
		}
	}
</style>
