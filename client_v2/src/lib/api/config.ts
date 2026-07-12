// Resolve the Spoolman API base URL and its WebSocket equivalent.
//
// - In dev, set VITE_APIURL (e.g. http://localhost:8000/api/v1) to point at a
//   running backend.
// - In production the backend serves this SPA same-origin and injects
//   window.SPOOLMAN_BASE_PATH (see the architecture contract), so we default to
//   `<base>/api/v1`.

function trimTrailingSlash(s: string): string {
	return s.replace(/\/+$/, '');
}

declare global {
	interface Window {
		SPOOLMAN_BASE_PATH?: string;
	}
}

export const API_BASE: string = (() => {
	const env = import.meta.env.VITE_APIURL as string | undefined;
	if (env) return trimTrailingSlash(env);
	const basePath = (typeof window !== 'undefined' && window.SPOOLMAN_BASE_PATH) || '';
	return trimTrailingSlash(basePath + '/api/v1');
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
