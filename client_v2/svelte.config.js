import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Spoolman serves the built frontend as a static SPA, so we prerender a
		// fallback and let client-side routing take over.
		adapter: adapter({
			fallback: 'index.html'
		}),
		alias: {
			$components: 'src/lib/components'
		}
	}
};

export default config;
