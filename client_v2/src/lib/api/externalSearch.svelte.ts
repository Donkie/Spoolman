import { spoolSource } from './spoolSource';
import type { ExternalFilament } from './external';

/** Rows per request. Enough to overflow a picker's result list, so there is something to scroll. */
const PAGE = 20;
/** Distance from the bottom of the result list at which the next page is fetched. */
const SCROLL_MARGIN = 120;

/**
 * The external-catalog half of a filament picker's search (#1136): `search` loads the
 * first page of matches, and scrolling the result list towards its end appends the next.
 * Shared by the add-spools and change-filament dialogs.
 */
export class ExternalSearch {
	items = $state<ExternalFilament[]>([]);
	error = $state(false);
	loadingMore = $state(false);
	#total = 0;
	#query = '';
	#loading = false;
	// Bumped by every new search, so a page that lands after the query changed is dropped.
	#req = 0;
	#ctrl: AbortController | undefined;
	// The result list, remembered from its first scroll event.
	#list: HTMLElement | undefined;

	async search(query: string): Promise<void> {
		const req = this.#restart();
		this.#query = query.trim();
		this.#loading = true;
		this.error = false;
		try {
			const page = await spoolSource.searchExternalFilaments(this.#query, PAGE, 0, this.#ctrl!.signal);
			if (req !== this.#req) return;
			this.items = page.items;
			this.#total = page.total;
			// A new query starts at the top: left scrolled down, the list would fetch
			// its second page straight away.
			this.#list?.scrollTo(0, 0);
		} catch {
			if (req !== this.#req) return;
			this.items = [];
			this.#total = 0;
			this.error = true;
		} finally {
			if (req === this.#req) this.#loading = false;
		}
	}

	async more(): Promise<void> {
		if (this.#loading || this.loadingMore || this.error || this.items.length >= this.#total) return;
		const req = this.#req;
		this.loadingMore = true;
		try {
			const page = await spoolSource.searchExternalFilaments(
				this.#query,
				PAGE,
				this.items.length,
				this.#ctrl!.signal
			);
			if (req !== this.#req) return;
			// A catalog sync between two pages shifts the offsets and can hand back a row
			// that is already listed; a repeated id would break the keyed list.
			const fresh = page.items.filter((f) => !this.items.some((e) => e.id === f.id));
			this.items = [...this.items, ...fresh];
			this.#total = page.total;
		} catch (e) {
			if (req === this.#req) console.error('Failed to load more external filaments', e);
		} finally {
			if (req === this.#req) this.loadingMore = false;
		}
	}

	/** Forget the results, dropping any request still in flight. */
	clear(): void {
		this.#restart();
		this.items = [];
		this.#total = 0;
	}

	/** Scroll handler for the result list. An arrow function so it can be passed as-is. */
	onscroll = (e: Event) => {
		const el = (this.#list = e.currentTarget as HTMLElement);
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_MARGIN) void this.more();
	};

	#restart(): number {
		this.#ctrl?.abort();
		this.#ctrl = new AbortController();
		this.#loading = false;
		this.loadingMore = false;
		return ++this.#req;
	}
}
