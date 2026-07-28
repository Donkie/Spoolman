<script lang="ts">
	import Card from '$components/Card.svelte';
	import Button from '$components/Button.svelte';
	import Copy from '@lucide/svelte/icons/copy';
	import { toasts } from '$lib/stores/toasts.svelte';
	import * as m from '$lib/paraglide/messages';

	// Shows a value the server will never send again — a new API key, or a generated
	// password. Two rules follow from that and are the reason this is a component
	// rather than a toast:
	//
	// It never auto-dismisses. A toast that times out while the user is fetching their
	// password manager loses the only copy of the secret.
	//
	// It is never logged or stored. The value lives in the caller's state until
	// dismissed and nowhere else.

	let {
		title,
		value,
		warning,
		ondismiss
	}: {
		title: string;
		value: string;
		warning: string;
		ondismiss: () => void;
	} = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			toasts.success(m['account.keyCopied']());
		} catch {
			// The clipboard API is unavailable outside a secure context, which is exactly
			// the plain-HTTP homelab this feature serves. Say so rather than doing
			// nothing; the value is selectable, so manual copying still works.
			toasts.error(m['account.keyCopyFailed']());
		}
	}
</script>

<Card>
	<div class="reveal">
		<div class="reveal-title">{title}</div>
		<p class="warn">{warning}</p>
		<div class="secret">
			<code>{value}</code>
			<button
				type="button"
				class="icon"
				onclick={copy}
				aria-label={m['account.keyCopy']()}
				title={m['account.keyCopy']()}
			>
				<Copy size={15} />
			</button>
		</div>
		<Button variant="outline" onclick={ondismiss}>{m['account.keyDone']()}</Button>
	</div>
</Card>

<style>
	.reveal {
		padding: 14px 16px;
	}

	.reveal-title {
		font-size: 13px;
		font-weight: 600;
	}

	.warn {
		margin: 4px 0 10px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--warning, var(--text-2));
	}

	.secret {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 12px;
		padding: 8px 10px;
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		background: var(--input-bg);
	}

	.secret code {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 12px;
		overflow-wrap: anywhere;
		user-select: all;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: none;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon:hover {
		background: var(--surface-sunken);
		color: var(--text);
	}
</style>
