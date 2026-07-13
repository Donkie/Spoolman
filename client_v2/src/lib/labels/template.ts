import type { Spool, Filament, Vendor } from '$lib/types';
import type { FieldDef, EntityType } from '$lib/api/fields';

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
	'spool.registered': (b) => b.spool.registeredLabel,
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
	'filament.vendor.name': (b) => b.vendor?.name,

	'vendor.name': (b) => b.vendor?.name
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
 * Render a template to a plain string for the given binding. In "preview" mode
 * (no filament/vendor, or missing values) placeholders resolve to their tags so
 * the designer stays legible before a real spool is bound.
 */
export function resolveTemplate(template: string, b: LabelBinding): string {
	// Match either a bare {path} or a wrapped {prefix{path}suffix}.
	const matches = [...template.matchAll(/{(?:[^}{]|{[^}{]*})*}/gs)];
	let out = template;
	for (const match of matches) {
		const braces = (match[0].match(/{/g) || []).length;
		if (braces === 1) {
			const path = match[0].replace(/[{}]/g, '');
			const value = resolvePath(path, b);
			out = out.replace(match[0], value === MISSING ? '' : value);
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
	labelKey?: string;
	/** ...a literal label for a user-defined extra field (its own name). */
	label?: string;
}
export interface PlaceholderGroup {
	entity: EntityType;
	labelKey: string;
	items: PlaceholderItem[];
}

const FIXED_GROUPS: PlaceholderGroup[] = [
	{
		entity: 'spool',
		labelKey: 'library.section.spool',
		items: [
			{ token: 'spool.id', labelKey: 'spool.fields.id' },
			{ token: 'spool.location', labelKey: 'spool.fields.location' },
			{ token: 'spool.lot', labelKey: 'spool.fields.lot_nr' },
			{ token: 'spool.remaining', labelKey: 'labels.fields.remaining_g' },
			{ token: 'spool.initial', labelKey: 'labels.fields.initial_g' },
			{ token: 'spool.registered', labelKey: 'spool.fields.registered' },
			{ token: 'spool.lastUsed', labelKey: 'spool.fields.last_used' },
			{ token: 'spool.comment', labelKey: 'spool.fields.comment' }
		]
	},
	{
		entity: 'filament',
		labelKey: 'library.section.filament',
		items: [
			{ token: 'filament.name', labelKey: 'filament.fields.name' },
			{ token: 'filament.material', labelKey: 'filament.fields.material' },
			{ token: 'filament.diameter', labelKey: 'labels.fields.diameter_mm' },
			{ token: 'filament.density', labelKey: 'filament.fields.density' },
			{ token: 'filament.weight', labelKey: 'labels.fields.net_weight_g' },
			{ token: 'filament.price', labelKey: 'filament.fields.price' },
			{ token: 'filament.nozzleTemp', labelKey: 'library.sort.nozzle' },
			{ token: 'filament.bedTemp', labelKey: 'labels.fields.bed_temp' },
			{ token: 'filament.color', labelKey: 'inspector.color_hex' }
		]
	},
	{
		entity: 'vendor',
		labelKey: 'labels.fields.group_vendor',
		items: [{ token: 'vendor.name', labelKey: 'vendor.fields.name' }]
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
