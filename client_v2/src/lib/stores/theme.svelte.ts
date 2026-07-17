// Client-only color-theme preference (light / dark / system), persisted to
// localStorage — the backend has no such setting. The initial paint is handled
// by a tiny inline script in app.html (reads the same key) so there is no
// flash of the wrong theme before this store hydrates; from then on `apply()`
// keeps <html data-theme> and the theme-color meta in sync reactively.

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'spoolman-v2-theme';

// Address-bar / mobile status-bar tint, per resolved theme. Kept in sync with
// the surface backgrounds in app.css and the inline script in app.html.
const META_COLOR: Record<'light' | 'dark', string> = {
	dark: '#1f1f1f',
	light: '#f2f1ee'
};

function systemPrefersDark(): boolean {
	return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

class ThemeState {
	pref = $state<ThemePref>('system');
	/** Tracks the OS preference so `resolved` recomputes when it flips. */
	#systemDark = $state(systemPrefersDark());

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(KEY);
			if (stored === 'light' || stored === 'dark' || stored === 'system') this.pref = stored;
		}
		if (typeof matchMedia !== 'undefined') {
			matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
				this.#systemDark = e.matches;
			});
		}
	}

	/** The theme actually in effect, resolving `system` against the OS setting. */
	get resolved(): 'light' | 'dark' {
		if (this.pref === 'system') return this.#systemDark ? 'dark' : 'light';
		return this.pref;
	}

	/** Reflect the resolved theme onto the document. Safe to call in an $effect. */
	apply() {
		if (typeof document === 'undefined') return;
		const t = this.resolved;
		document.documentElement.dataset.theme = t;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[t]);
	}

	setPref(p: ThemePref) {
		this.pref = p;
		if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, p);
	}
}

export const theme = new ThemeState();
