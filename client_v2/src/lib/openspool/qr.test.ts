import { describe, expect, it } from 'vitest';
import type { Filament, Spool, Vendor } from '$lib/types';
import { buildOpenSpoolProfile, encodeOpenSpoolQr } from './qr';

const spool: Spool = {
	id: 9,
	filamentId: '9',
	unused: false,
	remaining: 657.6884,
	initial: 1000,
	usedWeight: 342.3116,
	location: 'Conjure',
	lot: '',
	firstUsedLabel: '',
	lastUsedLabel: '',
	registeredLabel: '',
	archived: false,
	comment: '',
	tags: [],
	extra: {}
};

const filament: Filament = {
	id: '9',
	vendorId: '3',
	name: 'Silk PLA (Red Blue Green)',
	material: 'PLA',
	colors: ['#ff0000', '#0000ff', '#00ff00'],
	diameter: 1.75,
	density: 1.24,
	nozzleTemp: 230,
	bedTemp: 60,
	weight: 1000,
	price: 0,
	comment: '',
	registeredLabel: '',
	extra: { variant: '"Silk"' }
};

const vendor: Vendor = {
	id: '3',
	name: 'Conjure',
	emptyWeight: 0,
	comment: '',
	registeredLabel: '',
	extra: {}
};

describe('OpenSpool QR', () => {
	it('maps only values available in Spoolman and does not invent minimum temperatures', () => {
		const profile = buildOpenSpoolProfile({ spool, filament, vendor });
		expect(profile).toEqual({
			schema_version: '1',
			brand: 'Conjure',
			name: 'Silk PLA (Red Blue Green)',
			type: 'PLA',
			subtype: 'Silk',
			color_hex: '#FF0000',
			additional_color_hexes: ['#0000FF', '#00FF00'],
			diameter_mm: 1.75,
			nozzle_temp_max_c: 230,
			bed_temp_max_c: 60,
			weight_g: 1000
		});
		expect(profile.nozzle_temp_min_c).toBeUndefined();
		expect(profile.bed_temp_min_c).toBeUndefined();
	});

	it('builds a profile directly from a filament when there is no spool yet', () => {
		const profile = buildOpenSpoolProfile({ filament, vendor });
		expect(profile.weight_g).toBe(1000);
		expect(profile.brand).toBe('Conjure');
		expect(profile.name).toBe('Silk PLA (Red Blue Green)');
	});

	it('uses a verified profile stored in the filament extra field', () => {
		const verified = {
			schema_version: '1',
			brand: 'Conjure',
			name: 'Silk PLA (Red Blue Green)',
			type: 'PLA',
			subtype: 'Silk',
			color_name: 'Red Blue Green',
			color_hex: '#FF0000',
			additional_color_hexes: ['#0000FF', '#00FF00'],
			diameter_mm: 1.75,
			nozzle_temp_min_c: 200,
			nozzle_temp_max_c: 230,
			bed_temp_min_c: 40,
			bed_temp_max_c: 60,
			weight_g: 1000,
			source_url: 'https://example.com/profile'
		};
		const withOverride = {
			...filament,
			extra: { ...filament.extra, openspool_profile: JSON.stringify(JSON.stringify(verified)) }
		};
		expect(buildOpenSpoolProfile({ spool, filament: withOverride, vendor })).toEqual(verified);
	});

	it('encodes compact OpenSpool JSON ready for the NFC record', () => {
		const profile = buildOpenSpoolProfile({ spool, filament, vendor });
		const payload = encodeOpenSpoolQr(profile);
		expect(payload).toBe(JSON.stringify(JSON.parse(payload)));
		expect(JSON.parse(payload)).toEqual({
			protocol: 'openspool',
			version: '1.0',
			brand: 'Conjure',
			type: 'PLA',
			subtype: 'Silk',
			color_hex: '#FF0000',
			additional_color_hexes: ['#0000FF', '#00FF00'],
			max_temp: 230,
			bed_max_temp: 60,
			diameter: 1.75,
			weight: 1000
		});
		expect(payload).not.toContain('schema_version');
		expect(payload).not.toContain('name');
	});

	it('refuses to silently truncate unsupported colors', () => {
		expect(() =>
			buildOpenSpoolProfile({
				spool,
				vendor,
				filament: {
					...filament,
					colors: ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006']
				}
			})
		).toThrow('at most four additional colors');
	});
});
