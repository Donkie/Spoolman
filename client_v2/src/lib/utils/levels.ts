import type { Level } from '$lib/api/auth';
import * as m from '$lib/paraglide/messages';

// Permission levels, for the interface. The ranking mirrors spoolman/auth/levels.py,
// and is duplicated here rather than fetched because a client that has to ask the
// server what "edit" outranks cannot render a form until it has.

export const LEVELS: Level[] = ['read', 'edit', 'manage'];

const RANKS: Record<Level, number> = { read: 0, edit: 1, manage: 2 };

export function levelLabel(level: Level): string {
	switch (level) {
		case 'read':
			return m['level.read']();
		case 'edit':
			return m['level.edit']();
		case 'manage':
			return m['level.manage']();
	}
}

export function levelDescription(level: Level): string {
	switch (level) {
		case 'read':
			return m['level.readDesc']();
		case 'edit':
			return m['level.editDesc']();
		case 'manage':
			return m['level.manageDesc']();
	}
}

/** True when `actual` is at least as permissive as `required`. */
export function levelCovers(actual: Level, required: Level): boolean {
	return RANKS[actual] >= RANKS[required];
}

/** The levels a holder of `own` may grant — never above themselves, as the server enforces. */
export function grantableLevels(own: Level): Level[] {
	return LEVELS.filter((level) => levelCovers(own, level));
}
