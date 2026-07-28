<script lang="ts">
	import AuthCard from './AuthCard.svelte';
	import PasswordInput from './PasswordInput.svelte';
	import Button from '$components/Button.svelte';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { auth } from '$lib/stores/auth.svelte';
	import { HttpError } from '$lib/api/http';
	import * as m from '$lib/paraglide/messages';

	// Shown while the instance is unclaimed. Whoever submits this becomes the owner, so
	// the warning is prominent rather than tucked away — an instance left in this state
	// on a reachable network is claimable by anyone who finds it.

	// Must match MIN_PASSWORD_LENGTH in spoolman/api/v1/models.py, which is what
	// actually enforces this; checking here only avoids a pointless round trip.
	const MIN_PASSWORD = 10;
	const CONFLICT = 409;

	let username = $state('');
	let displayName = $state('');
	let password = $state('');
	let confirm = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function submit() {
		if (submitting) return;
		error = '';
		if (!username.trim()) {
			error = m['auth.usernameRequired']();
			return;
		}
		if (password.length < MIN_PASSWORD) {
			error = m['auth.passwordTooShort']({ min: MIN_PASSWORD });
			return;
		}
		if (password !== confirm) {
			error = m['auth.passwordMismatch']();
			return;
		}
		submitting = true;
		try {
			await auth.claim(username, password, displayName.trim() || undefined);
			password = '';
			confirm = '';
		} catch (e) {
			error =
				e instanceof HttpError && e.status === CONFLICT
					? m['auth.setupAlreadyClaimed']()
					: m['auth.setupFailed']();
		} finally {
			submitting = false;
		}
	}
</script>

<AuthCard>
	<h1>{m['auth.setupTitle']()}</h1>
	<p class="sub">{m['auth.setupIntro']()}</p>

	<p class="warn">
		<TriangleAlert size={16} />
		<span>{m['auth.setupWarning']()}</span>
	</p>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<label for="setup-username">{m['auth.username']()}</label>
		<input
			id="setup-username"
			type="text"
			bind:value={username}
			autocomplete="username"
			autocapitalize="off"
			spellcheck="false"
			disabled={submitting}
		/>

		<label for="setup-display">{m['auth.displayNameOptional']()}</label>
		<input
			id="setup-display"
			type="text"
			bind:value={displayName}
			autocomplete="name"
			disabled={submitting}
		/>

		<label for="setup-password">{m['auth.password']()}</label>
		<PasswordInput
			id="setup-password"
			bind:value={password}
			autocomplete="new-password"
			disabled={submitting}
		/>

		<label for="setup-confirm">{m['auth.confirmPassword']()}</label>
		<PasswordInput
			id="setup-confirm"
			bind:value={confirm}
			autocomplete="new-password"
			disabled={submitting}
			invalid={confirm.length > 0 && confirm !== password}
		/>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<Button type="submit" variant="primary" disabled={submitting}>
			{submitting ? m['auth.signingIn']() + '…' : m['auth.setupClaim']()}
		</Button>
	</form>
</AuthCard>

<style>
	h1 {
		margin: 0 0 4px;
		font-size: 1.15rem;
		font-weight: 600;
		text-align: center;
	}

	.sub {
		margin: 0 0 14px;
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
	}

	.warn {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin: 0 0 16px;
		padding: 10px;
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.warn :global(svg) {
		flex: 0 0 auto;
		margin-top: 1px;
		color: var(--danger);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	label {
		margin-top: 8px;
		font-size: 0.8rem;
		color: var(--text-2);
	}

	input[type='text'] {
		height: 44px;
		padding: 0 10px;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		outline: none;
	}

	input[type='text']:focus {
		border-color: var(--accent);
	}

	.error {
		margin: 4px 0 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	form :global(button[type='submit']) {
		margin-top: 12px;
		justify-content: center;
		min-height: 44px;
	}
</style>
