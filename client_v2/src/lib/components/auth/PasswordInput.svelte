<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import * as m from '$lib/paraglide/messages';

	// The app has no password field anywhere else — everything else is change-on-blur
	// auto-save, so this is the first real form control. The reveal toggle is a plain
	// button rather than an icon-only affordance so it carries a label for screen
	// readers, and it is sized to the 44px minimum the mobile a11y audit enforces.

	let {
		value = $bindable(''),
		id,
		autocomplete = 'current-password',
		placeholder = '',
		disabled = false,
		invalid = false
	}: {
		value?: string;
		id: string;
		autocomplete?: 'current-password' | 'new-password';
		placeholder?: string;
		disabled?: boolean;
		invalid?: boolean;
	} = $props();

	let revealed = $state(false);
</script>

<div class="wrap" class:invalid>
	{#if revealed}
		<input
			{id}
			type="text"
			bind:value
			{autocomplete}
			{placeholder}
			{disabled}
			aria-invalid={invalid}
			spellcheck="false"
			autocapitalize="off"
		/>
	{:else}
		<input {id} type="password" bind:value {autocomplete} {placeholder} {disabled} aria-invalid={invalid} />
	{/if}
	<button
		type="button"
		class="reveal"
		onclick={() => (revealed = !revealed)}
		aria-label={revealed ? m['auth.hidePassword']() : m['auth.showPassword']()}
		aria-pressed={revealed}
		{disabled}
	>
		{#if revealed}
			<EyeOff size={16} />
		{:else}
			<Eye size={16} />
		{/if}
	</button>
</div>

<style>
	.wrap {
		display: flex;
		align-items: stretch;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.wrap:focus-within {
		border-color: var(--accent);
	}

	.wrap.invalid {
		border-color: var(--danger);
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0 10px;
		height: 44px;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		outline: none;
	}

	.reveal {
		display: grid;
		place-items: center;
		width: 44px;
		flex: 0 0 44px;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.reveal:hover:not(:disabled) {
		color: var(--text);
	}

	.reveal:disabled {
		cursor: default;
		opacity: 0.5;
	}
</style>
