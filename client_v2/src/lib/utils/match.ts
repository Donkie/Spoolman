// Matching for the search boxes that sit at the top of long menus (issue #1045).
//
// These lists are already on screen while the user types, so the match has to be
// one they can see: a plain substring test, never a fuzzy one. A fuzzy match that
// surfaces "Location" for the query "lot" looks like a bug when both entries are
// two rows apart.
//
// Two liberties are taken, both of which only ever widen what an honest substring
// finds. Diacritics fold, so "Anejo" reaches "Añejo" from a keyboard that can't
// type the tilde. And whitespace splits the query into terms that may match in any
// order, because the labels these lists are built from are compounds — a filament
// reads "<manufacturer> <name>", and someone hunting Polymaker's black roll types
// "black poly" as readily as the other way round.

/** Case- and diacritic-insensitive form of a string, for comparison only. */
function fold(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

/**
 * Split a query into the terms every candidate must contain. An empty or
 * whitespace-only query yields no terms, which matches everything.
 */
export function searchTerms(query: string): string[] {
	return fold(query).split(/\s+/).filter(Boolean);
}

/** Whether `text` contains every one of `terms` (as produced by searchTerms). */
export function matchesTerms(text: string, terms: string[]): boolean {
	if (terms.length === 0) return true;
	const haystack = fold(text);
	return terms.every((t) => haystack.includes(t));
}

/**
 * Narrow a list to the items whose label matches `query`. Returns the list
 * untouched when the query is empty, so callers can filter unconditionally.
 */
export function filterByQuery<T>(items: T[], query: string, label: (item: T) => string): T[] {
	const terms = searchTerms(query);
	if (terms.length === 0) return items;
	return items.filter((item) => matchesTerms(label(item), terms));
}
