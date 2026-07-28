<script lang="ts">
	import Card from '$components/Card.svelte';
	import Button from '$components/Button.svelte';
	import Toggle from '$components/Toggle.svelte';
	import Checkbox from '$components/Checkbox.svelte';
	import PasswordInput from '$components/auth/PasswordInput.svelte';
	import SecretReveal from '$components/auth/SecretReveal.svelte';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import {
		createUser,
		deleteUser,
		listUsers,
		resetUserPassword,
		revokeUserSessions,
		updateUser
	} from '$lib/api/admin';
	import type { AuthUserInfo, Level } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { HttpError, isAbortError } from '$lib/api/http';
	import { LEVELS, levelLabel } from '$lib/utils/levels';
	import * as m from '$lib/paraglide/messages';

	// Administrator-only. The server refuses every request here without admin rights,
	// so the page gates itself to avoid rendering an interface that cannot work.
	//
	// Every control that the server would refuse for a *specific* account — the owner's
	// level, an administrator's own active flag — is disabled with the reason shown,
	// rather than left enabled to fail. The rules are duplicated from
	// spoolman/api/v1/users.py::_protected; the server remains the authority.

	let users = $state<AuthUserInfo[]>([]);
	let loading = $state(true);
	let failed = $state(false);
	let busy = $state<number | null>(null);

	let creating = $state(false);
	let submitting = $state(false);
	let newUsername = $state('');
	let newPassword = $state('');
	let newDisplayName = $state('');
	let newLevel = $state<Level>('read');
	let newIsAdmin = $state(false);
	let newMustChange = $state(true);
	let formError = $state('');

	// A generated password, held until dismissed. The server returns it once.
	let secret = $state<{ title: string; value: string } | null>(null);

	$effect(() => {
		// Nothing to fetch without admin rights; the guard in the markup explains why.
		if (!auth.enabled || !auth.isAdmin) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		try {
			users = await listUsers(signal);
			failed = false;
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load users', e);
			failed = true;
		} finally {
			loading = false;
		}
	}

	/** Why a destructive change to this account is refused, or '' when it is allowed. */
	function protectedReason(user: AuthUserInfo): string {
		if (user.is_owner) return m['users.protectedOwner']();
		if (user.id === auth.user?.id) return m['users.protectedSelf']();
		return '';
	}

	async function patch(user: AuthUserInfo, change: Parameters<typeof updateUser>[1]) {
		busy = user.id;
		try {
			await updateUser(user.id, change);
			await load();
			toasts.success(m['users.saved']());
		} catch (e) {
			console.error('Failed to update user', e);
			toasts.error(e instanceof HttpError ? e.message : m['users.loadFailed']());
			// Reload regardless: the row on screen may now disagree with the server.
			await load();
		} finally {
			busy = null;
		}
	}

	async function submitCreate() {
		if (submitting) return;
		if (!newUsername.trim()) {
			formError = m['auth.usernameRequired']();
			return;
		}
		submitting = true;
		formError = '';
		try {
			const created = await createUser({
				username: newUsername.trim(),
				password: newPassword ? newPassword : null,
				display_name: newDisplayName.trim() || null,
				level: newLevel,
				is_admin: newIsAdmin,
				must_change_password: newMustChange
			});
			creating = false;
			newUsername = newPassword = newDisplayName = '';
			if (created.password) {
				secret = { title: m['users.generatedPassword'](), value: created.password };
			}
			await load();
		} catch (e) {
			formError = e instanceof HttpError && e.status === 409 ? e.message : m['users.loadFailed']();
		} finally {
			submitting = false;
		}
	}

	async function resetPassword(user: AuthUserInfo) {
		if (!confirm(m['users.resetWarning']())) return;
		busy = user.id;
		try {
			const result = await resetUserPassword(user.id, null, true);
			if (result.password) {
				secret = { title: m['users.generatedPassword'](), value: result.password };
			}
			await load();
		} catch (e) {
			console.error('Failed to reset password', e);
			toasts.error(m['users.loadFailed']());
		} finally {
			busy = null;
		}
	}

	async function signOutEverywhere(user: AuthUserInfo) {
		busy = user.id;
		try {
			await revokeUserSessions(user.id);
			toasts.success(m['users.sessionsRevoked']());
		} catch (e) {
			console.error('Failed to revoke sessions', e);
			toasts.error(m['users.loadFailed']());
		} finally {
			busy = null;
		}
	}

	async function remove(user: AuthUserInfo) {
		if (!confirm(m['users.deleteConfirm']({ name: user.username }))) return;
		busy = user.id;
		try {
			await deleteUser(user.id);
			toasts.success(m['users.deleted']());
			await load();
		} catch (e) {
			console.error('Failed to delete user', e);
			toasts.error(e instanceof HttpError ? e.message : m['users.loadFailed']());
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>{m['documentTitle.users']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">{m['users.header']()}</div>
		<p class="desc">{m['users.desc']()}</p>

		{#if !auth.enabled || !auth.isAdmin}
			<!-- Reachable by typing the URL. Say so rather than firing a page of
			     requests the server will refuse. -->
			<p class="notice">{m['auth.forbidden']()}</p>
		{:else}
			{#if secret}
				<SecretReveal
					title={secret.title}
					value={secret.value}
					warning={m['users.generatedPasswordWarning']()}
					ondismiss={() => (secret = null)}
				/>
			{/if}

			<Card divided>
				{#if loading}
					<div class="empty">{m['auth.loading']()}…</div>
				{:else if failed}
					<div class="empty">{m['users.loadFailed']()}</div>
				{:else}
					{#each users as user (user.id)}
						{@const reason = protectedReason(user)}
						<div class="user" class:disabled={!user.is_active}>
							<div class="user-main">
								<div class="user-name">
									{user.username}
									{#if user.is_owner}<span class="badge">{m['account.roleOwner']()}</span>{/if}
									{#if user.id === auth.user?.id}<span class="badge dim">{m['users.you']()}</span>{/if}
								</div>
								{#if user.display_name}<div class="user-meta">{user.display_name}</div>{/if}
								<div class="user-meta">
									{#if !user.is_active}
										{m['users.statusDisabled']()} ·
									{/if}
									{#if user.must_change_password}
										{m['users.statusMustChange']()}
									{/if}
								</div>
								{#if reason}<div class="user-meta hint">{reason}</div>{/if}
							</div>

							<div class="controls">
								<label class="ctl">
									<span class="ctl-label">{m['users.level']()}</span>
									<select
										value={user.level}
										disabled={!!reason || busy === user.id}
										aria-label={m['users.level']()}
										onchange={(e) => patch(user, { level: e.currentTarget.value as Level })}
									>
										{#each LEVELS as option (option)}
											<option value={option}>{levelLabel(option)}</option>
										{/each}
									</select>
								</label>

								<div class="ctl">
									<span class="ctl-label">{m['users.admin']()}</span>
									<Toggle
										checked={user.is_admin}
										disabled={(!!reason && user.is_admin) || busy === user.id}
										ariaLabel={m['users.admin']()}
										onchange={(v) => patch(user, { is_admin: v })}
									/>
								</div>

								<div class="ctl">
									<span class="ctl-label">{m['users.active']()}</span>
									<Toggle
										checked={user.is_active}
										disabled={(!!reason && user.is_active) || busy === user.id}
										ariaLabel={m['users.active']()}
										onchange={(v) => patch(user, { is_active: v })}
									/>
								</div>

								<div class="acts">
									<button
										type="button"
										class="icon"
										disabled={busy === user.id}
										onclick={() => resetPassword(user)}
										aria-label={m['users.resetPassword']()}
										title={m['users.resetPassword']()}
									>
										<KeyRound size={15} />
									</button>
									<button
										type="button"
										class="icon"
										disabled={busy === user.id}
										onclick={() => signOutEverywhere(user)}
										aria-label={m['users.signOutEverywhere']()}
										title={m['users.signOutEverywhere']()}
									>
										<LogOut size={15} />
									</button>
									<button
										type="button"
										class="icon danger"
										disabled={!!reason || busy === user.id}
										onclick={() => remove(user)}
										aria-label={m['users.delete']()}
										title={reason || m['users.delete']()}
									>
										<Trash2 size={15} />
									</button>
								</div>
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
							submitCreate();
						}}
					>
						<label for="nu-username">{m['users.username']()}</label>
						<input
							id="nu-username"
							type="text"
							bind:value={newUsername}
							autocapitalize="off"
							spellcheck="false"
							disabled={submitting}
							maxlength="64"
						/>

						<label for="nu-display">{m['auth.displayNameOptional']()}</label>
						<input
							id="nu-display"
							type="text"
							bind:value={newDisplayName}
							disabled={submitting}
							maxlength="128"
						/>

						<label for="nu-password">{m['users.passwordOptional']()}</label>
						<PasswordInput
							id="nu-password"
							bind:value={newPassword}
							autocomplete="new-password"
							disabled={submitting}
						/>

						<label for="nu-level">{m['users.level']()}</label>
						<select id="nu-level" bind:value={newLevel} disabled={submitting}>
							{#each LEVELS as option (option)}
								<option value={option}>{levelLabel(option)}</option>
							{/each}
						</select>

						<Checkbox bind:checked={newIsAdmin} disabled={submitting} label={m['users.admin']()} />
						<Checkbox
							bind:checked={newMustChange}
							disabled={submitting}
							label={m['users.mustChangePassword']()}
						/>

						{#if formError}<p class="error" role="alert">{formError}</p>{/if}

						<div class="form-actions">
							<Button type="submit" variant="primary" disabled={submitting}>{m['users.create']()}</Button>
							<Button variant="ghost" onclick={() => (creating = false)}>{m['buttons.cancel']()}</Button>
						</div>
					</form>
				</Card>
			{:else}
				<div class="add">
					<Button
						variant="outline"
						onclick={() => {
							formError = '';
							creating = true;
						}}>{m['users.newUser']()}</Button
					>
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
		max-width: 820px;
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
	.empty {
		padding: 16px;
		font-size: 12.5px;
		color: var(--text-dim);
	}

	.user {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
	}
	.user.disabled {
		opacity: 0.6;
	}
	.user-main {
		flex: 1;
		min-width: 180px;
	}
	.user-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
	}
	.user-meta {
		margin-top: 2px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.user-meta.hint {
		font-style: italic;
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

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px;
	}
	.ctl {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.ctl-label {
		font-size: 11.5px;
		color: var(--text-dim);
	}

	select {
		height: 44px;
		padding: 0 8px;
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		background: var(--input-bg);
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		outline: none;
	}
	select:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.acts {
		display: flex;
		gap: 2px;
	}
	.icon {
		display: grid;
		place-items: center;
		/* 44px, matching PasswordInput and the rest of the auth surfaces. */
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.icon:hover:not(:disabled) {
		background: var(--surface-sunken);
		color: var(--text);
	}
	.icon.danger:hover:not(:disabled) {
		color: var(--danger);
	}
	.icon:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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
	.form input[type='text'],
	.form select {
		height: 44px;
		padding: 0 10px;
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		background: var(--input-bg);
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		outline: none;
	}
	.form input[type='text']:focus,
	.form select:focus {
		border-color: var(--accent);
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
	.notice {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		color: var(--text-2);
		font-size: 0.82rem;
	}
</style>
