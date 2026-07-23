<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'outline' | 'ghost';
		type?: 'button' | 'submit';
		onclick?: (e: MouseEvent) => void;
		/** When set the button navigates: it renders as a real `<a href>` link
		 *  (middle-click / copy-link work) instead of a `<button>`. */
		href?: string;
		title?: string;
		disabled?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		type = 'button',
		onclick,
		href,
		title,
		disabled = false,
		children
	}: Props = $props();
</script>

{#if href}
	<a class="btn {variant}" class:disabled {href} {title} {onclick}>
		{@render children()}
	</a>
{:else}
	<button class="btn {variant}" {type} {onclick} {title} {disabled}>
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
		background: var(--accent);
		color: #fff;
		padding: 8px 14px;
	}
	.primary:hover {
		background: var(--accent-hover);
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

	.ghost {
		background: none;
		color: var(--text-2);
		padding: 6px 10px;
		font-weight: 500;
	}
	.ghost:hover {
		color: var(--text);
	}

	.btn:disabled,
	.btn.disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.primary:disabled:hover {
		background: var(--accent);
	}
	.outline:disabled:hover {
		border-color: var(--border-strong);
	}
</style>
