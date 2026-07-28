<script lang="ts">
	import AuthCard from './AuthCard.svelte';
	import PasswordInput from './PasswordInput.svelte';
	import Button from '$components/Button.svelte';
	import Checkbox from '$components/Checkbox.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { HttpError } from '$lib/api/http';
	import * as m from '$lib/paraglide/messages';

	// A real <form> with a submit button, unlike the rest of the app, which is
	// change-on-blur auto-save. That is what gives Enter-to-submit and lets password
	// managers recognise and offer to save the credentials.

	const UNAUTHORIZED = 401;
	const TOO_MANY_REQUESTS = 429;

	let username = $state('');
	let password = $state('');
	let remember = $state(false);
	let submitting = $state(false);
	let error = $state('');

	async function submit() {
		if (submitting) return;
		error = '';
		if (!username.trim()) {
			error = m['auth.usernameRequired']();
			return;
		}
		submitting = true;
		try {
			await auth.signIn(username, password, remember);
			password = '';
		} catch (e) {
			if (e instanceof HttpError && e.status === UNAUTHORIZED) error = m['auth.invalidCredentials']();
			else if (e instanceof HttpError && e.status === TOO_MANY_REQUESTS) error = m['auth.tooManyAttempts']();
			else error = m['auth.signInFailed']();
			password = '';
		} finally {
			submitting = false;
		}
	}
</script>

<AuthCard>
	<h1>{m['auth.loginTitle']()}</h1>
	<p class="sub">{m['auth.loginSubtitle']()}</p>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<label for="login-username">{m['auth.username']()}</label>
		<input
			id="login-username"
			type="text"
			bind:value={username}
			autocomplete="username"
			autocapitalize="off"
			spellcheck="false"
			disabled={submitting}
		/>

		<label for="login-password">{m['auth.password']()}</label>
		<PasswordInput id="login-password" bind:value={password} disabled={submitting} />

		<Checkbox bind:checked={remember} disabled={submitting} label={m['auth.rememberMe']()} />

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<Button type="submit" variant="primary" disabled={submitting}>
			{submitting ? m['auth.signingIn']() + '…' : m['auth.signIn']()}
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
		margin: 0 0 20px;
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	label {
		font-size: 0.8rem;
		color: var(--text-2);
	}

	label {
		margin-top: 8px;
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
