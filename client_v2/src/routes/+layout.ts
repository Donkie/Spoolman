import { browser } from '$app/environment';

// Spoolman ships as a client-side SPA served from the backend, so disable SSR
// and prerender the shell.
export const ssr = false;
export const prerender = true;

// Initialise i18n and wait for the first locale's messages before the app
// renders, so the initial paint never shows raw translation keys. Guarded to
// the browser so prerendering the shell doesn't try to fetch locale files.
export const load = async () => {
	if (browser) {
		await import('$lib/i18n');
		const { waitLocale } = await import('svelte-i18n');
		await waitLocale();
	}
	return {};
};
