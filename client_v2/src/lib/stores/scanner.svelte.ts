import type { TagScan } from '$lib/api/scanRelay';

// Which NFC reader this browser listens to, and whether a scan is allowed to
// navigate it. Per-browser, persisted to localStorage next to the other local
// preferences (theme, list width, collapsed groups) — pairing is a property of
// this screen sitting next to that reader, not of the account or the server, and
// the relay is stateless about it: pooling comes from the socket path alone.

const READER_KEY = 'spoolman-v2-scanner-reader';
const READER_NAME_KEY = 'spoolman-v2-scanner-reader-name';
const AUTO_NAVIGATE_KEY = 'spoolman-v2-scanner-auto-navigate';

function read(key: string): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null; // storage disabled — the browser simply starts unpaired
	}
}

function write(key: string, value: string | null) {
	if (typeof localStorage === 'undefined') return;
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* remembering the pairing is a convenience, not a requirement */
	}
}

/**
 * The routes a scan is allowed to act on: the two that are for browsing an
 * inventory, which is the only place being moved to a spool is what you wanted.
 *
 * Settings and the label designer are work you are in the middle of, and a tag
 * tapped in the next room must not throw it away. Pairing made that concrete —
 * the tap that pairs a reader is delivered to the page listening for it *and* to
 * the auto-navigate subscription, so setting a reader up would immediately
 * navigate away from the screen you set it up on.
 *
 * Route ids rather than pathnames, because a deployment under SPOOLMAN_BASE_PATH
 * prefixes every path and would fail an equality test on "/".
 */
const BROWSABLE_ROUTES = new Set(['/', '/dashboard']);

export function isBrowsableRoute(routeId: string | null | undefined): boolean {
	return routeId != null && BROWSABLE_ROUTES.has(routeId);
}

/**
 * Whether the element holding focus is one a stray navigation would interrupt.
 *
 * The reason this matters is that a tag tapped in the next room fires here with
 * no warning at all. Inline edits write through on change (see utils/autosave),
 * so there is rarely unsaved work to lose — but a field being typed in right now
 * is exactly the case where there is, and where being yanked to another spool
 * costs the user something they cannot get back.
 *
 * `isContentEditable` covers the rich-text case; the tag test covers the rest.
 */
export function isTypingTarget(el: Element | null): boolean {
	if (!el) return false;
	if ((el as HTMLElement).isContentEditable) return true;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

class ScannerState {
	/** The paired reader, or null for "every reader". Null is a working default
	 *  rather than an unconfigured state: most people have exactly one reader, and
	 *  pairing only starts to matter once there are two. */
	pairedReaderId = $state<string | null>(null);
	/** The paired reader's friendly name, remembered so the settings page can name
	 *  it before that reader has scanned again this session. */
	pairedReaderName = $state<string | null>(null);
	/** Whether a scan matching a spool navigates this browser to it. Off by
	 *  default — a page that navigates itself unasked is hostile. */
	autoNavigate = $state(false);

	/**
	 * Outstanding `suppress()` holds. Auto-navigate stands down while any are open.
	 *
	 * Deliberately NOT `$state`: `suppress()` is called from inside an `$effect`
	 * (the tag dialog takes a hold for as long as it is open) and incrementing a
	 * rune there reads it as well as writes it, which makes that effect depend on
	 * its own write and re-run forever. Nothing renders from this counter — it is
	 * read only by `mayNavigate`, from a websocket handler — so plain state is both
	 * correct and the only thing that terminates.
	 */
	#suppressions = 0;

	constructor() {
		this.pairedReaderId = read(READER_KEY);
		this.pairedReaderName = read(READER_NAME_KEY);
		this.autoNavigate = read(AUTO_NAVIGATE_KEY) === 'true';
	}

	/** The pool to subscribe to: the paired reader, or null for all of them. */
	get pool(): string | null {
		return this.pairedReaderId;
	}

	get suppressed(): boolean {
		return this.#suppressions > 0;
	}

	/**
	 * Hold off auto-navigate until the returned function is called. Anything
	 * showing a dialog about tags takes one of these, because a scan is the very
	 * thing it is waiting for and navigating away mid-flow would throw the dialog
	 * out from under the user.
	 *
	 * A counter rather than a flag so overlapping holders can't release each
	 * other's suppression; the shape suits `$effect`, which wants a cleanup
	 * function back.
	 */
	suppress(): () => void {
		this.#suppressions++;
		let released = false;
		return () => {
			if (released) return; // an effect cleanup can run more than once
			released = true;
			this.#suppressions--;
		};
	}

	/** Pair with a reader, remembering its friendly name for display. */
	pair(readerId: string, name?: string) {
		this.pairedReaderId = readerId;
		this.pairedReaderName = name ?? null;
		write(READER_KEY, readerId);
		write(READER_NAME_KEY, name ?? null);
	}

	/** Go back to listening to every reader. */
	unpair() {
		this.pairedReaderId = null;
		this.pairedReaderName = null;
		write(READER_KEY, null);
		write(READER_NAME_KEY, null);
	}

	setAutoNavigate(on: boolean) {
		this.autoNavigate = on;
		write(AUTO_NAVIGATE_KEY, String(on));
	}

	/**
	 * Take note of a scan. Called by every relay subscriber; acting on one is the
	 * caller's business, and only the root layout ever navigates on it.
	 */
	receive(scan: TagScan) {
		// A paired reader that renames itself should not keep showing its old name.
		if (scan.readerId === this.pairedReaderId && scan.name && scan.name !== this.pairedReaderName) {
			this.pairedReaderName = scan.name;
			write(READER_NAME_KEY, scan.name);
		}
	}

	/**
	 * Whether a scan should be allowed to navigate right now. Deliberately not
	 * about the scan itself — an unknown tag has nowhere to navigate to, and the
	 * caller checks that — only about whether this browser is in a state where
	 * being moved is acceptable.
	 */
	mayNavigate(activeElement: Element | null, modalOpen: boolean): boolean {
		if (!this.autoNavigate) return false;
		if (modalOpen || this.suppressed) return false;
		return !isTypingTarget(activeElement);
	}
}

export const scanner = new ScannerState();
