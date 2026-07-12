// A debounced, patch-merging saver for inline-editable inspectors. Rapid edits
// (across fields) coalesce into one PATCH; switching entity flushes the pending
// patch first so it lands on the right one.

export interface Saver<Id, Patch> {
	push(id: Id, patch: Patch): void;
	flush(): void;
}

// Extra-field saver: optimistically applies each keystroke to the cache (so the
// input reflects immediately) and debounces a merged PATCH of the changed keys.
// The API merges extra per-key, so sending only the changed keys is safe.
export function makeExtraSaver(
	apply: (extra: Record<string, string>) => void,
	persist: (patch: Record<string, string>) => void,
	getCurrent: () => Record<string, string>,
	delay = 500
): { change: (key: string, json: string | undefined) => void; flush: () => void } {
	let pending: Record<string, string> = {};
	let timer: ReturnType<typeof setTimeout> | null = null;

	function flush() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (Object.keys(pending).length) {
			const patch = pending;
			pending = {};
			persist(patch);
		}
	}

	function change(key: string, json: string | undefined) {
		if (json === undefined) return; // empty input → nothing to persist
		apply({ ...getCurrent(), [key]: json });
		pending[key] = json;
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, delay);
	}

	return { change, flush };
}

export function makeSaver<Id, Patch extends object>(
	save: (id: Id, patch: Patch) => void,
	delay = 500
): Saver<Id, Patch> {
	let currentId: Id | null = null;
	let pending: Partial<Patch> = {};
	let timer: ReturnType<typeof setTimeout> | null = null;

	function flush() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (currentId !== null && Object.keys(pending).length > 0) {
			const patch = pending as Patch;
			pending = {};
			save(currentId, patch);
		}
	}

	function push(id: Id, patch: Patch) {
		if (currentId !== null && currentId !== id) flush();
		currentId = id;
		pending = { ...pending, ...patch };
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, delay);
	}

	return { push, flush };
}
