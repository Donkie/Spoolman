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

	// Drag-to-dismiss for the mobile sheet. Handlers bail out immediately above
	// the breakpoint, where the sheet is a static in-flow pane.
	const MOBILE = '(max-width: 860px)';
	const START_THRESHOLD = 6; // px of movement before we claim the gesture
	const FLING = 0.5; // px/ms downward that dismisses regardless of distance

	let sheetEl: HTMLDivElement;
	let bodyEl: HTMLDivElement;
	let dragging = $state(false);
	let dragY = $state(0); // px the sheet is pulled below its resting position
	let sheetH = 1;

	let pointerId: number | null = null;
	let pending = false; // pointer is down, but the gesture isn't ours (yet)
	let startY = 0;
	let startedOnBody = false;
	let lastY = 0;
	let lastT = 0;
	let velocity = 0; // px/ms, positive = downward
	let dragged = false; // suppress the grabber's click after a real drag

	// The inline transform must only apply while the sheet is open, otherwise it
	// would override the closed state's translateY(100%) and pin the sheet open.
	let sheetStyle = $derived(open && dragY !== 0 ? `transform: translateY(${dragY}px)` : '');
	let scrimStyle = $derived(open && dragY > 0 ? `opacity: ${Math.max(0, 1 - dragY / sheetH)}` : '');

	// Once closed, drop the offset so the next open starts from rest.
	$effect(() => {
		if (!open) dragY = 0;
	});

	// Tracking happens on `window`, not the sheet: an upward drag takes the
	// pointer off the sheet and onto the scrim, and element-bound handlers would
	// simply stop firing mid-gesture.
	function track(on: boolean) {
		const fn = on ? window.addEventListener : window.removeEventListener;
		fn('pointermove', pointermove as EventListener, { passive: false });
		fn('pointerup', pointerup as EventListener);
		fn('pointercancel', pointercancel as EventListener);
	}
	$effect(() => () => track(false));

	function pointerdown(e: PointerEvent) {
		if (!open || !window.matchMedia(MOBILE).matches) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		pointerId = e.pointerId;
		pending = true;
		dragged = false;
		startY = lastY = e.clientY;
		lastT = e.timeStamp;
		velocity = 0;
		startedOnBody = bodyEl.contains(e.target as Node);
		track(true);
	}

	function pointermove(e: PointerEvent) {
		if (!pending || e.pointerId !== pointerId) return;
		const dy = e.clientY - startY;

		if (!dragging) {
			if (Math.abs(dy) < START_THRESHOLD) return;
			// Started inside the scrollable body: only take the gesture over when
			// the content is already at the top and the pull is downward —
			// anything else is a normal scroll we must stay out of the way of.
			// Note that even a qualifying pull often won't reach us on touch:
			// Chrome hands the gesture to the scroller and fires pointercancel
			// (preventDefault on pointermove can't stop that, only touch-action
			// can, and the body needs pan-y to scroll at all). The grabber, which
			// is touch-action:none, is the affordance that always works.
			if (startedOnBody && (bodyEl.scrollTop > 0 || dy < 0)) {
				pending = false;
				track(false);
				return;
			}
			dragging = true;
			dragged = true;
			sheetH = sheetEl.offsetHeight || 1;
		}

		if (e.timeStamp > lastT) velocity = (e.clientY - lastY) / (e.timeStamp - lastT);
		lastY = e.clientY;
		lastT = e.timeStamp;
		// Pulling up reveals nothing, so resist it rather than letting the sheet
		// float off its anchor.
		dragY = dy > 0 ? dy : Math.max(dy / 3, -60);
		e.preventDefault();
	}

	function pointercancel(e: PointerEvent) {
		pointerup(e, true);
	}

	function pointerup(e: PointerEvent, cancelled = false) {
		if (e.pointerId !== pointerId) return;
		pointerId = null;
		pending = false;
		track(false);
		if (!dragging) return;
		dragging = false;

		const flung = velocity > FLING;
		const dismiss = !cancelled && (flung || (velocity > -0.2 && dragY > sheetH * 0.3));
		if (dismiss) {
			// Keep animating downwards into the close transition instead of
			// snapping back to rest first.
			dragY = sheetH;
			onclose?.();
		} else {
			dragY = 0;
		}
	}
</script>

<div class="pane" class:open>
	<div
		class="scrim"
		role="button"
		tabindex="-1"
		aria-label={m['buttons.close']()}
		style={scrimStyle}
		class:dragging
		onclick={onclose}
		onkeydown={(e) => e.key === 'Escape' && onclose?.()}
	></div>
	<div
		class="sheet"
		class:dragging
		role="group"
		bind:this={sheetEl}
		style={sheetStyle}
		onpointerdown={pointerdown}
	>
		<button class="grabber" onclick={() => !dragged && onclose?.()} aria-label={m['buttons.close']()}
			><span></span></button
		>
		<div class="sheet-body scroll-y" bind:this={bodyEl}>
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
		/* While a finger is down the sheet must track it 1:1, not lag behind an
		   easing curve. */
		.sheet.dragging,
		.scrim.dragging {
			transition: none;
		}
		.grabber {
			display: flex;
			touch-action: none;
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
			/* Keep an overscrolling body from bouncing the page behind the sheet;
			   a pull-down at scrollTop 0 becomes our dismiss gesture instead. */
			overscroll-behavior: contain;
		}
	}
</style>
