// svelte-i18n setup for client_v2.
//
// Locale dictionaries live in static/locales/<code>/common.json (seeded from the
// old client's Weblate translations by scripts/convert-locales.mjs, in ICU
// format). They are fetched lazily per language. Only the English file may be
// hand-edited; every other language is maintained by Weblate.

import { browser } from '$app/environment';
import { base } from '$app/paths';
import { register, init, locale, waitLocale, getLocaleFromNavigator } from 'svelte-i18n';
import { languages, languageCodes, DEFAULT_LOCALE } from './languages';

const STORAGE_KEY = 'spoolman-locale';

for (const code of languageCodes) {
	register(code, async () => {
		const res = await fetch(`${base}/locales/${code}/common.json`);
		return res.json();
	});
}

/**
 * Resolve a candidate locale string (e.g. "pt-BR", "en-US", "zh-TW") to one of
 * our registered locale codes: try an exact match first, then fall back to the
 * base language (the part before the first "-"). Returns null if unsupported.
 */
function resolveSupported(candidate: string | null | undefined): string | null {
	if (!candidate) return null;
	if (languageCodes.includes(candidate)) return candidate;
	const primary = candidate.split('-')[0];
	if (languageCodes.includes(primary)) return primary;
	// Match any registered code that shares the primary subtag (e.g. "pt" -> "pt").
	const bySubtag = languageCodes.find((c) => c.split('-')[0] === primary);
	return bySubtag ?? null;
}

/** Saved user choice, if any and still supported. */
function savedLocale(): string | null {
	if (!browser) return null;
	return resolveSupported(localStorage.getItem(STORAGE_KEY));
}

/** localStorage choice -> navigator language -> English. */
function pickInitialLocale(): string {
	return savedLocale() ?? resolveSupported(getLocaleFromNavigator()) ?? DEFAULT_LOCALE;
}

init({
	fallbackLocale: DEFAULT_LOCALE,
	initialLocale: pickInitialLocale()
});

/** Change the active language and persist the choice for this browser. */
export function setLocale(code: string): void {
	if (browser) localStorage.setItem(STORAGE_KEY, code);
	locale.set(code);
}

/** BCP-47 tag for Intl date/number formatting, derived from the active locale. */
export function intlLocale(current: string | null | undefined): string {
	if (current && languages[current]) return languages[current].code;
	const resolved = resolveSupported(current);
	return resolved ? languages[resolved].code : languages[DEFAULT_LOCALE].code;
}

export { waitLocale };
