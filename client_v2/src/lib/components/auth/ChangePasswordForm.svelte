<script lang="ts">
	import PasswordInput from './PasswordInput.svelte';
	import Button from '$components/Button.svelte';
	import { changePassword } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { HttpError } from '$lib/api/http';
	import * as m from '$lib/paraglide/messages';

	// Shared by the account page and the forced-change screen, which differ only in
	// their surroundings: the same three fields, the same validation, the same call.

	// Mirrors MIN_PASSWORD_LENGTH in spoolman/api/v1/models.py. Checked here only so
	// the user hears about it before a round trip; the server is the authority.
	const MIN_LENGTH = 10;
	const BAD_REQUEST = 400;

	let { onsuccess }: { onsuccess?: () => void } = $props();

	let current = $state('');
	let next = $state('');
	let confirm = $state('');
	let submitting = $state(false);
	let error = $state('');
	let done = $state(false);

	async function submit() {
		if (submitting) return;
		error = '';
		done = false;

		if (next.length < MIN_LENGTH) {
			error = m['auth.passwordTooShort']({ min: MIN_LENGTH });
			return;
		}
		if (next !== confirm) {
			error = m['auth.passwordMismatch']();
			return;
		}

		submitting = true;
		try {
			await changePassword(current, next);
			// Re-read the session so must_change_password clears and the forced screen
			// gives way. Nothing else tells the store the flag is gone.
			await auth.load();
			current = next = confirm = '';
			done = true;
			onsuccess?.();
		} catch (e) {
			// 400 is the server's answer for a wrong current password, and it is worth
			// distinguishing: it is the one failure the user can act on directly.
			if (e instanceof HttpError && e.status === BAD_REQUEST) error = m['auth.passwordIncorrect']();
			else error = m['auth.passwordChangeFailed']();
		} finally {
			submitting = false;
		}
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}
>
	<label for="pw-current">{m['auth.currentPassword']()}</label>
	<PasswordInput id="pw-current" bind:value={current} autocomplete="current-password" disabled={submitting} />

	<label for="pw-new">{m['auth.newPassword']()}</label>
	<PasswordInput id="pw-new" bind:value={next} autocomplete="new-password" disabled={submitting} />

	<label for="pw-confirm">{m['auth.confirmPassword']()}</label>
	<PasswordInput id="pw-confirm" bind:value={confirm} autocomplete="new-password" disabled={submitting} />

	{#if error}
		<p class="error" role="alert">{error}</p>
	{:else if done}
		<p class="ok" role="status">{m['auth.passwordChanged']()}</p>
	{/if}

	<Button type="submit" variant="primary" disabled={submitting}>
		{m['auth.changePassword']()}
	</Button>
</form>

<style>
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

	.error {
		margin: 4px 0 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.ok {
		margin: 4px 0 0;
		color: var(--text-2);
		font-size: 0.85rem;
	}

	form :global(button[type='submit']) {
		margin-top: 12px;
		align-self: flex-start;
		min-height: 44px;
	}
</style>
