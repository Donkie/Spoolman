/**
 * Reveal text that has been cut off with an ellipsis (#1093).
 *
 * Truncated text is unreadable, and the value behind it — a filament name, a
 * location, a manufacturer — is usually the whole reason the row is on screen.
 * The fix is the one every platform uses: hover it and see the full string.
 *
 * The point of doing it here rather than with a plain `title={...}` is the word
 * *cut off*. A title on text that already fits is noise: it pops a redundant
 * tooltip over every row the pointer crosses. So the element is measured, and
 * the tooltip appears and disappears as the layout changes — which it does
 * constantly here, since the list pane is resizable (#1034) and the same row is
 * truncated at one width and complete at the next.
 *
 * Scope: this is the pointer story. Touch has no hover, and the answer there is
 * the one already in the app — tapping a row opens the inspector, which shows
 * every value in full and never truncates it.
 */

/**
 * Fractional layout puts scrollWidth a hair over clientWidth on text that
 * visibly fits, so a bare `>` would tag half the rows in a list. A pixel of
 * slack is well under the width of the ellipsis it takes to truncate.
 */
function isCut(node: HTMLElement): boolean {
	return node.scrollWidth - node.clientWidth > 1;
}

/**
 * Re-measure whenever either half of the question can have changed: the width of
 * the box, or the text asked to fit in it.
 *
 * Both are needed. Resizing is the obvious one — the splitter, the window, a
 * webfont arriving. But the box can also keep its size while its contents
 * change, which is the whole of what a live update does to a row: same column,
 * longer name. A ResizeObserver never hears about that.
 */
function watch(node: HTMLElement, measure: () => void) {
	// Fires once on observe, after the first layout: that is the initial reading.
	const ro = new ResizeObserver(measure);
	ro.observe(node);
	// Attributes are deliberately not observed — truncTitle writes one.
	const mo = new MutationObserver(measure);
	mo.observe(node, { subtree: true, childList: true, characterData: true });
	return () => {
		ro.disconnect();
		mo.disconnect();
	};
}

/**
 * Give an element a `title` for as long as its own text is cut off.
 *
 * The element normally speaks for itself. Its `textContent` is put through the
 * same collapse the renderer applies, so an element built from several spans
 * reads back as the one line it draws rather than carrying the markup's
 * newlines and indentation into the tooltip. Pass the text explicitly only where
 * the visible string genuinely isn't the element's own text.
 */
export function truncTitle(node: HTMLElement, text?: string) {
	let full = text;
	const measure = () => {
		const value = (full ?? node.textContent ?? '').replace(/\s+/g, ' ').trim();
		if (value && isCut(node)) node.setAttribute('title', value);
		else node.removeAttribute('title');
	};
	const stop = watch(node, measure);
	return {
		update(next?: string) {
			full = next;
			measure();
		},
		destroy: stop
	};
}

/**
 * Report whether an element's text is cut off, instead of titling it.
 *
 * For text the pointer can't reach: a group header stretches its link across the
 * whole row, so the element under the cursor is that overlay and never the title
 * beneath it, and a `title` there would never show. The caller takes the answer
 * and hangs the tooltip on an ancestor the hover does land on.
 */
export function onTruncated(node: HTMLElement, onchange: (cut: boolean) => void) {
	let cb = onchange;
	let last: boolean | null = null;
	const stop = watch(node, () => {
		const cut = isCut(node);
		if (cut === last) return;
		last = cut;
		cb(cut);
	});
	return {
		update(next: (cut: boolean) => void) {
			cb = next;
		},
		destroy: stop
	};
}
