<script lang="ts">
	// A small modal for destructive actions. Its job is the body text: the caller
	// spells out what is about to happen (what survives, what doesn't) instead of
	// asking a bare "are you sure?".
	//
	// Leaving `onconfirm` unset turns it into an explain-only dialog — used when the
	// action isn't possible at all and the user deserves the reason rather than an
	// error toast after the fact.
	import Button from './Button.svelte';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		title: string;
		/** The consequence, spelled out — one paragraph per entry. */
		lines: string[];
		/** Label for the destructive button; omit it (with `onconfirm`) to explain only. */
		confirmLabel?: string;
		onconfirm?: () => void;
		onclose: () => void;
		/** Disables the buttons while the request is in flight. */
		busy?: boolean;
	}

	let { open, title, lines, confirmLabel, onconfirm, onclose, busy = false }: Props = $props();

	let dialog = $state<HTMLDivElement | null>(null);
	// Captured before the dialog takes focus and restored when it closes, so
	// cancelling puts the user back on the button they pressed. After a successful
	// delete that button is gone and the focus() is a harmless no-op.
	let opener: HTMLElement | null = null;
	$effect(() => {
		if (open) {
			opener ??= document.activeElement as HTMLElement | null;
			dialog?.focus();
		} else if (opener) {
			opener.focus();
			opener = null;
		}
	});

	function close() {
		if (!busy) onclose();
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') close();
	}}
/>

{#if open}
	<div class="overlay">
		<!-- Click-outside catcher: a sibling of the dialog (not a parent) so it doesn't
		     nest interactive controls inside an interactive element. Keyboard close is
		     handled by the window Escape listener above. -->
		<button class="backdrop" tabindex="-1" aria-hidden="true" onclick={close}></button>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
			tabindex="-1"
			bind:this={dialog}
		>
			<div class="head">
				<span class="title" id="confirm-dialog-title">{title}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>
			<div class="body">
				{#each lines as line (line)}
					<p>{line}</p>
				{/each}
			</div>
			<div class="foot">
				{#if onconfirm}
					<Button variant="outline" disabled={busy} onclick={close}>{m['buttons.cancel']()}</Button>
					<Button variant="danger" disabled={busy} onclick={onconfirm}>
						{confirmLabel ?? m['buttons.delete']()}
					</Button>
				{:else}
					<Button variant="outline" onclick={close}>{m['buttons.close']()}</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 60;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 12vh 16px 16px;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		border: none;
		margin: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.dialog {
		position: relative;
		z-index: 1;
		width: 420px;
		max-width: 100%;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 20px 0;
	}
	.title {
		font-weight: 700;
		font-size: 15px;
	}
	.x {
		margin-left: auto;
		color: var(--text-dim);
		cursor: pointer;
		padding: 4px 8px;
		background: none;
		border: none;
		display: inline-flex;
	}
	.x:hover {
		color: var(--text);
	}
	.body {
		padding: 12px 20px 4px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.body p {
		margin: 0 0 8px;
	}
	.body p:last-child {
		margin-bottom: 0;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 16px 20px 18px;
	}
</style>
