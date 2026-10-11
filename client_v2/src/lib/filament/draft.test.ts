import { describe, expect, it } from 'vitest';
import { emptyFilamentDraft, filamentDraftFrom, filamentWeightsFrom, toNewFilamentDraft } from './draft';
import { mapFilament } from '$lib/api/map';

describe('filament numeric drafts', () => {
	it.each([
		['', undefined],
		['0', 0],
		['0,5', 0.5],
		['garbage', undefined]
	])('preserves optional numeric input %j as %s', (raw, expected) => {
		const draft = { ...emptyFilamentDraft(), density: '1,24', nozzleTemp: raw, bedTemp: raw };
		const result = toNewFilamentDraft(draft, { weight: '1000,5', spoolWeight: raw, price: raw }, {});
		expect(result).toMatchObject({
			density: 1.24,
			diameter: 1.75,
			weight: 1000.5,
			spoolWeight: expected,
			price: expected,
			nozzleTemp: expected,
			bedTemp: expected
		});
	});

	it('keeps zero values when duplicating a filament', () => {
		const filament = mapFilament({
			id: 1,
			weight: 1000,
			spool_weight: 0,
			price: 0,
			settings_extruder_temp: 0,
			settings_bed_temp: 0
		});
		expect(filamentWeightsFrom(filament)).toEqual({ weight: '1000', spoolWeight: '0', price: '0' });
		expect(filamentDraftFrom(filament, '')).toMatchObject({ nozzleTemp: '0', bedTemp: '0' });
	});
});
