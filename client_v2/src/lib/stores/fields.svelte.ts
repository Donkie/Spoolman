import {
	getFields,
	setField,
	deleteField,
	type EntityType,
	type FieldDef,
	type FieldParams
} from '$lib/api/fields';

// Reactive cache of extra-field definitions per entity type. Loaded on demand
// (inspectors) and by the settings manager; refetched after mutations.

const ENTITIES: EntityType[] = ['spool', 'filament', 'vendor'];

function byOrder(list: FieldDef[]): FieldDef[] {
	return [...list].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

class Fields {
	private defs = $state<Record<EntityType, FieldDef[]>>({ spool: [], filament: [], vendor: [] });
	// Reactive so views can wait for the definitions rather than render against an
	// empty list and then rearrange themselves once they arrive.
	private loaded = $state<EntityType[]>([]);

	get(entity: EntityType): FieldDef[] {
		return this.defs[entity] ?? [];
	}

	/** Whether this entity's definitions are in hand — an empty list is a real answer. */
	isLoaded(entity: EntityType): boolean {
		return this.loaded.includes(entity);
	}

	/** Load once (idempotent). */
	ensure(entity: EntityType) {
		if (!this.loaded.includes(entity)) void this.load(entity);
	}

	async load(entity: EntityType) {
		try {
			const list = await getFields(entity);
			this.defs = { ...this.defs, [entity]: byOrder(list) };
			if (!this.loaded.includes(entity)) this.loaded = [...this.loaded, entity];
		} catch (e) {
			console.error(`Failed to load ${entity} fields`, e);
		}
	}

	loadAll() {
		for (const e of ENTITIES) void this.load(e);
	}

	async save(entity: EntityType, key: string, params: FieldParams) {
		const list = await setField(entity, key, params);
		this.defs = { ...this.defs, [entity]: byOrder(list) };
	}

	async remove(entity: EntityType, key: string) {
		const list = await deleteField(entity, key);
		this.defs = { ...this.defs, [entity]: byOrder(list) };
	}
}

export const fields = new Fields();
