import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({ API_BASE: 'http://spoolman.test/api/v1' }));

import { inventory } from '$lib/stores/inventory.svelte';
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

describe('listFilamentPage', () => {
	it.each(['asc', 'desc'] as const)(
		'requests a bounded page in %s order and caches its relations',
		async (dir) => {
			const fetch = vi.fn(async () =>
				Response.json([{ id: 1201, name: 'Page filament', vendor: { id: 1201, name: 'Page vendor' } }], {
					headers: { 'X-Total-Count': '1500' }
				})
			);
			vi.stubGlobal('fetch', fetch);
			const signal = new AbortController().signal;
			const page = await spoolSource.listFilamentPage({
				sort: [{ field: 'id', dir }],
				limit: 100,
				offset: 100,
				signal
			});
			expect(fetch).toHaveBeenCalledExactlyOnceWith(
				`http://spoolman.test/api/v1/filament?sort=id%3A${dir}&limit=100&offset=100`,
				{ signal }
			);
			expect(page.total).toBe(1500);
			expect(page.items.map((f) => f.id)).toEqual(['1201']);
			expect(inventory.filamentById('1201')).toEqual(page.items[0]);
			expect(inventory.vendorById('1201')?.name).toBe('Page vendor');
		}
	);

	it('keeps the preview batch API returning an array', async () => {
		const fetch = vi.fn(async () => Response.json([{ id: 1, name: 'Preview' }]));
		vi.stubGlobal('fetch', fetch);
		expect((await spoolSource.listFilaments(8)).map((f) => f.id)).toEqual(['1']);
		expect(fetch).toHaveBeenCalledExactlyOnceWith(
			'http://spoolman.test/api/v1/filament?sort=id%3Adesc&limit=8&offset=0',
			{ signal: undefined }
		);
	});
});
