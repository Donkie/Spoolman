import type { Filament, Spool, Vendor } from '$lib/types';

// The query/data-source contract. Filtering, sorting, aggregation and
// pagination are the SERVER's job. Two shapes of list:
//   - listGroups(): a page of GROUPS with server-computed aggregates (the list's
//     top-level unit when grouping is on — so groups never split across pages).
//   - listSpools(): a page of spools, either flat (group=none / color search) or
//     scoped to one group (to fill a group's rows lazily).

export type SortDir = 'asc' | 'desc';

export interface SortField {
	/** API field path, e.g. "filament.material", "remaining_weight", "group.total_remaining". */
	field: string;
	dir: SortDir;
}

/** The entity/axis a group is keyed on. */
export type GroupField = 'filament' | 'vendor' | 'material' | 'location';

/** One group returned by listGroups — the header + server aggregates. */
export interface GroupSummary {
	field: GroupField;
	/** Stable key: filament id / vendor id / material name / location name. */
	key: string;
	title: string;
	subtitle: string;
	badge: string;
	colors: string[];
	spoolCount: number;
	inUseCount: number;
	unusedCount: number;
	/** Sum of remaining weight across the group, grams (server aggregate). */
	totalRemaining: number;
	hasStock: boolean;
	lastUsedLabel: string;
	/** Numeric recency for group ordering (higher = more recent). */
	lastUsedSort: number;
}

export interface GroupScope {
	field: GroupField;
	key: string;
}

export interface SpoolQuery {
	/** field path -> allowed values (OR within a field, AND across fields). */
	filters: Record<string, string[]>;
	sort: SortField[];
	/** Restrict to one group's spools (for lazy per-group loading). */
	groupScope?: GroupScope;
	/** Include archived spools in the results (default: excluded). */
	allowArchived?: boolean;
	limit: number;
	offset: number;
	lowThreshold: number;
	/** Cancels the request when the view that asked for it is gone or superseded. */
	signal?: AbortSignal;
}

export interface GroupQuery {
	field: GroupField;
	filters: Record<string, string[]>;
	/** Group-level ordering (by aggregate: group.total_remaining, group.last_used, group.title). */
	sort: SortField[];
	/** Include archived spools in the group aggregates (default: excluded). */
	allowArchived?: boolean;
	limit: number;
	offset: number;
	lowThreshold: number;
	/** Cancels the request when the view that asked for it is gone or superseded. */
	signal?: AbortSignal;
}

export interface Page<T> {
	items: T[];
	/** Total matching rows across all pages (from X-Total-Count). */
	total: number;
}

// --- cross-entity search (GET /search) -----------------------------------

/** One search hit: the matched entity plus which field matched it. */
export interface SearchMatch<T> {
	entity: T;
	/**
	 * Which field matched: a native field name ("name", "comment", "location",
	 * "lot_nr", "material", "article_number"), "id" for an exact spool id, "color"
	 * for a color-similarity match, or "extra.<key>" for an extra field.
	 */
	matchField: string;
}

/** Categorized results of a cross-entity search. */
export interface SearchResults {
	spools: SearchMatch<Spool>[];
	filaments: SearchMatch<Filament>[];
	vendors: SearchMatch<Vendor>[];
	/** True when the query was recognized as a color (a threshold slider is relevant). */
	isColorQuery: boolean;
}

export interface SpoolDataSource {
	listGroups(query: GroupQuery): Promise<Page<GroupSummary>>;
	listSpools(query: SpoolQuery): Promise<Page<Spool>>;
}
