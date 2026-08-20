import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

// Legacy compatibility: Spoolman v1 QR codes (and the label designer's `url`
// encoding, see $lib/labels/qr.ts) point at `/spool/show/<id>`. That route no
// longer exists in client_v2 — the Library view selects a spool via
// `/?sel=spool:<id>`. Catch the old path so scanning an old label still opens
// the right spool. Not prerenderable (dynamic id); the SPA fallback boots the
// app and this load runs the client-side redirect.
export const prerender = false;

export const load: PageLoad = ({ params }) => {
	redirect(307, resolve(`/?sel=spool:${params.id}`));
};
