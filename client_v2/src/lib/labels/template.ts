import type { Spool, Filament, Vendor } from '$lib/types';
import type { FieldDef, EntityType } from '$lib/api/fields';
import * as m from '$lib/paraglide/messages';

// Resolves `{placeholder}` templates against a spool and its filament/vendor.
// Ported from v1's renderLabelContents (client/src/pages/printing/printing.tsx)
// but resolving the v2 camelCase domain types instead of the raw API JSON.
//
// Supported syntax:
//   {path}                       → the value, or "?" if missing
//   {prefix{path}suffix}         → whole block dropped when the value is missing
//   {entity.extra.<key>}         → a custom (extra) field value
//   \n                           → line break (honored by Konva.Text)
//   **bold**                     → markers stripped (block-level bold is a text
//                                  element property; inline bold isn't rendered)

export interface LabelBinding {
	spool: Spool;
	filament?: Filament;
	vendor?: Vendor;
}

/** Sentinel returned for an absent value; drives conditional-block omission. */
const MISSING = '?';

function fmtNum(n: number | undefined | null): string | null {
	if (n === undefined || n === null || Number.isNaN(n)) return null;
	return String(Math.round(n * 100) / 100);
}

/** Curated fixed-field resolvers keyed by placeholder path. */
const RESOLVERS: Record<string, (b: LabelBinding) => string | number | null | undefined> = {
	'spool.id': (b) => b.spool.id,
	'spool.location': (b) => b.spool.location,
	'spool.lot': (b) => b.spool.lot,
	'spool.comment': (b) => b.spool.comment,
	'spool.remaining': (b) => fmtNum(b.spool.remaining),
	'spool.initial': (b) => fmtNum(b.spool.initial),
	'spool.used': (b) => fmtNum(b.spool.initial - b.spool.remaining),
	'spool.price': (b) => fmtNum(b.spool.price ?? b.filament?.price),
	'spool.registered': (b) => b.spool.registeredLabel,
	'spool.firstUsed': (b) => b.spool.firstUsedLabel,
	'spool.lastUsed': (b) => b.spool.lastUsedLabel,

	'filament.name': (b) => b.filament?.name,
	'filament.material': (b) => b.filament?.material,
	'filament.diameter': (b) => fmtNum(b.filament?.diameter),
	'filament.density': (b) => fmtNum(b.filament?.density),
	'filament.weight': (b) => fmtNum(b.filament?.weight),
	'filament.spoolWeight': (b) => fmtNum(b.filament?.spoolWeight),
	'filament.price': (b) => fmtNum(b.filament?.price ?? undefined),
	'filament.nozzleTemp': (b) => fmtNum(b.filament?.nozzleTemp),
	'filament.bedTemp': (b) => fmtNum(b.filament?.bedTemp),
	'filament.color': (b) => b.filament?.colors[0],
	'filament.articleNumber': (b) => b.filament?.articleNumber,
	'filament.comment': (b) => b.filament?.comment,
	'filament.externalId': (b) => b.filament?.externalId,
	'filament.registered': (b) => b.filament?.registeredLabel,
	// Vendor fields are reachable both nested under filament (v1 style) and directly.
	'filament.vendor.name': (b) => b.vendor?.name,

	'vendor.name': (b) => b.vendor?.name,
	'vendor.emptyWeight': (b) => fmtNum(b.vendor?.emptyWeight),
	'vendor.comment': (b) => b.vendor?.comment,
	'vendor.externalId': (b) => b.vendor?.externalId,
	'vendor.registered': (b) => b.vendor?.registeredLabel
};

/** Resolve a single placeholder path to a display string, or MISSING. */
function resolvePath(path: string, b: LabelBinding): string {
	// entity.extra.<key>
	const extraMatch = path.match(/^(spool|filament|vendor)\.extra\.(.+)$/);
	if (extraMatch) {
		const [, entity, key] = extraMatch;
		const src = entity === 'spool' ? b.spool : entity === 'filament' ? b.filament : b.vendor;
		const raw = src?.extra?.[key];
		if (raw === undefined) return MISSING;
		try {
			const parsed = JSON.parse(raw);
			return parsed === null || parsed === '' ? MISSING : String(parsed);
		} catch {
			return raw || MISSING;
		}
	}

	const resolver = RESOLVERS[path];
	if (!resolver) return MISSING;
	const value = resolver(b);
	if (value === undefined || value === null || value === '') return MISSING;
	return String(value);
}

/**
 * Render a template to a plain string for the given binding. A bare `{path}`
 * whose value is missing resolves to "?"; only the wrapped `{prefix{path}suffix}`
 * form drops its whole block when the value is missing.
 */
