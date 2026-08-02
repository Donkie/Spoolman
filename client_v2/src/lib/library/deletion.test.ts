import { describe, expect, it } from 'vitest';
import { classifyDeleteFailure, planFilamentDelete, planVendorDelete } from './deletion';
import { HttpError } from '$lib/api/http';

// These cover the two asymmetries behind issue #991: a filament with spools cannot
// be deleted at all, while a manufacturer with filaments can — and silently orphans
// them. The inspectors phrase both from these results, so getting them wrong is the
// difference between an honest dialog and a generic error toast.

describe('planFilamentDelete', () => {
	it('refuses while spools reference the filament, and says how many', () => {
		expect(planFilamentDelete(3)).toEqual({ allowed: false, spools: 3 });
	});

	it('allows the delete once no spools are left', () => {
		expect(planFilamentDelete(0)).toEqual({ allowed: true });
	});

	it('counts a single spool as blocking, not as a rounding error', () => {
		expect(planFilamentDelete(1)).toEqual({ allowed: false, spools: 1 });
	});
});

describe('planVendorDelete', () => {
	it('reports the filaments that will lose their manufacturer', () => {
		expect(planVendorDelete(2)).toEqual({ orphaned: 2 });
	});

	it('reports nothing to orphan for an unused manufacturer', () => {
		expect(planVendorDelete(0)).toEqual({ orphaned: 0 });
	});
});

describe('classifyDeleteFailure', () => {
	it('reads a 403 as "something still references this"', () => {
		expect(classifyDeleteFailure(new HttpError('DELETE /filament/1 → 403', 403))).toBe('in-use');
	});

	it('reads a 404 as "already gone"', () => {
		expect(classifyDeleteFailure(new HttpError('DELETE /vendor/1 → 404', 404))).toBe('gone');
	});

	it('falls back to unknown for a server error', () => {
		expect(classifyDeleteFailure(new HttpError('DELETE /filament/1 → 500', 500))).toBe('unknown');
	});

	it('falls back to unknown for a network failure, which is not an HttpError', () => {
		expect(classifyDeleteFailure(new TypeError('Failed to fetch'))).toBe('unknown');
	});
});
