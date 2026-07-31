import { describe, it, expect } from 'vitest';
import {
	newDesign,
	setDesignKind,
	DEFAULT_SPOOL_TEXT,
	DEFAULT_FILAMENT_TEXT,
	type LabelDesign,
	type TextElement
} from './types';

function templates(d: LabelDesign): string[] {
	return d.elements.filter((e): e is TextElement => e.type === 'text').map((e) => e.template);
}

describe('setDesignKind', () => {
	it('retargets the default id line of a fresh design', () => {
		const d = newDesign('x');
		setDesignKind(d, 'filament');
		expect(d.kind).toBe('filament');
		expect(templates(d)).toContain(DEFAULT_FILAMENT_TEXT);
		expect(templates(d)).not.toContain(DEFAULT_SPOOL_TEXT);

		setDesignKind(d, 'spool');
		expect(templates(d)).toContain(DEFAULT_SPOOL_TEXT);
	});

	it('retargets the pre-redesign default too', () => {
		const legacy = '**{filament.name}**\n{filament.material}\n#{spool.id}';
		const d = newDesign('x');
		d.elements = [{ ...(d.elements[1] as TextElement), template: legacy }];
		setDesignKind(d, 'filament');
		expect(templates(d)).toEqual(['**{filament.name}**\n{filament.material}\n#{filament.id}']);
	});

	it('leaves user-edited templates alone', () => {
		const d = newDesign('x');
		d.elements = [{ ...(d.elements[1] as TextElement), template: 'my own #{spool.id}' }];
		setDesignKind(d, 'filament');
		expect(templates(d)).toEqual(['my own #{spool.id}']);
	});
});
