<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'outline' | 'ghost';
		type?: 'button' | 'submit';
		onclick?: (e: MouseEvent) => void;
		title?: string;
		disabled?: boolean;
		children: Snippet;
	}

	let { variant = 'primary', type = 'button', onclick, title, disabled = false, children }: Props = $props();
</script>

<button class="btn {variant}" {type} {onclick} {title} {disabled}>
	{@render children()}
</button>

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

	.btn:disabled {
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
