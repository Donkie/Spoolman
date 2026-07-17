<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	// Adaptive container for the inspector: a normal in-flow side pane on desktop,
	// a sliding bottom-sheet drawer on mobile — switched entirely with CSS, so the
	// children mount exactly once and never remount on resize. `open` only matters
	// on mobile (the desktop pane is always shown).
	interface Props {
		open: boolean;
		onclose?: () => void;
		children: Snippet;
	}
	let { open, onclose, children }: Props = $props();
</script>

<div class="pane" class:open>
	<div
		class="scrim"
		role="button"
		tabindex="-1"
		aria-label={m['buttons.close']()}
		onclick={onclose}
		onkeydown={(e) => e.key === 'Escape' && onclose?.()}
	></div>
	<div class="sheet">
		<button class="grabber" onclick={onclose} aria-label={m['buttons.close']()}><span></span></button>
		<div class="sheet-body scroll-y">
			{@render children()}
		</div>
	</div>
</div>

<style>
	/* Desktop: an in-flow flex pane filling the space beside the list. */
	.pane {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.scrim,
	.grabber {
		display: none;
	}
	.sheet {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.sheet-body {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	/* Mobile: the wrapper drops out of flow (display:contents) and its children
	   become a fixed scrim + sliding bottom sheet. */
	@media (max-width: 860px) {
		.pane {
			display: contents;
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 20;
			background: rgba(0, 0, 0, 0.55);
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.28s;
			border: none;
		}
		.pane.open .scrim {
			opacity: 1;
			pointer-events: auto;
		}
		.sheet {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 21;
			max-height: 88%;
			background: var(--bg);
			border-top: 1px solid var(--border);
			border-radius: 20px 20px 0 0;
			box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
			transform: translateY(100%);
			transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
			overflow: hidden;
		}
		.pane.open .sheet {
			transform: translateY(0);
		}
		.grabber {
			display: flex;
			flex: none;
			justify-content: center;
			padding: 10px 0 6px;
			cursor: pointer;
			background: none;
			border: none;
		}
		.grabber span {
			width: 38px;
			height: 4px;
			border-radius: 2px;
			background: var(--swatch-border-hover);
			display: block;
		}
		.sheet-body {
			padding-bottom: 16px;
		}
	}
</style>
