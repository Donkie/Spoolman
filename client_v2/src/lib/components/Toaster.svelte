<script lang="ts">
	// Renders the transient toast stack (see lib/stores/toasts.svelte.ts).
	// Mounted once in the root layout so any view can raise a message.
	//
	// Positioning: bottom-right on desktop, clear of the footer; bottom-centred
	// and full-width on narrow screens, where the inspectors go full-screen and a
	// corner toast would sit under the thumb. `pointer-events: none` on the stack
	// keeps it from blocking the UI underneath — only the toasts themselves (which
	// are dismissible on click) take pointer events.
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { fly } from 'svelte/transition';
	import { toasts } from '$lib/stores/toasts.svelte';
</script>

<div class="toaster" role="status" aria-live="polite">
	{#each toasts.items as toast (toast.id)}
		<button
			class="toast {toast.kind}"
			transition:fly={{ y: 12, duration: 150 }}
			onclick={() => toasts.dismiss(toast.id)}
		>
			{#if toast.kind === 'error'}
				<TriangleAlert size={15} />
			{:else}
				<Check size={15} />
			{/if}
			<span>{toast.message}</span>
		</button>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		right: 18px;
		bottom: 46px;
		z-index: 3500;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: min(360px, calc(100vw - 36px));
		padding: 9px 14px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		color: var(--text);
		font-family: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	}
	.toast.success {
		border-color: var(--success-border);
		color: var(--success);
	}
	.toast.error {
		border-color: var(--danger);
		color: var(--danger-soft);
	}

	@media (max-width: 620px) {
		.toaster {
			left: 12px;
			right: 12px;
			bottom: 12px;
			align-items: stretch;
		}
		.toast {
			max-width: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.toast {
			transition: none;
		}
	}
</style>
