import type { Locale as _Locale } from '$lib/paraglide/runtime';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/state';

import {
	baseLocale,
	localizeUrl,
	overwriteGetLocale,
	overwriteSetLocale,
	toLocale
} from '$lib/paraglide/runtime';

export class Locale {
	#current: _Locale = $state(toLocale(browser && document.querySelector('html')?.lang) ?? baseLocale);

	constructor() {
		overwriteGetLocale(() => this.#current);

		overwriteSetLocale((locale) => {
			this.#current = locale;
			goto(localizeUrl(page.url.pathname, { locale }).href);
		});
	}
}
