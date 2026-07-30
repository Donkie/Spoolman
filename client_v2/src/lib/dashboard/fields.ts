import type { Spool } from '$lib/types';
import type { GroupField } from '$lib/api/types';
import { FieldType, type FieldDef } from '$lib/api/fields';
import { spoolSource } from '$lib/api/spoolSource';
import { inventory } from '$lib/stores/inventory.svelte';
import * as m from '$lib/paraglide/messages';

// The dashboard groups spools into cards by ONE field, and dragging a spool between
// cards writes that field. This module is the list of fields that can play that role,
// and everything the board needs to read and write one without special-casing it.
//
// A field qualifies on two counts. It has to be OWNED BY THE SPOOL, because a drag moves
// exactly one spool and must mean exactly one change — a filament-owned field like material
// would rewrite every other spool of that filament as a side effect of dragging one. And its
// value has to be a short, repeatable string a spool can be *assigned* to, which rules out
// numbers, dates, booleans and multi-choice; the backend rejects grouping on those too (see
// GROUPABLE_EXTRA_FIELD_TYPES).
//
// That leaves the built-in location plus any single-value text or choice field the user has
// added to spools. Lot number is the near miss: spool-owned and short, but stamped on by the
// manufacturer, so dragging a spool into another lot would record something untrue. Both it
// and material are better served by a library filter than by a board.

/** The value a spool has for a field; the empty string is the "unassigned" group. */
export type GroupKey = string;

export interface DashboardField {
	/** Identity: the API's `group_by` value, and the key this field's layout is saved under. */
	key: GroupField;
	label: string;
	/** This spool's current value, '' when unset. */
	valueOf(spool: Spool): GroupKey;
	/** The same spool with `value` applied, for the board's own copies. Pure — no request. */
	withValue(spool: Spool, value: GroupKey): Spool;
	/** Write `value` to the spool, updating the cache first. */
	assign(spool: Spool, value: GroupKey): Promise<void>;
	/**
	 * Rename a whole group, moving every spool in it. Only defined where the backend can
	 * do it in one shot; elsewhere the board only lets empty groups be renamed.
	 */
	rename?(from: GroupKey, to: GroupKey): Promise<void>;
	/** Fixed set of permitted values (single-choice fields); undefined means free text. */
	choices?: string[];
}

const LOCATION: DashboardField = {
	key: 'location',
	get label() {
		return m['spool.fields.location']();
	},
	valueOf: (s) => s.location,
	withValue: (s, value) => ({ ...s, location: value }),
	async assign(spool, value) {
		inventory.patchSpool(spool.id, { location: value });
		await spoolSource.saveSpool(spool.id, { location: value });
	},
	rename: (from, to) => spoolSource.renameLocation(from, to)
};

/**
 * Extra-field values are stored JSON-encoded; the group key is the decoded string.
 * Clearing writes JSON null rather than dropping the key: the API patches the extra map
 * key by key, so an omitted key would leave the old value in place.
 */
function extraField(def: FieldDef): DashboardField {
	const key = `extra.${def.key}` as GroupField;
	const encode = (value: GroupKey) => (value === '' ? 'null' : JSON.stringify(value));
	return {
		key,
		label: def.name,
		valueOf(spool) {
			const raw = spool.extra[def.key];
			if (raw === undefined) return '';
			try {
				const parsed = JSON.parse(raw);
				return typeof parsed === 'string' ? parsed : '';
			} catch {
				return '';
			}
		},
		withValue: (spool, value) => ({ ...spool, extra: { ...spool.extra, [def.key]: encode(value) } }),
		async assign(spool, value) {
			const extra = { [def.key]: encode(value) };
			inventory.patchSpool(spool.id, { extra: { ...spool.extra, ...extra } });
			await spoolSource.saveSpool(spool.id, { extra });
		},
		choices: def.field_type === FieldType.choice ? (def.choices ?? []) : undefined
	};
}

/** Spool extra fields that hold one plain string, and so can be grouped and dragged into. */
function isGroupable(def: FieldDef): boolean {
	if (def.field_type === FieldType.text) return true;
	return def.field_type === FieldType.choice && !def.multi_choice;
}

/**
 * Every field the dashboard can group by, in menu order: location (the default view) first,
 * then the user's own spool fields. A site with no custom spool fields therefore has exactly
 * one view — the location board — until it defines one.
 */
export function dashboardFields(spoolFieldDefs: FieldDef[]): DashboardField[] {
	return [LOCATION, ...spoolFieldDefs.filter(isGroupable).map(extraField)];
}

export const DEFAULT_FIELD_KEY: GroupField = 'location';
