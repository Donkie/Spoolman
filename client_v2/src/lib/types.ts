// Domain types — the camelCase, string-id shapes the components use. The API
// layer (src/lib/api/map.ts) maps the Spoolman REST shape to these. `extra`
// holds custom-field values as JSON-encoded strings keyed by field key.

/** Custom-field values: field key → JSON-encoded string value. */
export type Extra = Record<string, string>;

export interface Vendor {
	id: string;
	name: string;
	/** Empty spool weight in grams. */
	emptyWeight: number;
	comment: string;
	/** SpoolmanDB id if this vendor was imported from the external database. */
	externalId?: string;
	/** Human label for registration date, e.g. "Jan 14". */
	registeredLabel: string;
	extra: Extra;
}

export interface Filament {
	id: string;
	vendorId: string;
	name: string;
	material: string;
	/** One or more hex colors; multiple means a multi-color/gradient swatch. */
	colors: string[];
	diameter: number;
	density: number;
	nozzleTemp: number;
	bedTemp: number;
	/** Net weight of a full spool in grams. */
	weight: number;
	/** Empty spool (tare) weight in grams, if known. */
	spoolWeight?: number;
	price: number;
	/** Manufacturer article/SKU number. */
	articleNumber?: string;
	comment: string;
	/** SpoolmanDB id if this filament was imported from the external database. */
	externalId?: string;
	/** Human label for registration date, e.g. "Jan 14". */
	registeredLabel: string;
	extra: Extra;
}

export interface Spool {
	id: number;
	filamentId: string;
	/** Unused = never drawn from (used_weight is 0), still at full weight. */
	unused: boolean;
	/** Remaining filament weight in grams. */
	remaining: number;
	/** Initial (net) weight in grams. */
	initial: number;
	location: string;
	lot: string;
	/** Per-spool price override; undefined falls back to the filament's price. */
	price?: number;
	/** ISO timestamp of first use, if any. */
	firstUsed?: string;
	/** ISO timestamp of most recent use, if any. */
	lastUsed?: string;
	/** Human label for when it was first used, e.g. "Jan 14". Empty = never. */
	firstUsedLabel: string;
	/** Human label for when it was last used, e.g. "2 d". Empty = never. */
	lastUsedLabel: string;
	/** ISO timestamp of when the spool was registered/added. */
	registered?: string;
	/** Human label for registration date, e.g. "Jan 14". */
	registeredLabel: string;
	archived: boolean;
	comment: string;
	extra: Extra;
}

export type EntityKind = 'spool' | 'filament' | 'vendor';

export interface Selection {
	kind: EntityKind;
	id: string;
}
