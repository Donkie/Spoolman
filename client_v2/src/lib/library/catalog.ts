import type { GroupSummary, SpoolPreview } from '$lib/api/types';

// Pure helpers behind the catalog sub-views' rows: how a page of filament groups
// splits into manufacturer sections, and how a filament's preview spools draw as
// fill pips.

/** A run of filaments sharing one manufacturer, under one section header. */
export interface CatalogSection {
	/** Empty for the filaments with no manufacturer set. */
	vendorId: string;
	vendorName?: string;
	rows: GroupSummary[];
}

/**
 * Split a page of filament groups into manufacturer sections.
 *
 * The page arrives sorted by manufacturer first (group.vendor_name), so a
 * section is simply a run of consecutive rows: no regrouping, and the server's
 * order within a section is kept. A section cut by a page boundary starts the
 * next page under a repeat of its header, which is what tells you whose
 * filaments you are still looking at.
 */
export function catalogSections(groups: GroupSummary[]): CatalogSection[] {
	const sections: CatalogSection[] = [];
	for (const g of groups) {
		const vendorId = g.vendorId ?? '';
		const last = sections.at(-1);
		if (last && last.vendorId === vendorId) last.rows.push(g);
		else sections.push({ vendorId, vendorName: g.vendorName, rows: [g] });
	}
	return sections;
}

export interface Pip {
	/** Share of the spool left, 0–1; null when the spool's size isn't known. */
	fill: number | null;
	low: boolean;
}

/**
 * A pip this nearly empty still shows a sliver, so a spool that is all but
 * gone reads as "almost out" rather than as a blank slot.
 */
export const MIN_PIP_FILL = 0.06;

/** One pip per preview spool, filled by remaining ÷ initial. */
export function spoolPips(spools: SpoolPreview[], lowThreshold: number): Pip[] {
	return spools.map(({ remaining, initial }) => ({
		fill:
			remaining == null || !initial || initial <= 0
				? null
				: Math.max(MIN_PIP_FILL, Math.min(1, remaining / initial)),
		// At or under the threshold, the same line settings.isLow draws everywhere else.
		low: remaining != null && remaining <= lowThreshold
	}));
}
