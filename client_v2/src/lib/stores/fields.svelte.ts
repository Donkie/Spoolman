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
	private loading: Partial<Record<EntityType, Promise<void>>> = {};
	private revisions: Record<EntityType, number> = { spool: 0, filament: 0, vendor: 0 };

	get(entity: EntityType): FieldDef[] {
		return this.defs[entity] ?? [];
	}

	/** Whether this entity's definitions are in hand — an empty list is a real answer. */
	isLoaded(entity: EntityType): boolean {
		return this.loaded.includes(entity);
	}

	/** Load once (idempotent). */
	ensure(entity: EntityType) {
		if (this.loaded.includes(entity) || this.loading[entity]) return;
		const pending = this.load(entity);
		this.loading[entity] = pending;
		void pending.finally(() => {
			if (this.loading[entity] === pending) delete this.loading[entity];
		});
	}

	private async load(entity: EntityType) {
		const revision = this.revisions[entity];
		try {
			const list = await getFields(entity);
			if (revision !== this.revisions[entity]) return;
			this.apply(entity, list);
		} catch (e) {
			console.error(`Failed to load ${entity} fields`, e);
		}
	}

	loadAll() {
		for (const e of ENTITIES) this.ensure(e);
	}

	async save(entity: EntityType, key: string, params: FieldParams) {
		const list = await setField(entity, key, params);
		this.revisions[entity]++;
		this.apply(entity, list);
	}

	async remove(entity: EntityType, key: string) {
		const list = await deleteField(entity, key);
		this.revisions[entity]++;
		this.apply(entity, list);
	}

	private apply(entity: EntityType, list: FieldDef[]) {
		this.defs = { ...this.defs, [entity]: byOrder(list) };
		if (!this.loaded.includes(entity)) this.loaded = [...this.loaded, entity];
	}
}

export const fields = new Fields();
