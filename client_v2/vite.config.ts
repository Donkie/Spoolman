import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		})
	],
	server: { port: 5174 },
	test: {
		// Unit tests only. The Playwright a11y audit lives in e2e/ and is run by
		// `npm run audit:a11y`; including it here would make vitest try to execute it.
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
