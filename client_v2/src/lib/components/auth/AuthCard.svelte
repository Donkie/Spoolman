<script lang="ts">
	import Logo from '$components/Logo.svelte';
	import type { Snippet } from 'svelte';

	// Shared frame for the sign-in and claim screens. These render in place of the
	// normal shell, so they bring their own centring rather than inheriting the app
	// layout's flex row.

	let { children }: { children: Snippet } = $props();
</script>

<div class="screen">
	<div class="card">
		<div class="brand"><Logo /></div>
		{@render children()}
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		overflow-y: auto;
		background: var(--bg);
	}

	.card {
		width: 100%;
		max-width: 380px;
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}

	.brand {
		display: flex;
		justify-content: center;
		margin-bottom: 20px;
	}
</style>