export function resolveTemplate(template: string, b: LabelBinding): string {
	// Match either a bare {path} or a wrapped {prefix{path}suffix}.
	const matches = [...template.matchAll(/{(?:[^}{]|{[^}{]*})*}/gs)];
	let out = template;
	for (const match of matches) {
		const braces = (match[0].match(/{/g) || []).length;
		if (braces === 1) {
			const path = match[0].replace(/[{}]/g, '');
			// A bare placeholder keeps the "?" sentinel when the value is missing;
			// only the wrapped form below drops its block. Matches v1's renderLabelContents.
			const value = resolvePath(path, b);
			out = out.replace(match[0], value);
		} else if (braces === 2) {
			const structure = match[0].match(/{(.*?){(.*?)}(.*?)}/s);
			if (structure) {
				const value = resolvePath(structure[2], b);
				out = out.replace(match[0], value === MISSING ? '' : structure[1] + value + structure[3]);
			}
		}
	}
	// Inline bold markers aren't rendered on the canvas; strip them.
	return out.replace(/\*\*(.*?)\*\*/gs, '$1');
}

// --- Placeholder catalog (for the designer's field palette) ----------------

export interface PlaceholderItem {
	/** The token inserted into the template, without braces. */
	token: string;
	/** i18n key for a fixed field, or... */
	labelKey?: () => string;
	/** ...a literal label for a user-defined extra field (its own name). */
	label?: string;
}
export interface PlaceholderGroup {
	entity: EntityType;
	labelKey: () => string;
	items: PlaceholderItem[];
}

const FIXED_GROUPS: PlaceholderGroup[] = [
	{
		entity: 'spool',
		labelKey: m['library.section.spool'],
		items: [
			{ token: 'spool.id', labelKey: m['spool.fields.id'] },
			{ token: 'spool.location', labelKey: m['spool.fields.location'] },
			{ token: 'spool.lot', labelKey: m['spool.fields.lotNr'] },
			{ token: 'spool.remaining', labelKey: m['labels.fields.remainingG'] },
			{ token: 'spool.initial', labelKey: m['labels.fields.initialG'] },
			{ token: 'spool.used', labelKey: m['spool.fields.usedWeight'] },
			{ token: 'spool.price', labelKey: m['spool.fields.price'] },
			{ token: 'spool.registered', labelKey: m['spool.fields.registered'] },
			{ token: 'spool.firstUsed', labelKey: m['spool.fields.firstUsed'] },
			{ token: 'spool.lastUsed', labelKey: m['spool.fields.lastUsed'] },
			{ token: 'spool.comment', labelKey: m['spool.fields.comment'] }
		]
	},
	{
		entity: 'filament',
		labelKey: m['library.section.filament'],
		items: [
			{ token: 'filament.name', labelKey: m['filament.fields.name'] },
			{ token: 'filament.material', labelKey: m['filament.fields.material'] },
			{ token: 'filament.diameter', labelKey: m['labels.fields.diameterMm'] },
			{ token: 'filament.density', labelKey: m['filament.fields.density'] },
			{ token: 'filament.weight', labelKey: m['labels.fields.netWeightG'] },
			{ token: 'filament.price', labelKey: m['filament.fields.price'] },
			{ token: 'filament.nozzleTemp', labelKey: m['library.sort.nozzle'] },
			{ token: 'filament.bedTemp', labelKey: m['labels.fields.bedTemp'] },
			{ token: 'filament.color', labelKey: m['inspector.colorHex'] },
			{ token: 'filament.articleNumber', labelKey: m['filament.fields.articleNumber'] },
			{ token: 'filament.externalId', labelKey: m['filament.fields.externalId'] },
			{ token: 'filament.registered', labelKey: m['filament.fields.registered'] },
			{ token: 'filament.comment', labelKey: m['filament.fields.comment'] }
		]
	},
	{
		entity: 'vendor',
		labelKey: m['labels.fields.groupVendor'],
		items: [
			{ token: 'vendor.name', labelKey: m['vendor.fields.name'] },
			{ token: 'vendor.emptyWeight', labelKey: m['vendor.fields.emptySpoolWeight'] },
			{ token: 'vendor.externalId', labelKey: m['vendor.fields.externalId'] },
			{ token: 'vendor.registered', labelKey: m['vendor.fields.registered'] },
			{ token: 'vendor.comment', labelKey: m['vendor.fields.comment'] }
		]
	}
];

/**
 * Build the palette groups, merging in extra-field definitions per entity.
 * `extraFields` maps each entity type to its FieldDef list (from the fields store).
 * Fixed items carry an i18n `labelKey`; extra items carry a literal `label` (the
 * user-defined field's own name).
 */
export function getPlaceholderGroups(extraFields: Record<EntityType, FieldDef[]>): PlaceholderGroup[] {
	return FIXED_GROUPS.map((group) => {
		const extra = (extraFields[group.entity] ?? []).map((f) => ({
			token: `${group.entity}.extra.${f.key}`,
			label: f.name
		}));
		return { ...group, items: [...group.items, ...extra] };
	});
}
