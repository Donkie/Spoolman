import { describe, it, expect } from 'vitest';
import { qrContent } from './qr';
import type { QrElement } from './types';
import type { LabelBinding } from './template';

const qr = (urlTemplate: string): QrElement => ({
	id: 'q',
	type: 'qr',
	x: 0,
	y: 0,
	size: 10,
	ec: 'H',
	encoding: 'custom',
	urlTemplate,
	logo: false
});

describe('qrContent custom template', () => {
	const binding = { spool: { id: 7, lot: 'L1' }, filament: { id: 42 } } as unknown as LabelBinding;

	it('resolves label fields so a spool label can link to its filament (#1152)', () => {
		const el = qr('http://host/filament/show/{filament.id}?spool={id}&lot={spool.lot}');
		expect(qrContent(el, 7, { baseUrl: '' }, binding)).toBe('http://host/filament/show/42?spool=7&lot=L1');
	});

	it('still substitutes {id} without a binding', () => {
		expect(qrContent(qr('x/{id}'), 7, { baseUrl: '' })).toBe('x/7');
	});
});
