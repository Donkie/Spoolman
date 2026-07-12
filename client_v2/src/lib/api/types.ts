import type { Spool } from '$lib/types';

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
	search?: string;
	/** Hex color for similarity ordering (server-side vector search). */
	color?: string;
	/** Restrict to one group's spools (for lazy per-group loading). */
	groupScope?: GroupScope;
	limit: number;
	offset: number;
	lowThreshold: number;
}

export interface GroupQuery {
	field: GroupField;
	filters: Record<string, string[]>;
	search?: string;
	/** Group-level ordering (by aggregate: group.total_remaining, group.last_used, group.title). */
	sort: SortField[];
	limit: number;
	offset: number;
	lowThreshold: number;
}

export interface Page<T> {
	items: T[];
	/** Total matching rows across all pages (from X-Total-Count). */
	total: number;
}

export interface SpoolDataSource {
	listGroups(query: GroupQuery): Promise<Page<GroupSummary>>;
	listSpools(query: SpoolQuery): Promise<Page<Spool>>;
}
