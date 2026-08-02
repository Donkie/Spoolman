import { describe, expect, it, vi } from 'vitest';
import { makeExtraSaver, makeSaver } from './saver';
import type { Extra, ExtraPatch } from '$lib/types';

// The extra saver is what turns an inspector edit into a PATCH, so these cover the two
// things that are easy to get wrong: clearing a value (which needs an explicit null —
// an absent key means "leave it alone") and a pending patch landing on the entity it
// was made on after the inspector has switched to another one.
function harness(initial: Extra, id = 1) {
	let current: Extra = { ...initial };
	let currentId = id;
	const persisted: { id: number; patch: ExtraPatch }[] = [];
	const saver = makeExtraSaver<number>(
		() => currentId,
		(_id, extra) => {
			current = extra;
		},
		(id, patch) => persisted.push({ id, patch }),
		() => current,
		10
	);
	return {
		saver,
		persisted,
		get current() {
			return current;
		},
		select(next: number, extra: Extra) {
			currentId = next;
			current = { ...extra };
		}
	};
}

describe('makeExtraSaver', () => {
	it('sends only the changed key, since the API merges per key', () => {
		const h = harness({ shelf: '"A"', dry: 'true' });
		h.saver.change('shelf', '"B"');
		h.saver.flush();
		expect(h.persisted).toEqual([{ id: 1, patch: { shelf: '"B"' } }]);
	});

	it('clears an emptied field with an explicit null', () => {
		const h = harness({ shelf: '"A"', dry: 'true' });
		h.saver.change('shelf', undefined);
		h.saver.flush();
		expect(h.persisted).toEqual([{ id: 1, patch: { shelf: null } }]);
		// …and the cache drops the key immediately, so the input renders as unset.
		expect(h.current).toEqual({ dry: 'true' });
	});

	it('coalesces edits to several fields into one patch', () => {
		const h = harness({ shelf: '"A"', dry: 'true' });
		h.saver.change('shelf', '"B"');
		h.saver.change('dry', undefined);
		h.saver.flush();
		expect(h.persisted).toEqual([{ id: 1, patch: { shelf: '"B"', dry: null } }]);
	});

	it('re-setting a cleared field drops the null again', () => {
		const h = harness({ shelf: '"A"' });
		h.saver.change('shelf', undefined);
		h.saver.change('shelf', '"C"');
		h.saver.flush();
		expect(h.persisted).toEqual([{ id: 1, patch: { shelf: '"C"' } }]);
	});

	it('lands a pending patch on the entity it was made on', async () => {
		vi.useFakeTimers();
		try {
			const h = harness({ shelf: '"A"' });
			h.saver.change('shelf', '"B"');
			// The inspector is reused for another spool before the debounce elapses.
			h.select(2, { shelf: '"Z"' });
			vi.advanceTimersByTime(20);
			expect(h.persisted).toEqual([{ id: 1, patch: { shelf: '"B"' } }]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('flushes the previous entity before starting on the next one', () => {
		const h = harness({ shelf: '"A"' });
		h.saver.change('shelf', '"B"');
		h.select(2, { shelf: '"Z"' });
		h.saver.change('shelf', undefined);
		h.saver.flush();
		expect(h.persisted).toEqual([
			{ id: 1, patch: { shelf: '"B"' } },
			{ id: 2, patch: { shelf: null } }
		]);
	});

	it('does nothing when there is nothing pending', () => {
		const h = harness({ shelf: '"A"' });
		h.saver.flush();
		expect(h.persisted).toEqual([]);
	});
});

// Deleting the entity being edited is the one case where a pending patch must NOT
// be sent: the row is on its way out, so the PATCH could only come back 404 and
// toast an error the user can do nothing about.
describe('cancel', () => {
	it('drops a pending extra-field patch, and the unmount flush finds nothing', () => {
		const h = harness({ shelf: '"A"' });
		h.saver.change('shelf', '"B"');
		h.saver.cancel();
		h.saver.flush();
		expect(h.persisted).toEqual([]);
	});

	it('stops the extra-field debounce that was already scheduled', () => {
		vi.useFakeTimers();
		try {
			const h = harness({ shelf: '"A"' });
			h.saver.change('shelf', '"B"');
			h.saver.cancel();
			vi.advanceTimersByTime(100);
			expect(h.persisted).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('drops a pending field patch and stops its debounce', () => {
		vi.useFakeTimers();
		try {
			const saved: { id: number; patch: { name?: string } }[] = [];
			const saver = makeSaver<number, { name: string }>((id, patch) => saved.push({ id, patch }), 10);
			saver.push(1, { name: 'renamed' });
			saver.cancel();
			vi.advanceTimersByTime(100);
			saver.flush();
			expect(saved).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves the saver usable afterwards', () => {
		const saved: { id: number; patch: { name?: string } }[] = [];
		const saver = makeSaver<number, { name: string }>((id, patch) => saved.push({ id, patch }), 10);
		saver.push(1, { name: 'dropped' });
		saver.cancel();
		saver.push(2, { name: 'kept' });
		saver.flush();
		expect(saved).toEqual([{ id: 2, patch: { name: 'kept' } }]);
	});
});
