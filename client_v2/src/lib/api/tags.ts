import type { Filament, Spool, Tag } from '$lib/types';
import { getList, postJson, deleteResource, HttpError } from './http';
import { mapSpool, mapFilament, mapVendor } from './map';
import { inventory } from '$lib/stores/inventory.svelte';

// Linking physical NFC/RFID tags to spools and filaments.
//
// A tag identifies exactly one spool or filament and is keyed by its hardware
// UID, which the server normalizes: `04:a2:b3`, `04-A2-B3` and `04a2b3` are one
// tag. Nothing here normalizes anything itself — the canonical spelling comes
// back in the response, and rendering that rather than what was typed is what
// keeps the UI honest about which tag was actually touched.
//
// Neither link nor unlink updates the cache. Both emit the holder's ordinary
// `updated` event, so liveSync ingests the new tag list and every open inspector
// re-renders on its own; patching local state here as well would just race it.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

/** What a tag can identify. */
export type TagKind = 'spool' | 'filament';

/**
 * A spool or filament as the tag endpoints address it. Spool ids are numbers and
 * filament ids strings in the client; both go into the path as they are.
 */
export interface TagTarget {
	kind: TagKind;
	id: number | string;
}

/** Whatever holds a tag, loaded, so the UI can name it. */
export type TagHolder = { kind: 'spool'; spool: Spool } | { kind: 'filament'; filament: Filament };

export function holderTarget(holder: TagHolder): TagTarget {
	return holder.kind === 'spool'
		? { kind: 'spool', id: holder.spool.id }
		: { kind: 'filament', id: holder.filament.id };
}

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
 * What already holds a UID, carried by the 409 from `linkTag`. It is on the
 * error body so the UI can offer to move the tag without looking it up.
 */
export interface TagConflict {
	holder: TagTarget;
	message: string;
}

/**
 * Read a 409 from `linkTag` as the conflict it describes, or null for any other
 * failure. A 409 that names neither a spool nor a filament by id counts as "not a
 * conflict we can act on" and falls back to being reported as an ordinary error.
 */
export function asTagConflict(err: unknown): TagConflict | null {
	if (!(err instanceof HttpError) || err.status !== 409) return null;
	const message = typeof err.body?.message === 'string' ? err.body.message : err.message;
	const spoolId = err.body?.spool_id;
	if (typeof spoolId === 'number') return { holder: { kind: 'spool', id: spoolId }, message };
	const filamentId = err.body?.filament_id;
	if (typeof filamentId === 'number') {
		return { holder: { kind: 'filament', id: String(filamentId) }, message };
	}
	return null;
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

function tagPath(target: TagTarget): string {
	return `/${target.kind}/${target.id}/tag`;
}

/**
 * Link a tag to a spool or filament. Re-linking a UID it already holds succeeds
 * and changes nothing (passing a `format` refines the stored one), so this is
 * safe to call without checking first.
 *
 * Rejects with a 409 when anything else holds the UID — see `asTagConflict`.
 */
export async function linkTag(target: TagTarget, uid: string, format?: string): Promise<Tag> {
	const body: Json = { uid };
	if (format) body.format = format;
	const tag = await postJson<Json>(tagPath(target), body);
	return { uid: tag.uid, format: tag.format ?? undefined, added: tag.added };
}

/**
 * Unlink a tag from the spool or filament holding it. The UID may be in any
 * spelling; the server normalizes before matching.
 */
export async function unlinkTag(target: TagTarget, uid: string): Promise<void> {
	await deleteResource(`${tagPath(target)}/${encodeURIComponent(uid)}`);
}

/**
 * The spool or filament a UID is linked to, or undefined when nothing holds it.
 *
 * Both kinds are asked at once. A UID is unique across them, so at most one
 * answers, and asking in parallel keeps the lookup as quick as asking one.
 *
 * Archived spools are included: this answers "is this tag already spoken for",
 * and a tag on an archived spool is still spoken for — leaving them out would
 * report a UID as free that linking then rejects with a 409.
 *
 * A malformed UID is a 400 rather than an empty result, and is left to the
 * caller (`isBadUid`) rather than flattened into "not found", so a typo is not
 * reported to the user as an unknown tag.
 */
export async function findTagHolder(uid: string, signal?: AbortSignal): Promise<TagHolder | undefined> {
	const [spools, filaments] = await Promise.all([
		getList('/spool', { tag: uid, allow_archived: 'true', limit: 1 }, signal),
		getList('/filament', { tag: uid, limit: 1 }, signal)
	]);
	const rawSpool = spools.items[0] as Json | undefined;
	if (rawSpool) {
		// Seed the cache the way every other spool read does, so the inspector this
		// may be about to open has its filament and manufacturer already.
		if (rawSpool.filament) {
			inventory.upsertFilament(mapFilament(rawSpool.filament));
			if (rawSpool.filament.vendor) inventory.upsertVendor(mapVendor(rawSpool.filament.vendor));
		}
		const spool = mapSpool(rawSpool);
		inventory.upsertSpool(spool);
		return { kind: 'spool', spool };
	}
	const rawFilament = filaments.items[0] as Json | undefined;
	if (rawFilament) {
		if (rawFilament.vendor) inventory.upsertVendor(mapVendor(rawFilament.vendor));
		const filament = mapFilament(rawFilament);
		inventory.upsertFilament(filament);
		return { kind: 'filament', filament };
	}
	return undefined;
}
