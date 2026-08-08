<script lang="ts">
	// A draggable divider between two side-by-side panes. It owns no width itself:
	// it reports the width the leading pane should have and lets the parent decide
	// what to do with it, so the same handle works for a stored preference, a
	// derived layout, or nothing at all.
	//
	// A focusable separator is a real control, not decoration — it carries the
	// width as an ARIA range and moves with the arrow keys, which is the only way
	// to resize without a pointer.
	interface Props {
		/** Current width of the pane BEFORE the splitter, in px. */
		value: number;
		min: number;
		max: number;
		/** Width a double-click restores. */
		resetValue: number;
		/** Accessible name; also the tooltip, so mention the double-click. */
		label: string;
		/** `done` marks the end of a gesture — the moment worth persisting. */
		onchange: (px: number, done: boolean) => void;
	}
	let { value, min, max, resetValue, label, onchange }: Props = $props();

	const STEP = 16;
	const COARSE_STEP = 64; // with Shift, for crossing the pane in a few presses

	let el: HTMLDivElement;
	let dragging = $state(false);
	let pointerId: number | null = null;
	let startX = 0;
	let startW = 0;
	let sign = 1;

	function clamp(px: number): number {
		return Math.round(Math.min(Math.max(px, min), max));
	}

	// In RTL the pane we size sits to the RIGHT of the splitter, so dragging left
	// is what widens it. One sign flip covers both the drag and the arrow keys.
	function direction(): number {
		return getComputedStyle(el).direction === 'rtl' ? -1 : 1;
	}

	function pointerdown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		pointerId = e.pointerId;
		el.setPointerCapture(e.pointerId);
		dragging = true;
		startX = e.clientX;
		startW = value;
		sign = direction();
		// Without this the press starts a text selection that then sweeps across
		// whichever pane the drag runs into.
		e.preventDefault();
	}

	// Tracking the pointer from its offset at pointerdown, rather than from where
	// it is now, keeps the handle under the cursor once the width hits min or max:
	// dragging back out resumes at exactly the point it stopped.
	function pointermove(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		onchange(clamp(startW + sign * (e.clientX - startX)), false);
	}

	function pointerup(e: PointerEvent) {
		if (e.pointerId !== pointerId) return;
		pointerId = null;
		if (!dragging) return;
		dragging = false;
		onchange(value, true);
	}

	function keydown(e: KeyboardEvent) {
		const step = e.shiftKey ? COARSE_STEP : STEP;
		let next: number;
		switch (e.key) {
			case 'ArrowLeft':
				next = value - step * direction();
				break;
			case 'ArrowRight':
				next = value + step * direction();
				break;
			case 'Home':
				next = min;
				break;
			case 'End':
				next = max;
				break;
			default:
				return;
		}
		e.preventDefault();
		onchange(clamp(next), true);
	}

	// The cursor and the selection lock belong to the whole document while a drag
	// is running: the pointer is captured here, but it is physically over the panes
	// either side, and they must not fight it with their own cursors.
	$effect(() => {
		if (!dragging) return;
		document.body.classList.add('col-resizing');
		return () => document.body.classList.remove('col-resizing');
	});
</script>

<!-- A separator is non-interactive only while it is NOT focusable; a focusable one
     is the ARIA window splitter, whose whole contract is tabindex + arrow keys +
     aria-value*. Svelte's rule doesn't make that distinction, so both warnings
     below are false here. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={el}
	class="splitter"
	class:dragging
	role="separator"
	tabindex="0"
	aria-orientation="vertical"
	aria-label={label}
	title={label}
	aria-valuenow={Math.round(value)}
	aria-valuemin={Math.round(min)}
	aria-valuemax={Math.round(max)}
	onpointerdown={pointerdown}
	onpointermove={pointermove}
	onpointerup={pointerup}
	onpointercancel={pointerup}
	ondblclick={() => onchange(resetValue, true)}
	onkeydown={keydown}
></div>

<style>
	/* The splitter draws the divider the list pane would otherwise draw itself, so
	   the line and the thing that moves it are one and the same. */
	.splitter {
		flex: none;
		/* The strip straddles the line rather than starting at it, so the divider can
		   be grabbed from either side. The overlap is what puts it over the outer
		   edge of the list's 8px scrollbar, which otherwise hugs the line and takes
		   every press aimed slightly short of it. The negative margin cancels the
		   extra width, so the strip still costs the layout the same 7px it did. */
		width: 10px;
		margin-inline-start: -3px;
		align-self: stretch;
		position: relative;
		/* Above the panes either side. The list pane is its own stacking context (it
		   is a size container), so without this the splitter loses the overlap to
		   whatever the list paints there — the scrollbar, a sticky group header. */
		z-index: 3;
		cursor: col-resize;
		/* Or the browser claims the touch gesture as a scroll and the drag never
		   reaches us. */
		touch-action: none;
	}
	/* The line sits exactly on the pane boundary — 3px into the strip, cancelling
	   the negative margin above — NOT centred in the strip: the list's row
	   hairlines have to run into it, and a couple of px of daylight between them
	   reads as a misalignment. */
	.splitter::before {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 3px;
		inline-size: 1px;
		background: var(--border);
		transition:
			background 0.12s,
			inline-size 0.12s,
			inset-inline-start 0.12s;
	}
	/* Hover/focus/drag all say the same thing — this line moves — so they look the
	   same: the hairline thickens and takes the accent. That doubles as the focus
	   ring (matching DateTimeField's trigger, which also has no room for one). */
	.splitter:hover::before,
	.splitter:focus-visible::before,
	.splitter.dragging::before {
		background: var(--accent);
		/* Thickens around where it already was, so the boundary doesn't appear to
		   move when you reach for it. */
		inset-inline-start: 2px;
		inline-size: 3px;
	}
	.splitter:focus-visible {
		outline: none;
	}
	/* While the drag runs the cursor is over a pane, not over us. */
	:global(body.col-resizing) {
		cursor: col-resize;
		user-select: none;
	}

	/* Mobile: the list is the whole screen and the inspector is a bottom sheet —
	   there are no two panes to divide. */
	@media (max-width: 860px) {
		.splitter {
			display: none;
		}
	}
</style>
