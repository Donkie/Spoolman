<script lang="ts">
	import AuthCard from './AuthCard.svelte';
	import ChangePasswordForm from './ChangePasswordForm.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';

	// Shown in place of the app when the signed-in user's password was set by somebody
	// else. Phase 1 could set must_change_password from the CLI and clear it through
	// POST /auth/password, but nothing ever made the user go through it, so the flag
	// was advisory. This is what makes it mean something.
	//
	// There is deliberately no way past this screen other than changing the password or
	// signing out. A "remind me later" would defeat the purpose: the administrator who
	// set the temporary password knows it.
</script>

<AuthCard>
	<h1>{m['auth.mustChangeTitle']()}</h1>
	<p class="sub">{m['auth.mustChangeIntro']()}</p>

	<ChangePasswordForm />

	<button class="signout" type="button" onclick={() => auth.signOut()}>
		{m['auth.signOut']()}
	</button>
</AuthCard>

<style>
	h1 {
		margin: 0 0 4px;
		font-size: 1.15rem;
		font-weight: 600;
		text-align: center;
	}

	.sub {
		margin: 0 0 12px;
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
	}

	.signout {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 12px;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.signout:hover {
		color: var(--text);
	}
</style>
