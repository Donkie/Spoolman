import { describe, expect, it } from 'vitest';
import { migrateTemplate, presetToDesign } from './migrateV1';

// migrateV1 rewrites label templates and print presets that users authored in the
// v1 client. It runs unattended at first load and its output is what they see in
// the designer afterwards, so a silent mistranslation here quietly damages work
// they can't get back. These tests pin the parts that are easy to break: the token
// rewriting table, and the guards that keep a hand-edited preset from producing a
// nonsensical design.

describe('migrateTemplate', () => {
	it('rewrites bare spool paths', () => {
		expect(migrateTemplate('{id}')).toBe('{spool.id}');
		expect(migrateTemplate('{lot_nr}')).toBe('{spool.lot}');
		expect(migrateTemplate('{remaining_weight}')).toBe('{spool.remaining}');
	});

	it('lifts vendor out from under filament', () => {
		expect(migrateTemplate('{filament.vendor.name}')).toBe('{vendor.name}');
		expect(migrateTemplate('{filament.vendor.empty_spool_weight}')).toBe('{vendor.emptyWeight}');
	});

	it('rewrites snake_case filament fields to camelCase', () => {
		expect(migrateTemplate('{filament.settings_extruder_temp}')).toBe('{filament.nozzleTemp}');
		expect(migrateTemplate('{filament.spool_weight}')).toBe('{filament.spoolWeight}');
	});

	// v1's two tare weights are different fields, and a label that printed the
	// spool's own must not silently start printing its filament's (#1013).
	it("keeps the spool's own tare weight apart from its filament's", () => {
		expect(migrateTemplate('{spool_weight}')).toBe('{spool.spoolWeight}');
		expect(migrateTemplate('{filament.spool_weight}')).toBe('{filament.spoolWeight}');
	});

	it('leaves paths that are already identical in both versions', () => {
		for (const t of ['{filament.name}', '{filament.material}', '{filament.density}']) {
			expect(migrateTemplate(t)).toBe(t);
		}
	});

	it('prefixes extra fields, keeping vendor extras distinct from spool extras', () => {
		expect(migrateTemplate('{extra.foo}')).toBe('{spool.extra.foo}');
		expect(migrateTemplate('{filament.vendor.extra.bar}')).toBe('{vendor.extra.bar}');
	});

	it('rewrites paths inside the wrapped {prefix{path}suffix} form', () => {
		expect(migrateTemplate('{Lot Nr: {lot_nr}}')).toBe('{Lot Nr: {spool.lot}}');
		expect(migrateTemplate('{ET: {filament.settings_extruder_temp} °C}')).toBe(
			'{ET: {filament.nozzleTemp} °C}'
		);
	});

	it('rewrites every occurrence, not just the first', () => {
		expect(migrateTemplate('{id} and {id}')).toBe('{spool.id} and {spool.id}');
	});

	it('preserves surrounding literal text and markup', () => {
		expect(migrateTemplate('**{filament.vendor.name} - {filament.name}\n#{id}**')).toBe(
			'**{vendor.name} - {filament.name}\n#{spool.id}**'
		);
	});

	it('leaves a path with no v2 equivalent alone rather than mangling it', () => {
		// These resolve to "?" at render time; the important thing is that migration
		// doesn't turn them into some other valid field.
		expect(migrateTemplate('{remaining_length}')).toBe('{remaining_length}');
		expect(migrateTemplate('{archived}')).toBe('{archived}');
	});

	it('handles an empty template', () => {
		expect(migrateTemplate('')).toBe('');
	});

	it('does not rewrite a v1 path that is only a prefix of a token', () => {
		// `{id}` must not match inside `{identifier}`.
		expect(migrateTemplate('{identifier}')).toBe('{identifier}');
	});
});

