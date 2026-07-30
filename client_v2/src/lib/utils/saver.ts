// A debounced, patch-merging saver for inline-editable inspectors. Rapid edits
// (across fields) coalesce into one PATCH; switching entity flushes the pending
// patch first so it lands on the right one.

import type { Extra, ExtraPatch } from '$lib/types';

export interface Saver<Id, Patch> {
	push(id: Id, patch: Patch): void;
	flush(): void;
}

// Extra-field saver: optimistically applies each keystroke to the cache (so the
// input reflects immediately) and debounces a merged PATCH of the changed keys.
//
// The API merges extra per key, so sending only the changed keys is safe — and is what
// keeps two people editing different fields of the same entity from overwriting each
// other. An emptied input (`json === undefined`) travels as an explicit null: that is
// what clears a stored value, whereas a key merely left out means "leave it as it is".
//
// The entity id is captured when the edit is made, so a pending patch always lands on
// the entity that was being edited even if the inspector has since switched to another
// one (the inspector components are reused across selections, not remounted).
export function makeExtraSaver<Id>(
	getId: () => Id,
	apply: (id: Id, extra: Extra) => void,
	persist: (id: Id, patch: ExtraPatch) => void,
	getCurrent: () => Extra,
	delay = 500
): { change: (key: string, json: string | undefined) => void; flush: () => void } {
	let pending: { id: Id; patch: ExtraPatch } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function flush() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (!pending) return;
		const { id, patch } = pending;
		pending = null;
		persist(id, patch);
	}

	function change(key: string, json: string | undefined) {
		const id = getId();
		// A different entity than the pending edits belong to: those go out on their own.
		if (pending && pending.id !== id) flush();
		const extra = { ...getCurrent() };
		if (json === undefined) delete extra[key];
		else extra[key] = json;
		apply(id, extra);
		pending = { id, patch: { ...pending?.patch, [key]: json ?? null } };
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
