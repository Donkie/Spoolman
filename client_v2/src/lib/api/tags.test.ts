import { describe, expect, it } from 'vitest';
import { asTagConflict, isBadUid } from './tags';
import { HttpError } from './http';

// Linking a tag something else already holds is the one failure the UI has to do
// something with rather than merely report: the 409 carries the id of the spool
// or filament that holds it, which is what lets the dialog offer to move the tag
// instead of making the user go and find it. These read that body.
describe('asTagConflict', () => {
	it('reads the holding spool out of a 409', () => {
		const err = new HttpError('POST /spool/2/tag → 409', 409, {
			message: 'Tag 04A2B3C4 is already linked to spool 1.',
			spool_id: 1,
			filament_id: null
		});
		expect(asTagConflict(err)).toEqual({
			holder: { kind: 'spool', id: 1 },
			message: 'Tag 04A2B3C4 is already linked to spool 1.'
		});
	});

	// Filament ids are strings everywhere else in the client, so the holder's is too.
	it('reads the holding filament out of a 409', () => {
		const err = new HttpError('POST /spool/2/tag → 409', 409, {
			message: 'Tag 04A2B3C4 is already linked to filament 7.',
			spool_id: null,
			filament_id: 7
		});
		expect(asTagConflict(err)).toEqual({
			holder: { kind: 'filament', id: '7' },
			message: 'Tag 04A2B3C4 is already linked to filament 7.'
		});
	});

	it('ignores failures that are not conflicts', () => {
		expect(asTagConflict(new HttpError('POST /spool/2/tag → 404', 404, {}))).toBeNull();
		expect(asTagConflict(new Error('network'))).toBeNull();
	});

	// A 409 we can't act on is worse than no offer: "move it here" with nowhere to
	// move it from would fail on the click. It falls back to an ordinary error.
	it('declines a 409 with no usable holder id', () => {
		expect(asTagConflict(new HttpError('x', 409, { message: 'nope' }))).toBeNull();
		expect(asTagConflict(new HttpError('x', 409, { spool_id: '1' }))).toBeNull();
		expect(asTagConflict(new HttpError('x', 409, { filament_id: '7' }))).toBeNull();
	});
});

// A UID the server won't accept comes back two different ways — 400 from the
// handler for non-hex, 422 from the model for an empty string — and both mean the
// same thing to someone who typed it, so the UI treats them as one case.
describe('isBadUid', () => {
	it('accepts both shapes of "that UID is not usable"', () => {
		expect(isBadUid(new HttpError('x', 400, {}))).toBe(true);
		expect(isBadUid(new HttpError('x', 422, {}))).toBe(true);
	});

	it('leaves other failures alone', () => {
		expect(isBadUid(new HttpError('x', 404, {}))).toBe(false);
		expect(isBadUid(new HttpError('x', 409, {}))).toBe(false);
		expect(isBadUid(new Error('network'))).toBe(false);
	});
});
