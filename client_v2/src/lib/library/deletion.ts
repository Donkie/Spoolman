import { HttpError } from '$lib/api/http';

// Deleting a filament or a manufacturer is the one destructive action in the
// Library, and the two entities behave differently: the API refuses to delete a
// filament that still has spools (403, because the spool→filament FK is not
// nullable), but happily deletes a manufacturer that still has filaments — the
// filaments survive with their vendor cleared, since filament.vendor_id is.
//
// Both rules live here rather than in the inspectors so they're stated once and
// can be tested without a DOM.

/** The API would answer 403. `spools` is why — say so instead of offering a delete. */
export interface FilamentDeleteBlocked {
	allowed: false;
	spools: number;
}

export type FilamentDeletePlan = FilamentDeleteBlocked | { allowed: true };

/**
 * Decide what deleting a filament with `spools` spools would do. Count archived
 * spools too: archiving is a client-side flag, and the foreign key does not care.
 */
export function planFilamentDelete(spools: number): FilamentDeletePlan {
	return spools > 0 ? { allowed: false, spools } : { allowed: true };
}

export interface VendorDeletePlan {
	/** Filaments that survive the delete with their manufacturer cleared. */
	orphaned: number;
}

/** Decide what deleting a manufacturer holding `filaments` filaments would do. */
export function planVendorDelete(filaments: number): VendorDeletePlan {
	return { orphaned: Math.max(filaments, 0) };
}

/** Why a DELETE failed, in the terms the user needs it explained. */
export type DeleteFailure = 'in-use' | 'gone' | 'unknown';

/**
 * Classify a rejected delete. The API's 403 body is a generic "see server logs"
 * string, so the status is all we have to go on — but for these two endpoints a
 * 403 only ever means the row is still referenced.
 */
export function classifyDeleteFailure(e: unknown): DeleteFailure {
	if (e instanceof HttpError) {
		if (e.status === 403 || e.status === 409) return 'in-use';
		if (e.status === 404) return 'gone';
	}
	return 'unknown';
}
