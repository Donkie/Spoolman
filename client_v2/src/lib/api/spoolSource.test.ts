import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({ API_BASE: 'http://spoolman.test/api/v1' }));

import { spoolSource } from './spoolSource';

// GET /location only knows locations that hold a spool, so an idle toolhead set up
// as a dashboard card could not be picked for a spool (#1261).

const setting = (value: unknown) => ({ value: JSON.stringify(value), is_set: true, type: 'object' });

function serve(locations: string[], settings: Record<string, unknown> | null) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			if (url.endsWith('/location')) return Response.json(locations);
			if (settings === null) return new Response('{}', { status: 500 });
			return Response.json(settings);
		})
	);
}

afterEach(() => vi.unstubAllGlobals());

describe('locationChoices', () => {
	it('adds the empty locations kept as dashboard cards', async () => {
		serve(['Shelf', 'Printer 1'], {
			dashboard_groups: setting({ location: ['Toolhead 1', 'Shelf', ''], material: ['PLA'] })
		});
		expect(await spoolSource.locationChoices()).toEqual(['Printer 1', 'Shelf', 'Toolhead 1']);
	});

	it("reads the old client's saved locations when the dashboard has none", async () => {
		serve(['Shelf'], { locations: setting(['Toolhead 2']) });
		expect(await spoolSource.locationChoices()).toEqual(['Shelf', 'Toolhead 2']);
	});

	it('still offers the locations in use when settings fail to load', async () => {
		serve(['Shelf'], null);
		expect(await spoolSource.locationChoices()).toEqual(['Shelf']);
	});
});

describe('importExternalFilament', () => {
	const ext = {
		id: 'Prusa_PLA',
		manufacturer: 'Prusa',
		name: 'PLA',
		material: 'PLA',
		density: 1.24,
		diameter: 1.75,
		weight: 1000
	};
	type ApiVendor = { id: number; name: string; external_id?: string };

	function serveImport(vendors: ApiVendor[], filamentIds: string[] = []) {
		const fetch = vi.fn(async (url: string, init?: RequestInit) => {
			const parsed = new URL(url);
			const resource = parsed.pathname.split('/').pop();
			if (init?.method === 'POST') {
				const body = JSON.parse(init.body as string);
				if (resource === 'vendor') {
					const vendor = { id: 100, ...body };
					vendors.push(vendor);
					return Response.json(vendor);
				}
				return Response.json({ id: 200, ...body, vendor: vendors.find((v) => v.id === body.vendor_id) });
			}
			const rows =
				resource === 'vendor' ? vendors : filamentIds.map((external_id, i) => ({ id: i + 1, external_id }));
			const term = parsed.searchParams.get('external_id');
			if (term === null) return Response.json(rows);
			return Response.json(
				rows.filter((row) =>
					term.startsWith('"') && term.endsWith('"')
						? row.external_id === term.slice(1, -1)
						: row.external_id?.toLowerCase().includes(term.toLowerCase())
				)
			);
		});
		vi.stubGlobal('fetch', fetch);
		return fetch;
	}

	it('reuses a hand-made vendor with the same name in different case without editing it', async () => {
		const vendor = { id: 10, name: 'pRUSA' };
		const fetch = serveImport([vendor]);
		expect((await spoolSource.importExternalFilament(ext)).vendorId).toBe('10');
		expect(vendor).toEqual({ id: 10, name: 'pRUSA' });
		expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
		expect(fetch.mock.calls.every(([, init]) => !['PATCH', 'PUT'].includes(init?.method ?? ''))).toBe(true);
	});

	it('prefers an exact external_id over a matching name', async () => {
		const fetch = serveImport([
			{ id: 10, name: 'Prusa' },
			{ id: 20, name: 'Renamed manufacturer', external_id: 'Prusa' }
		]);
		expect((await spoolSource.importExternalFilament(ext)).vendorId).toBe('20');
		expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('external_id'))).toEqual([
			'"Prusa_PLA"',
			'"Prusa"',
			null
		]);
	});

	it('does not reuse substring external_ids for vendors or filaments', async () => {
		const vendors = [{ id: 10, name: 'Prusament', external_id: 'Prusament' }];
		const fetch = serveImport(vendors, ['Prusa_PLA_Plus']);
		const imported = await spoolSource.importExternalFilament(ext);
		expect(imported.id).toBe('200');
		expect(imported.vendorId).toBe('100');
		expect(vendors[1]).toEqual({ id: 100, name: 'Prusa', external_id: 'Prusa' });
		expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
	});

	it('returns an already imported filament without creating anything', async () => {
		const fetch = serveImport([], [ext.id]);
		expect((await spoolSource.importExternalFilament(ext)).id).toBe('1');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(new URL(fetch.mock.calls[0][0]).searchParams.get('external_id')).toBe('"Prusa_PLA"');
	});
});

describe('createFilament', () => {
	it.each([undefined, 0, 0.5])('sends optional numeric values unchanged: %s', async (value) => {
		const fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string);
			expect(body.spool_weight).toBe(value);
			expect(body.price).toBe(value);
			expect(body.settings_extruder_temp).toBe(value);
			expect(body.settings_bed_temp).toBe(value);
			return Response.json({ id: 1, ...body });
		});
		vi.stubGlobal('fetch', fetch);
		await spoolSource.createFilament({
			name: 'Test',
			vendorName: '',
			material: 'PLA',
			density: 1.24,
			diameter: 1.75,
			colors: [],
			spoolWeight: value,
			price: value,
			nozzleTemp: value,
			bedTemp: value
		});
		expect(fetch).toHaveBeenCalledOnce();
	});
});
