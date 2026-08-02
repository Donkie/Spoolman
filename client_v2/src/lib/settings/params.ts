import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { EntityType } from '$lib/api/fields';

// Which entity's extra fields the Settings page is showing lives in the URL, so
// the manager can be linked to directly — every inspector's extra-fields section
// points at exactly its own tab ("this is where these come from"), and the link
// still lands somewhere sensible when pasted to someone else.

export const ENTITY_PARAM = 'fields';

/** Anchor on the Settings page's extra-fields section, so links scroll to it. */
export const EXTRA_FIELDS_ANCHOR = 'extra-fields';

const ENTITIES: EntityType[] = ['spool', 'filament', 'vendor'];

/** The entity tab the URL asks for, or null when it doesn't say (or says nonsense). */
export function entityFromUrl(params: URLSearchParams): EntityType | null {
	const v = params.get(ENTITY_PARAM);
	return ENTITIES.find((e) => e === v) ?? null;
}

/** Deep link to `entity`'s extra fields in Settings, scrolled to the manager. */
export function extraFieldsHref(entity: EntityType): string {
	return `${resolve('/settings')}?${ENTITY_PARAM}=${entity}#${EXTRA_FIELDS_ANCHOR}`;
}

/**
 * Point the address bar at `entity`'s tab.
 *
 * A bare `?query` resolves against the current URL, so this is base-path-independent;
 * it also drops any `#extra-fields` we arrived on, which is what we want — switching
 * tabs shouldn't scroll the page back to the section you are already reading.
 */
export function gotoEntity(entity: EntityType): void {
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	void goto(`?${ENTITY_PARAM}=${entity}`, { keepFocus: true, noScroll: true });
}
