import { listReaders, type TagScan } from '$lib/api/scanRelay';

// Which NFC reader this browser listens to, and whether a scan is allowed to
// navigate it. Per-browser, persisted to localStorage next to the other local
// preferences (theme, list width, collapsed groups) — pairing is a property of
// this screen sitting next to that reader, not of the account or the server, and
// the relay is stateless about it: pooling comes from the socket path alone.
//
// The reader *id* is what gets persisted, and nothing else about the reader. Its
// friendly name belongs to the reader and is tracked by the server, which keeps
// the last one each reader gave; a copy saved here at pairing time would be a
// second source of truth for something that changes without us. It drifted in
// exactly the way you would expect: the server remembers the name from a reader's
// last named scan, while a scan event carries only the name *that* scan sent, so
// pairing by tapping an agent that had stopped sending its name stored nothing and
// showed the bare id, while the same reader in the recently-seen list still showed
// its name. Names are therefore read, never stored — see `readerLabel`.

const READER_KEY = 'spoolman-v2-scanner-reader';
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
	/** Whether a scan matching a spool navigates this browser to it. Off by
	 *  default — a page that navigates itself unasked is hostile. */
	autoNavigate = $state(false);

	/**
	 * Reader id → the friendly name that reader last gave, from the server's
	 * registry and from scans as they arrive. In memory only: it mirrors state the
	 * server keeps in memory too, and is empty after either end restarts, at which
	 * point nobody knows the name and the id is the honest thing to show.
	 */
	#names = $state<Record<string, string>>({});
	#loadingNames: Promise<void> | null = null;

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
		this.autoNavigate = read(AUTO_NAVIGATE_KEY) === 'true';
	}

	/** The pool to subscribe to: the paired reader, or null for all of them. */
	get pool(): string | null {
		return this.pairedReaderId;
	}

	/**
	 * What to call a reader on screen: the name it last gave, or its id.
	 *
	 * The id is a perfectly good name when there is no better one — an agent that
	 * sends none is given `ip-192-168-1-50`, which at least says which box it is.
	 */
	readerLabel(readerId: string): string {
		return this.#names[readerId] ?? readerId;
	}

	/** What to call the paired reader, or null when listening to all of them. */
	get pairedLabel(): string | null {
		return this.pairedReaderId === null ? null : this.readerLabel(this.pairedReaderId);
	}

	/** Take note of the names in the server's reader registry. */
	learnReaders(readers: { readerId: string; name?: string }[]) {
		for (const reader of readers) {
			if (reader.name) this.#names[reader.readerId] = reader.name;
		}
	}

	/**
	 * Make sure reader names have been fetched at least once this session.
	 *
	 * Anything that displays a reader calls this; the in-flight promise is shared so
	 * a settings page and an open dialog don't both ask. Failure is silent by
	 * design — not knowing a reader's friendly name costs the id being shown, which
	 * is what happens after a server restart anyway.
	 */
	ensureReaderNames(): Promise<void> {
		this.#loadingNames ??= listReaders()
			.then((readers) => this.learnReaders(readers))
			.catch(() => {
				/* the id is a fine label */
			})
			.finally(() => {
				this.#loadingNames = null;
			});
		return this.#loadingNames;
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

	/**
	 * Pair with a reader. A name, if the caller happens to have one, is learned like
	 * any other — not stored alongside the pairing, which is what let the two ways of
	 * pairing disagree about what the same reader was called.
	 */
	pair(readerId: string, name?: string) {
		this.pairedReaderId = readerId;
		if (name) this.#names[readerId] = name;
		write(READER_KEY, readerId);
	}

	/** Go back to listening to every reader. */
	unpair() {
		this.pairedReaderId = null;
		write(READER_KEY, null);
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
		// A scan that names its reader is the freshest word on the subject. One that
		// doesn't says nothing about the name rather than that there isn't one — the
		// server's registry keeps the last name a reader gave for exactly that reason,
		// and blanking it here on a trimmed-down agent's scan would undo that.
		if (scan.name) this.#names[scan.readerId] = scan.name;
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
