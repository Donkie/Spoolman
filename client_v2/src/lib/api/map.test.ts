import { describe, expect, it } from 'vitest';
import { filamentPatchToApi, mapSpool, spoolPatchToApi } from './map';

// The client models a spool's filament as a string id (ids are strings across the
// reactive cache), but PATCH /spool/{id} takes a number and rejects an explicit
// null — see SpoolUpdateParameters.prevent_none in spoolman/api/v1/spool.py. This
// is the seam where reassigning a spool's filament (#1010) is either a valid
// request or a 422, so it gets its own coverage.
describe('spoolPatchToApi — filament', () => {
	it('sends the filament as a numeric filament_id', () => {
		expect(spoolPatchToApi({ filamentId: '42' })).toEqual({ filament_id: 42 });
	});

	it('leaves filament_id out of patches that do not touch the filament', () => {
		expect(spoolPatchToApi({ location: 'Shelf A' })).toEqual({ location: 'Shelf A' });
	});

	it('omits filament_id rather than sending a null the API would reject', () => {
		expect(spoolPatchToApi({ filamentId: undefined })).toEqual({});
		expect(spoolPatchToApi({ filamentId: '' })).toEqual({});
	});

	it('carries the filament alongside other edited fields', () => {
		expect(spoolPatchToApi({ filamentId: '7', comment: 'refilled' })).toEqual({
			filament_id: 7,
			comment: 'refilled'
		});
	});

	// Changing the filament of a spool that recorded its own full weight would
	// otherwise leave it on the old filament's figure, so the dialog offers to send
	// the new one in the same request.
	it('sends an adopted full weight as initial_weight', () => {
		expect(spoolPatchToApi({ filamentId: '7', initial: 750 })).toEqual({
			filament_id: 7,
			initial_weight: 750
		});
	});
});

// A filament's manufacturer is the same kind of link one level up, but with the
// opposite null rule: PATCH /filament/{id} clears the link on an explicit null
// (spoolman/database/filament.py `update`), and that is the only way to put a
// filament back to having no manufacturer. Dropping the key instead would make
// "no manufacturer" silently do nothing.
describe('filamentPatchToApi — manufacturer', () => {
	it('sends the manufacturer as a numeric vendor_id', () => {
		expect(filamentPatchToApi({ vendorId: '42' })).toEqual({ vendor_id: 42 });
	});

	it('leaves vendor_id out of patches that do not touch the manufacturer', () => {
		expect(filamentPatchToApi({ name: 'PolyTerra Sage' })).toEqual({ name: 'PolyTerra Sage' });
	});

	it('clears the manufacturer with an explicit null', () => {
		expect(filamentPatchToApi({ vendorId: '' })).toEqual({ vendor_id: null });
		expect(filamentPatchToApi({ vendorId: undefined })).toEqual({ vendor_id: null });
	});

	it('carries the manufacturer alongside other edited fields', () => {
		expect(filamentPatchToApi({ vendorId: '7', comment: 'rebranded' })).toEqual({
			vendor_id: 7,
			comment: 'rebranded'
		});
	});
});

// Full weight, tare weight and price live on both a spool and its filament, and
// the spool's own value wins. #1013: a spool kept the tare weight it was created
// with while the panel showed the filament's newer one, and neither the value nor
// a way to correct it survived the trip through this layer.
describe('spoolPatchToApi — values a spool can override', () => {
	it('sends a per-spool tare weight as spool_weight', () => {
		expect(spoolPatchToApi({ spoolWeight: 261 })).toEqual({ spool_weight: 261 });
	});

	it('leaves the overridable fields out of patches that do not touch them', () => {
		expect(spoolPatchToApi({ location: 'Shelf A' })).toEqual({ location: 'Shelf A' });
	});

	// A blank field means "go back to following the filament". `undefined` would be
	// dropped by JSON.stringify, leaving the stale value in place — exactly the bug.
	it.each([
		['spoolWeight', 'spool_weight'],
		['initial', 'initial_weight'],
		['price', 'price']
	])('clears %s with an explicit null', (domain, api) => {
		expect(spoolPatchToApi({ [domain]: undefined })).toEqual({ [api]: null });
	});

	it('carries several overrides in one request', () => {
		expect(spoolPatchToApi({ initial: 1000, spoolWeight: 261, price: 24.5 })).toEqual({
			initial_weight: 1000,
			spool_weight: 261,
			price: 24.5
		});
	});
});

describe('mapSpool — inherited vs. own values', () => {
	const api = (spool: Record<string, unknown>) => ({
		id: 1,
		used_weight: 100,
		filament: { id: 9, weight: 1000, spool_weight: 261, price: 20 },
		...spool
	});

	it("keeps the spool's own values distinct from the filament's", () => {
		const s = mapSpool(api({ initial_weight: 750, spool_weight: 132, price: 18 }));
		expect(s.initialOverride).toBe(750);
		expect(s.spoolWeight).toBe(132);
		expect(s.price).toBe(18);
	});

	// The panel has to be able to tell "no value of its own" from "a value that
	// happens to equal the filament's": only the first follows a filament edit.
	it('leaves them undefined when the spool has none, without borrowing the filament’s', () => {
		const s = mapSpool(api({ initial_weight: null, spool_weight: null, price: null }));
		expect(s.initialOverride).toBeUndefined();
		expect(s.spoolWeight).toBeUndefined();
		expect(s.price).toBeUndefined();
		// The effective full weight still falls back, since that is what the gauge shows.
		expect(s.initial).toBe(1000);
	});
});
