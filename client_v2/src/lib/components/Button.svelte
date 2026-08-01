<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Generic link component: `href` arrives already resolved against the deploy base
	   path (the params.ts helpers that produce it call resolve()), so resolving it
	   again here would double-apply the base path. */
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost';
		type?: 'button' | 'submit';
		onclick?: (e: MouseEvent) => void;
		/** When set the button navigates: it renders as a real `<a href>` link
		 *  (middle-click / copy-link work) instead of a `<button>`. */
		href?: string;
		title?: string;
		/** Accessible name. Required when the content is an icon with no text. */
		ariaLabel?: string;
		disabled?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		type = 'button',
		onclick,
		href,
		title,
		ariaLabel,
		disabled = false,
		children
	}: Props = $props();
</script>

{#if href}
	<a class="btn {variant}" class:disabled {href} {title} aria-label={ariaLabel} {onclick}>
		{@render children()}
	</a>
{:else}
	<button class="btn {variant}" {type} {onclick} {title} aria-label={ariaLabel} {disabled}>
		{@render children()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		text-decoration: none;
		border: 1px solid transparent;
		transition:
			background 0.12s,
			border-color 0.12s;
	}

	.primary {
		background: var(--accent-fill);
		color: #fff;
		padding: 8px 14px;
	}
	.primary:hover {
		background: var(--accent-fill-hover);
	}

	.outline {
		background: none;
		border-color: var(--border-strong);
		color: var(--text-2);
		padding: 7px 12px;
		font-weight: 500;
		font-size: 12.5px;
	}
	.outline:hover {
		border-color: var(--accent);
	}

	/* Occasional actions that sit apart from the one button a panel is really for
	   (duplicate, delete). They recede until you reach for them, and only take on
	   weight — or colour — under the cursor. */
	.ghost,
	.danger-ghost {
		background: none;
		color: var(--text-dim);
		padding: 7px 9px;
		font-weight: 500;
	}
	.ghost:hover {
		color: var(--text);
		background: var(--surface-raised);
	}
	.danger-ghost:hover {
		color: var(--danger);
		background: var(--danger-wash);
	}

	/* Confirming a delete. Filled rather than outlined so the irreversible action
	   never looks like the quiet way out of a dialog. */
	.danger {
		background: var(--danger);
		color: #fff;
		padding: 8px 14px;
	}
	.danger:hover {
		background: var(--danger-soft);
	}
	.danger:disabled:hover {
		background: var(--danger);
	}

	.btn:disabled,
	.btn.disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.primary:disabled:hover {
		background: var(--accent-fill);
	}
	.outline:disabled:hover {
		border-color: var(--border-strong);
	}
</style>
