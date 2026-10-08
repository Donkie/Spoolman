import { describe, expect, it } from 'vitest';
import { emptyFilamentDraft, toNewFilamentDraft } from './draft';

describe('new filament tare', () => {
	it.each([
		['0', 0],
		['', undefined],
		['250', 250]
	])('preserves the meaning of the entered tare %s', (input, expected) => {
		const draft = { ...emptyFilamentDraft('PLA'), vendorName: 'Vendor', density: '1.24' };
		const result = toNewFilamentDraft(draft, { weight: '1000', spoolWeight: input as string, price: '' }, {});
		expect(result.spoolWeight).toBe(expected);
	});
});