describe('presetToDesign', () => {
	it('falls back to the v1 default template when the preset stored none', () => {
		const d = presetToDesign({});
		const text = d.elements.find((e) => e.type === 'text');
		// The default template must arrive already migrated, not in v1 form.
		expect(text?.type === 'text' && text.template).toContain('{vendor.name}');
		expect(text?.type === 'text' && text.template).not.toContain('{filament.vendor.name}');
	});

	it('maps layout fields across essentially 1-1', () => {
		const { layout } = presetToDesign({
			labelSettings: {
				printSettings: {
					margin: { top: 1, bottom: 2, left: 3, right: 4 },
					printerMargin: { top: 5, bottom: 6, left: 7, right: 8 },
					spacing: { horizontal: 9, vertical: 10 },
					columns: 4,
					skipItems: 2,
					itemCopies: 3
				}
			}
		});
		expect(layout.margin).toEqual({ t: 1, b: 2, l: 3, r: 4 });
		expect(layout.safe).toEqual({ t: 5, b: 6, l: 7, r: 8 });
		expect(layout.spacing).toEqual({ h: 9, v: 10 });
		expect(layout.columns).toBe(4);
		expect(layout.skip).toBe(2);
		expect(layout.copies).toBe(3);
	});

	it('carries Tabloid over as a custom sheet since v2 dropped it', () => {
		const { layout } = presetToDesign({
			labelSettings: { printSettings: { paperSize: 'Tabloid' } }
		});
		expect(layout.paper).toBe('custom');
		expect(layout.custom).toEqual({ w: 279, h: 432 });
	});

	it('keeps a known paper size and falls back to A4 for an unknown one', () => {
		expect(presetToDesign({ labelSettings: { printSettings: { paperSize: 'A5' } } }).layout.paper).toBe('A5');
		expect(presetToDesign({ labelSettings: { printSettings: { paperSize: 'B7' } } }).layout.paper).toBe('A4');
	});

	it('folds v1 grid borders into a plain border, and keeps none as none', () => {
		const border = (m: 'none' | 'border' | 'grid') =>
			presetToDesign({ labelSettings: { printSettings: { borderShowMode: m } } }).layout.border;
		expect(border('grid')).toBe('border');
		expect(border('border')).toBe('border');
		expect(border('none')).toBe('none');
	});

	it('clamps a degenerate preset instead of producing a zero or negative canvas', () => {
		// A hand-edited preset with absurd values must still yield a usable label.
		const d = presetToDesign({
			labelSettings: {
				printSettings: { columns: 0, rows: 0, margin: { top: 500, bottom: 500, left: 500, right: 500 } }
			}
		});
		expect(d.label.w).toBeGreaterThan(0);
		expect(d.label.h).toBeGreaterThan(0);
		expect(d.layout.columns).toBeGreaterThanOrEqual(1);
	});

	it('omits the QR element when v1 had the QR turned off', () => {
		const d = presetToDesign({ labelSettings: { showQRCodeMode: 'no' } });
		expect(d.elements.some((e) => e.type === 'qr')).toBe(false);
		expect(d.elements.some((e) => e.type === 'text')).toBe(true);
	});

	it('omits the text element when v1 had content turned off', () => {
		const d = presetToDesign({ labelSettings: { showContent: false } });
		expect(d.elements.some((e) => e.type === 'text')).toBe(false);
		expect(d.elements.some((e) => e.type === 'qr')).toBe(true);
	});

	it('carries the QR logo flag only for the withIcon mode', () => {
		const logo = (mode: 'simple' | 'withIcon') => {
			const qr = presetToDesign({ labelSettings: { showQRCodeMode: mode } }).elements.find(
				(e) => e.type === 'qr'
			);
			return qr?.type === 'qr' && qr.logo;
		};
		expect(logo('withIcon')).toBe(true);
		expect(logo('simple')).toBe(false);
	});

	it('places the text to the right of the QR when both are shown', () => {
		const d = presetToDesign({ labelSettings: { showQRCodeMode: 'simple' } });
		const qr = d.elements.find((e) => e.type === 'qr');
		const text = d.elements.find((e) => e.type === 'text');
		if (qr?.type !== 'qr' || text?.type !== 'text') throw new Error('expected both elements');
		expect(text.x).toBeGreaterThan(qr.x + qr.size - 1);
		expect(text.w).toBeGreaterThan(0);
	});

	it('gives each design a distinct id shared by its elements', () => {
		const a = presetToDesign({});
		const b = presetToDesign({});
		expect(a.id).not.toBe(b.id);
		for (const e of a.elements) expect(e.id.startsWith(a.id)).toBe(true);
	});

	it('names the design from the preset, falling back when the name is blank', () => {
		expect(presetToDesign({ labelSettings: { printSettings: { name: 'Shelf' } } }).name).toBe('Shelf');
		expect(presetToDesign({ labelSettings: { printSettings: { name: '' } } }).name).toBe('Imported label');
	});

	it('always produces a spool design, since v1 only printed spool labels', () => {
		expect(presetToDesign({}).kind).toBe('spool');
	});
});
