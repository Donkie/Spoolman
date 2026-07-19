// Transient, app-wide status messages ("toasts").
//
// The main consumer is auto-save: the inspectors persist inline edits without
// any explicit Save button, so the toast is the only signal the user gets that
// their change actually landed. Because those edits are debounced and can fire
// repeatedly, identical consecutive messages are *coalesced* — a second "Save
// successful!" refreshes the existing toast's timer instead of stacking a new
// one, which keeps rapid editing from turning into a wall of notifications.

export type ToastKind = 'success' | 'error';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
}

const SUCCESS_MS = 2000;
const ERROR_MS = 6000;
/** Hard cap so a burst of distinct failures can't fill the viewport. */
const MAX_VISIBLE = 3;

class ToastState {
	items = $state<Toast[]>([]);

	#nextId = 1;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	/** Show `message`, or refresh the timer if it's already the newest toast. */
	show(kind: ToastKind, message: string) {
		const ttl = kind === 'error' ? ERROR_MS : SUCCESS_MS;
		const newest = this.items[this.items.length - 1];
		if (newest && newest.kind === kind && newest.message === message) {
			this.#arm(newest.id, ttl);
			return;
		}

		const toast: Toast = { id: this.#nextId++, kind, message };
		this.items = [...this.items, toast].slice(-MAX_VISIBLE);
		this.#arm(toast.id, ttl);
	}

	success(message: string) {
		this.show('success', message);
	}

	error(message: string) {
		this.show('error', message);
	}

	dismiss(id: number) {
		const timer = this.#timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.#timers.delete(id);
		}
		this.items = this.items.filter((t) => t.id !== id);
	}

	#arm(id: number, ttl: number) {
		const existing = this.#timers.get(id);
		if (existing) clearTimeout(existing);
		this.#timers.set(
			id,
			setTimeout(() => this.dismiss(id), ttl)
		);
	}
}

export const toasts = new ToastState();
