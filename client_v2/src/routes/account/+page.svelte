<script lang="ts">
	import Card from '$components/Card.svelte';
	import SettingRow from '$components/settings/SettingRow.svelte';
	import ChangePasswordForm from '$components/auth/ChangePasswordForm.svelte';
	import ApiKeyList from '$components/auth/ApiKeyList.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { levelLabel } from '$lib/utils/levels';
	import * as m from '$lib/paraglide/messages';

	// The signed-in user's own account. Unlike /users this needs no admin rights, and
	// unlike the rest of the app it is only reachable at all when auth is enabled —
	// with auth off there is no account to be the subject of any of it.

	function roleLabel(): string {
		if (auth.isOwner) return m['account.roleOwner']();
		if (auth.isAdmin) return m['account.roleAdmin']();
		return m['account.roleUser']();
	}
</script>

<svelte:head>
	<title>{m['documentTitle.account']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">{m['account.header']()}</div>

		{#if !auth.enabled || !auth.authenticated}
			<!-- With auth off there is no account to describe, and no password or key
			     endpoint that would answer. Reachable only by typing the URL. -->
			<p class="notice">{m['auth.forbidden']()}</p>
		{:else}
			<div class="sec-label">{m['account.profile']()}</div>
			<Card divided>
				<SettingRow title={m['auth.username']()}>
					<span class="value mono">{auth.user?.username ?? ''}</span>
				</SettingRow>
				{#if auth.user?.display_name}
					<SettingRow title={m['auth.displayName']()}>
						<span class="value">{auth.user.display_name}</span>
					</SettingRow>
				{/if}
				<SettingRow title={m['account.level']()}>
					<span class="value">{levelLabel(auth.level)}</span>
				</SettingRow>
				<SettingRow title={m['account.role']()}>
					<span class="value">{roleLabel()}</span>
				</SettingRow>
			</Card>

			<div class="sec-label">{m['account.passwordSection']()}</div>
			<p class="desc">{m['account.passwordDesc']()}</p>
			<Card>
				<div class="pad"><ChangePasswordForm /></div>
			</Card>

			<div class="sec-label">{m['account.keysSection']()}</div>
			<p class="desc">{m['account.keysDesc']()}</p>
			<ApiKeyList />
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
		max-width: 680px;
		margin: 0 auto;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.sec-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		padding: 22px 0 8px;
	}
	.desc {
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-dim);
	}
	.value {
		font-size: 12.5px;
		color: var(--text-2);
	}
	.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.pad {
		padding: 14px 16px;
	}
	.notice {
		margin: 12px 0 0;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		color: var(--text-2);
		font-size: 0.82rem;
	}
</style>
