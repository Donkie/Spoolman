import { defineConfig, devices } from '@playwright/test';

// Playwright config dedicated to the mobile-accessibility audit. It runs a
// single mobile-emulated project (Pixel 5: 393x851 CSS px, touch enabled) so
// tap-target geometry and mobile layout are measured under realistic phone
// conditions.
//
// The webServer block reuses an already-running `vite dev` on 5174 (the usual
// dev loop) and only spins one up if nothing is listening there.
export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
	use: {
		baseURL: process.env.AUDIT_BASE_URL ?? 'http://localhost:5174',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'Mobile Chrome',
			use: { ...devices['Pixel 5'] }
		}
	],
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5174',
		reuseExistingServer: true,
		timeout: 120_000
	}
});
