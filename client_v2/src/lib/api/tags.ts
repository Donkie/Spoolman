import type { Spool, SpoolTag } from '$lib/types';
import { getList, postJson, deleteResource, HttpError } from './http';
import { mapSpool, mapFilament, mapVendor } from './map';
import { inventory } from '$lib/stores/inventory.svelte';

// Linking physical NFC/RFID tags to spools.
//
// A tag belongs to exactly one spool and is keyed by its hardware UID, which the
// server normalizes: `04:a2:b3`, `04-A2-B3` and `04a2b3` are one tag. Nothing
// here normalizes anything itself — the canonical spelling comes back in the
// response, and rendering that rather than what was typed is what keeps the UI
// honest about which tag was actually touched.
//
// Neither link nor unlink updates the cache. Both emit the ordinary spool
// `updated` event, so liveSync ingests the new tag list and every open inspector
// re-renders on its own; patching local state here as well would just race it.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

/**
 * Tag formats the server knows the name of (`spoolman/tags.py`). Informational
 * and not enforced — new tag types appear faster than releases do — so this is a
 * vocabulary to spell the common ones consistently, never a validation list.
 */
export const KNOWN_FORMATS = [
	'openprinttag',
	'opentag3d',
	'ntag',
	'bambu',
	'tigertag',
	'qidi',
	'creality',
	'prusa'
] as const;

/**
 * The spool that already holds a UID, carried by the 409 from `linkTag`. It is
 * on the error body so the UI can offer to move the tag without looking it up.
 */
export interface TagConflict {
	spoolId: number;
	message: string;
}

/**
 * Read a 409 from `linkTag` as the conflict it describes, or null for any other
 * failure. A 409 without a usable `spool_id` counts as "not a conflict we can
 * act on" and falls back to being reported as an ordinary error.
 */
export function asTagConflict(err: unknown): TagConflict | null {
	if (!(err instanceof HttpError) || err.status !== 409) return null;
	const spoolId = err.body?.spool_id;
	if (typeof spoolId !== 'number') return null;
	return {
		spoolId,
		message: typeof err.body?.message === 'string' ? err.body.message : err.message
	};
}

/**
 * True when a failure means the UID itself was unusable rather than the request
 * being wrong about anything else. The server answers a non-hex UID with 400 and
 * an empty one with 422 (it fails `min_length` before the handler sees it); both
 * mean the same thing to a user who typed it, so they read as one case.
 */
export function isBadUid(err: unknown): boolean {
	return err instanceof HttpError && (err.status === 400 || err.status === 422);
}

/**
 * Link a tag to a spool. Re-linking a UID the spool already holds succeeds and
 * changes nothing (passing a `format` refines the stored one), so this is safe
 * to call without checking first.
 *
 * Rejects with a 409 when another spool holds the UID — see `asTagConflict`.
 */
export async function linkTag(spoolId: number, uid: string, format?: string): Promise<SpoolTag> {
	const body: Json = { uid };
	if (format) body.format = format;
	const tag = await postJson<Json>(`/spool/${spoolId}/tag`, body);
	return { uid: tag.uid, format: tag.format ?? undefined, added: tag.added };
}

/**
 * Unlink a tag from the spool holding it. The UID may be in any spelling; the
 * server normalizes before matching.
 */
export async function unlinkTag(spoolId: number, uid: string): Promise<void> {
	await deleteResource(`/spool/${spoolId}/tag/${encodeURIComponent(uid)}`);
}

/**
 * The spool a UID is linked to, or undefined when no spool holds it.
 *
 * Archived spools are included: this answers "is this tag already spoken for",
 * and a tag on an archived spool is still spoken for — leaving them out would
 * report a UID as free that linking then rejects with a 409.
 *
 * A malformed UID is a 400 rather than an empty result, and is left to the
 * caller (`isBadUid`) rather than flattened into "not found", so a typo is not
 * reported to the user as an unknown tag.
 */
export async function findSpoolByTag(uid: string, signal?: AbortSignal): Promise<Spool | undefined> {
	const { items } = await getList('/spool', { tag: uid, allow_archived: 'true', limit: 1 }, signal);
	const raw = items[0] as Json | undefined;
	if (!raw) return undefined;
	// Seed the cache the way every other spool read does, so the inspector this
	// may be about to open has its filament and manufacturer already.
	if (raw.filament) {
		inventory.upsertFilament(mapFilament(raw.filament));
		if (raw.filament.vendor) inventory.upsertVendor(mapVendor(raw.filament.vendor));
	}
	const spool = mapSpool(raw);
	inventory.upsertSpool(spool);
	return spool;
}
