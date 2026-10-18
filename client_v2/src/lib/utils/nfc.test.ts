import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTagUid } from './nfc';

let scanSignal: AbortSignal | undefined;
let reading: ((ev: { serialNumber: string }) => void) | undefined;

class FakeReader {
	addEventListener(type: string, cb: (ev: { serialNumber: string }) => void) {
		if (type === 'reading') reading = cb;
	}
	scan({ signal }: { signal: AbortSignal }) {
		scanSignal = signal;
		return Promise.resolve();
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	scanSignal = reading = undefined;
});

describe('readTagUid', () => {
	it('aborts the reader once the first UID arrives', async () => {
		vi.stubGlobal('window', { NDEFReader: FakeReader, isSecureContext: true });
		const caller = new AbortController();
		const promise = readTagUid(caller.signal);
		expect(scanSignal?.aborted).toBe(false);
		reading?.({ serialNumber: '04:aa' });
		await expect(promise).resolves.toBe('04:aa');
		expect(scanSignal?.aborted).toBe(true);
		expect(caller.signal.aborted).toBe(false);
	});

	it('aborts the reader when the caller aborts', async () => {
		vi.stubGlobal('window', { NDEFReader: FakeReader, isSecureContext: true });
		const caller = new AbortController();
		const promise = readTagUid(caller.signal);
		caller.abort();
		await expect(promise).rejects.toBeDefined();
		expect(scanSignal?.aborted).toBe(true);
	});

	it('does not start the reader when the caller already aborted', async () => {
		vi.stubGlobal('window', { NDEFReader: FakeReader, isSecureContext: true });
		const caller = new AbortController();
		caller.abort();
		await expect(readTagUid(caller.signal)).rejects.toBeDefined();
		expect(scanSignal).toBeUndefined();
	});
});
