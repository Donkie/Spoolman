/**
 * Reparent an element to `document.body` for the lifetime of the action.
 *
 * Popovers here are `position: fixed` and anchored to their trigger's
 * `getBoundingClientRect()` (viewport coordinates). That only works when the
 * fixed element resolves against the viewport. Any ancestor with a `transform`,
 * `filter`, `perspective`, or `container-type`/`contain: layout` becomes the
 * containing block for fixed descendants instead, shifting the popover by that
 * ancestor's offset. The library inspector hits this twice on mobile: the
 * bottom-sheet (`transform: translateY`) and the `.insp` panel
 * (`container-type: inline-size`) both establish such a block, which is what
 * dropped the location dropdown "much further below" its field.
 *
 * Moving the node under `<body>` (which has neither) restores viewport-relative
 * anchoring regardless of the trigger's surroundings.
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
