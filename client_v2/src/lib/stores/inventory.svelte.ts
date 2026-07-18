import type { Filament, Spool, Vendor } from '$lib/types';
import type { LiveEvent } from '$lib/api/live';
import { mapFilament, mapSpool, mapVendor } from '$lib/api/map';

// Reactive, normalized client cache. Populated by HTTP responses (the data
// source upserts every entity it fetches) and kept live by liveSync applying
// WebSocket events. Every detail view reads it reactively, so a change from any
// source updates the UI. It is NOT the source of truth for the paginated list —
// that fetches server-paged data directly.

class Inventory {
	vendors = $state<Vendor[]>([]);
	filaments = $state<Filament[]>([]);
	spools = $state<Spool[]>([]);

	filamentById(id: string): Filament | undefined {
		return this.filaments.find((f) => f.id === id);
	}
	vendorById(id: string): Vendor | undefined {
		return this.vendors.find((v) => v.id === id);
	}
	spoolById(id: number): Spool | undefined {
		return this.spools.find((s) => s.id === id);
	}
	vendorOf(f: Filament): Vendor {
		return (
			this.vendorById(f.vendorId) ?? {
				id: '?',
				name: '?',
				emptyWeight: 0,
				comment: '',
				registeredLabel: '',
				extra: {}
			}
		);
	}
	spoolsOfFilament(filamentId: string): Spool[] {
		return this.spools.filter((s) => s.filamentId === filamentId);
	}
	filamentsOfVendor(vendorId: string): Filament[] {
		return this.filaments.filter((f) => f.vendorId === vendorId);
	}

	// --- upserts (new array refs so $state/$derived recompute) --------------

	upsertSpool(s: Spool) {
		this.spools = this.spools.some((x) => x.id === s.id)
			? this.spools.map((x) => (x.id === s.id ? s : x))
			: [...this.spools, s];
	}
	upsertFilament(f: Filament) {
		this.filaments = this.filaments.some((x) => x.id === f.id)
			? this.filaments.map((x) => (x.id === f.id ? f : x))
			: [...this.filaments, f];
	}
	upsertVendor(v: Vendor) {
		this.vendors = this.vendors.some((x) => x.id === v.id)
			? this.vendors.map((x) => (x.id === v.id ? v : x))
			: [...this.vendors, v];
	}

	upsertSpools(list: Spool[]) {
		for (const s of list) this.upsertSpool(s);
	}
	upsertFilaments(list: Filament[]) {
		for (const f of list) this.upsertFilament(f);
	}
	upsertVendors(list: Vendor[]) {
		for (const v of list) this.upsertVendor(v);
	}

	/** Patch a cached spool in place (optimistic local edit). */
	patchSpool(id: number, patch: Partial<Spool>) {
		const s = this.spoolById(id);
		if (s) this.upsertSpool({ ...s, ...patch });
	}
	patchFilament(id: string, patch: Partial<Filament>) {
		const f = this.filamentById(id);
		if (f) this.upsertFilament({ ...f, ...patch });
	}
	patchVendor(id: string, patch: Partial<Vendor>) {
		const v = this.vendorById(id);
		if (v) this.upsertVendor({ ...v, ...patch });
	}

	// --- live events (raw API payload → cache) ------------------------------

	ingest(event: LiveEvent) {
		const payload = event.payload;
		if (event.resource === 'spool') {
			const id = Number(event.id);
			if (event.type === 'deleted') this.spools = this.spools.filter((s) => s.id !== id);
			else if (payload) {
				this.upsertSpool(mapSpool(payload));
				// Spool payloads embed their filament (+ vendor); keep those fresh too.
				const f = payload.filament as Record<string, unknown> | undefined;
				if (f) {
					this.upsertFilament(mapFilament(f));
					const v = f.vendor as Record<string, unknown> | undefined;
					if (v) this.upsertVendor(mapVendor(v));
				}
			}
		} else if (event.resource === 'filament') {
			const id = String(event.id);
			if (event.type === 'deleted') this.filaments = this.filaments.filter((f) => f.id !== id);
			else if (payload) {
				this.upsertFilament(mapFilament(payload));
				const v = payload.vendor as Record<string, unknown> | undefined;
				if (v) this.upsertVendor(mapVendor(v));
			}
		} else if (event.resource === 'vendor') {
			const id = String(event.id);
			if (event.type === 'deleted') this.vendors = this.vendors.filter((v) => v.id !== id);
			else if (payload) this.upsertVendor(mapVendor(payload));
		}
	}
}

export const inventory = new Inventory();
