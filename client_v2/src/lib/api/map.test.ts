import { describe, expect, it } from 'vitest';
import { spoolPatchToApi } from './map';

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
