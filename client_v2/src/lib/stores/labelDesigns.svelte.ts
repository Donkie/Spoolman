import { getDesigns, saveDesigns } from '$lib/api/labelDesigns';
import { newDesign, type LabelDesign } from '$lib/labels/types';

// Reactive, server-backed collection of label designs. Mirrors the pattern in
// settings.svelte.ts: a singleton runes class loaded once, mutations persisted
// to the `label_designs` setting.

function uid(): string {
	return typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID()
		: `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class LabelDesigns {
	designs = $state<LabelDesign[]>([]);
	loaded = $state(false);

	async load(): Promise<void> {
		if (this.loaded) return;
		try {
			this.designs = await getDesigns();
		} catch (e) {
			console.error('Failed to load label designs', e);
		} finally {
			this.loaded = true;
		}
	}

	private async persist(): Promise<void> {
		await saveDesigns($state.snapshot(this.designs) as LabelDesign[]);
	}

	/** Create and persist a fresh design; returns it. */
	async create(): Promise<LabelDesign> {
		const design = newDesign(uid());
		this.designs = [...this.designs, design];
		await this.persist();
		return design;
	}

	/** Insert or replace a design by id, then persist. */
	async save(design: LabelDesign): Promise<void> {
		const idx = this.designs.findIndex((d) => d.id === design.id);
		if (idx === -1) this.designs = [...this.designs, design];
		else this.designs = this.designs.map((d) => (d.id === design.id ? design : d));
		await this.persist();
	}

	/** Duplicate a design under a new id/name; returns the copy. */
	async duplicate(id: string): Promise<LabelDesign | undefined> {
		const src = this.designs.find((d) => d.id === id);
		if (!src) return undefined;
		const copy: LabelDesign = {
			...structuredClone($state.snapshot(src) as LabelDesign),
			id: uid(),
			name: `${src.name} copy`
		};
		this.designs = [...this.designs, copy];
		await this.persist();
		return copy;
	}

	async remove(id: string): Promise<void> {
		this.designs = this.designs.filter((d) => d.id !== id);
		await this.persist();
	}
}

export const labelDesigns = new LabelDesigns();
