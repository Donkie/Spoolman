// Resolve the Spoolman API base URL and its WebSocket equivalent.
//
// - In dev, set VITE_APIURL (e.g. http://localhost:8000/api/v1) to point at a
//   running backend.
// - In production the backend serves this SPA under an operator-chosen base path
//   (SPOOLMAN_BASE_PATH). With relative asset paths, SvelteKit derives that base
//   at runtime, so we resolve the API as `<base>/api/v1`. `resolve('/')` yields
//   `<base>/`; trimming its trailing slash gives us the bare base path.

import { resolve } from '$app/paths';

function trimTrailingSlash(s: string): string {
	return s.replace(/\/+$/, '');
}

export const API_BASE: string = (() => {
	const env = import.meta.env.VITE_APIURL as string | undefined;
	if (env) return trimTrailingSlash(env);
	return trimTrailingSlash(resolve('/')) + '/api/v1';
})();

/** Absolute ws(s):// URL for a resource path like "/spool". */
export function wsUrl(path: string): string {
	let base = API_BASE;
	if (!/^https?:/i.test(base)) {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		base = origin + (base.startsWith('/') ? '' : '/') + base;
	}
	return base.replace(/^http/i, 'ws') + path;
}
