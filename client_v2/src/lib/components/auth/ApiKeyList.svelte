<script lang="ts">
	import Card from '$components/Card.svelte';
	import Button from '$components/Button.svelte';
	import SecretReveal from './SecretReveal.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Ban from '@lucide/svelte/icons/ban';
	import {
		createApiKey,
		deleteApiKey,
		listApiKeys,
		revokeApiKey,
		type ApiKeyCreated,
		type ApiKeyInfo,
		type Level
	} from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { isAbortError } from '$lib/api/http';
	import { formatDateTime } from '$lib/utils/datetime';
	import { grantableLevels, levelDescription, levelLabel } from '$lib/utils/levels';
	import * as m from '$lib/paraglide/messages';

	// The account page's key manager: list, create, revoke, delete.
	//
	// The one thing this screen must get right is that a new key's secret is shown
	// once. The server hashes it and cannot produce it again, so the reveal panel stays
	// up until the user explicitly dismisses it rather than closing on its own.

	const EXPIRY_CHOICES: (number | null)[] = [30, 90, 365, null];

	let keys = $state<ApiKeyInfo[]>([]);
	let loading = $state(true);
	let failed = $state(false);

	let creating = $state(false);
	let submitting = $state(false);
	let name = $state('');
	let level = $state<Level>('read');
	let expiresDays = $state<number | null>(90);
	let formError = $state('');

	// The plaintext key, held only until dismissed. Never written anywhere else.
	let revealed = $state<ApiKeyCreated | null>(null);

	$effect(() => {
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		try {
			keys = await listApiKeys(signal);
			failed = false;
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load API keys', e);
			failed = true;
		} finally {
			loading = false;
		}
	}

	function openForm() {
		name = '';
		// Default to the weakest level rather than the user's own. A key should be as
		// small as the job needs, and the common case really is a read-only scraper.
		level = 'read';
		expiresDays = 90;
		formError = '';
		creating = true;
	}

	async function submit() {
		if (submitting) return;
		if (!name.trim()) {
			formError = m['account.keyNameRequired']();
			return;
		}
		submitting = true;
		formError = '';
		try {
			revealed = await createApiKey(name.trim(), level, expiresDays);
			creating = false;
			await load();
		} catch (e) {
			console.error('Failed to create API key', e);
			formError = m['account.keysFailed']();
		} finally {
			submitting = false;
		}
	}

	async function revoke(key: ApiKeyInfo) {
		if (!confirm(m['account.keyRevokeConfirm']({ name: key.name }))) return;
		try {
			await revokeApiKey(key.id);
			await load();
		} catch (e) {
			console.error('Failed to revoke API key', e);
		}
	}

	async function remove(key: ApiKeyInfo) {
		if (!confirm(m['account.keyDeleteConfirm']({ name: key.name }))) return;
		try {
			await deleteApiKey(key.id);
			await load();
		} catch (e) {
			console.error('Failed to delete API key', e);
		}
	}

	function statusOf(key: ApiKeyInfo): string {
		if (key.revoked) return m['account.keyRevoked']();
		if (key.expired) return m['account.keyExpired']();
		return m['account.keyActive']();
	}
</script>

{#if revealed}
	<SecretReveal
		title={m['account.keyCreated']()}
		value={revealed.key}
		warning={m['account.keyCreatedWarning']()}
		ondismiss={() => (revealed = null)}
	/>
{/if}

<Card divided>
	{#if loading}
		<div class="empty">{m['auth.loading']()}…</div>
	{:else if failed}
		<div class="empty">{m['account.keysFailed']()}</div>
	{:else if keys.length === 0}
		<div class="empty">{m['account.keysEmpty']()}</div>
	{:else}
		{#each keys as key (key.id)}
			<div class="key" class:inactive={key.revoked || key.expired}>
				<div class="key-main">
					<div class="key-name">
						{key.name}
						<span class="badge" class:dim={key.revoked || key.expired}>{statusOf(key)}</span>
					</div>
					<div class="key-meta mono">{key.prefix}</div>
					<div class="key-meta">
						{m['account.keyCreatedOn']({ date: formatDateTime(key.created) })}
						{#if key.last_used}
							· {m['account.keyLastUsed']({ date: formatDateTime(key.last_used) })}
						{:else}
							· {m['account.keyNeverUsed']()}
						{/if}
						{#if key.expires}
							· {m['account.keyExpiresOn']({ date: formatDateTime(key.expires) })}
						{/if}
					</div>
					<div class="key-meta">
						{levelLabel(key.effective_level)}
						{#if key.effective_level !== key.level}
							<!-- The key outranks its owner, so the server is capping it. Saying
							     so beats silently showing a level it does not actually have. -->
							<span class="capped"
								>{m['account.keyCappedNotice']({ level: levelLabel(key.effective_level) })}</span
							>
						{/if}
					</div>
				</div>
				<div class="key-actions">
					{#if !key.revoked}
						<button
							type="button"
							class="icon"
							onclick={() => revoke(key)}
							aria-label={m['account.keyRevoke']()}
							title={m['account.keyRevoke']()}
						>
							<Ban size={15} />
						</button>
					{/if}
					<button
						type="button"
						class="icon danger"
						onclick={() => remove(key)}
						aria-label={m['account.keyDelete']()}
						title={m['account.keyDelete']()}
					>
						<Trash2 size={15} />
					</button>
				</div>
			</div>
		{/each}
	{/if}
</Card>

{#if creating}
	<Card>
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label for="key-name">{m['account.keyName']()}</label>
			<input
				id="key-name"
				type="text"
				bind:value={name}
				placeholder={m['account.keyNamePlaceholder']()}
				disabled={submitting}
				maxlength="64"
			/>

			<label for="key-level">{m['account.keyLevel']()}</label>
			<select id="key-level" bind:value={level} disabled={submitting}>
				{#each grantableLevels(auth.level) as option (option)}
					<option value={option}>{levelLabel(option)}</option>
				{/each}
			</select>
			<p class="hint">{levelDescription(level)}</p>

			<label for="key-expiry">{m['account.keyExpiry']()}</label>
			<select id="key-expiry" bind:value={expiresDays} disabled={submitting}>
				{#each EXPIRY_CHOICES as choice (choice ?? 'never')}
					<option value={choice}>
						{choice === null ? m['account.keyExpiryNever']() : m['account.keyExpiryDays']({ count: choice })}
					</option>
				{/each}
			</select>

			{#if formError}<p class="error" role="alert">{formError}</p>{/if}

			<div class="form-actions">
				<Button type="submit" variant="primary" disabled={submitting}>
					{m['account.keyCreate']()}
				</Button>
				<Button variant="ghost" onclick={() => (creating = false)}>{m['buttons.cancel']()}</Button>
			</div>
		</form>
	</Card>
{:else}
	<div class="add"><Button variant="outline" onclick={openForm}>{m['account.newKey']()}</Button></div>
{/if}

<style>
	.empty {
		padding: 16px;
		font-size: 12.5px;
		color: var(--text-dim);
	}

	.key {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
	}

	.key.inactive {
		opacity: 0.6;
	}

	.key-main {
		flex: 1;
		min-width: 0;
	}

	.key-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
	}

	.key-meta {
		margin-top: 2px;
		font-size: 11.5px;
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}

	.capped {
		margin-left: 6px;
		color: var(--warning, var(--text-muted));
	}

	.badge {
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		background: var(--accent-wash);
		color: var(--accent-soft);
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge.dim {
		background: var(--surface-sunken);
		color: var(--text-dim);
	}

	.key-actions {
		display: flex;
		gap: 2px;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon:hover {
		background: var(--surface-sunken);
		color: var(--text);
	}

	.icon.danger:hover {
		color: var(--danger);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 16px;
	}

	.form label {
		margin-top: 6px;
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.form input,
	.form select {
		height: 40px;
		padding: 0 10px;
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		background: var(--input-bg);
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		outline: none;
	}

	.form input:focus,
	.form select:focus {
		border-color: var(--accent);
	}

	.hint {
		margin: 2px 0 0;
		font-size: 11.5px;
		color: var(--text-dim);
	}

	.error {
		margin: 4px 0 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.form-actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}

	.add {
		margin-top: 10px;
	}
</style>
