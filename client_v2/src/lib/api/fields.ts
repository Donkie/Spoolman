import { getJson, postJson, deleteJson } from './http';

// Extra-field DEFINITIONS (/api/v1/field/{entity_type}). These describe the
// custom fields available on each entity type; values live in each entity's
// `extra` map.

export type EntityType = 'spool' | 'filament' | 'vendor';

export enum FieldType {
	text = 'text',
	integer = 'integer',
	integer_range = 'integer_range',
	float = 'float',
	float_range = 'float_range',
	datetime = 'datetime',
	boolean = 'boolean',
	choice = 'choice'
}

/** Editable definition parameters (POST body). */
export interface FieldParams {
	name: string;
	order: number;
	unit?: string | null;
	field_type: FieldType;
	/** JSON-encoded default value string, or null. */
	default_value?: string | null;
	choices?: string[] | null;
	multi_choice?: boolean | null;
}

export interface FieldDef extends FieldParams {
	key: string;
	entity_type: EntityType;
}

export function getFields(entity: EntityType): Promise<FieldDef[]> {
	return getJson<FieldDef[]>(`/field/${entity}`);
}

/** Create or update a field; returns the full updated list. */
export function setField(entity: EntityType, key: string, params: FieldParams): Promise<FieldDef[]> {
	return postJson<FieldDef[]>(`/field/${entity}/${key}`, params);
}

/** Delete a field; returns the full updated list. */
export function deleteField(entity: EntityType, key: string): Promise<FieldDef[]> {
	return deleteJson<FieldDef[]>(`/field/${entity}/${key}`);
}

export const NUMERIC_FIELD_TYPES = new Set<FieldType>([
	FieldType.integer,
	FieldType.integer_range,
	FieldType.float,
	FieldType.float_range
]);

export const RANGE_FIELD_TYPES = new Set<FieldType>([FieldType.integer_range, FieldType.float_range]);

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
	[FieldType.text]: 'Text',
	[FieldType.integer]: 'Integer',
	[FieldType.integer_range]: 'Integer range',
	[FieldType.float]: 'Float',
	[FieldType.float_range]: 'Float range',
	[FieldType.datetime]: 'Date & time',
	[FieldType.boolean]: 'Boolean',
	[FieldType.choice]: 'Choice'
};
