import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

// Legacy/QR compatibility: the label designer's `url` encoding for filament labels
// points at `/filament/show/<id>` (see $lib/labels/qr.ts). That route has no page
// in client_v2 — the Library view selects a filament via `/?sel=filament:<id>`.
// Catch the path so scanning a filament label opens the right filament. Not
// prerenderable (dynamic id); the SPA fallback boots the app and this load runs
// the client-side redirect. Mirrors /spool/show/[id].
export const prerender = false;

export const load: PageLoad = ({ params }) => {
	redirect(307, resolve(`/?sel=filament:${params.id}`));
};
