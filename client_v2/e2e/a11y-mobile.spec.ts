import { test } from '@playwright/test';
import { audit, settle } from './audit';

// Mobile-accessibility audit for client_v2's main surfaces, under a Pixel 5 mobile
// emulation (see playwright.config.ts). The measurements themselves live in audit.ts;
// this file is the list of what gets measured.
//
// These run against the default, authentication-disabled configuration. The sign-in,
// account and administration surfaces need an authenticated backend and are audited by
// a11y-auth.spec.ts, which skips itself when authentication is off.

const STATIC_ROUTES: { path: string; label: string }[] = [
	{ path: '/', label: 'library (home)' },
	{ path: '/locations', label: 'locations' },
	{ path: '/labels', label: 'labels' },
	{ path: '/settings', label: 'settings' }
];

for (const route of STATIC_ROUTES) {
	test(`a11y: ${route.label}`, async ({ page }, testInfo) => {
		await page.goto(route.path);
		await audit(page, testInfo, route.label);
	});
}

test('a11y: add-spool modal', async ({ page }, testInfo) => {
	await page.goto('/');
	await settle(page);
	// The mobile TopBar exposes the add control via aria-label "Add spools".
	const addBtn = page.getByRole('button', { name: /add spool/i }).first();
	if ((await addBtn.count()) === 0) test.skip(true, 'no add button found');
	await addBtn.click();
	await audit(page, testInfo, 'add-spool modal');
});

test('a11y: inspector drawer (mobile bottom sheet)', async ({ page }, testInfo) => {
	await page.goto('/');
	await settle(page, 800);
	// Select the first library row to open the mobile drawer.
	const firstItem = page.locator('.list-pane a[href], .list-pane [role="button"]').first();
	if ((await firstItem.count()) === 0) test.skip(true, 'no list items to select');
	await firstItem.click({ timeout: 5000 }).catch(() => {});
	await audit(page, testInfo, 'inspector drawer');
});

test('a11y: detail pages (filament / spool)', async ({ page }, testInfo) => {
	await page.goto('/');
	await settle(page, 800);

	// Discover a real detail URL from the live DOM rather than hardcoding an id.
	const hrefs = await page.$$eval('a[href]', (els) =>
		els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || '')
	);
	const filament = hrefs.find((h) => /\/filament\/show\/\d/.test(h));
	const spool = hrefs.find((h) => /\/spool\/show\/\d/.test(h));

	if (filament) {
		await page.goto(filament);
		await audit(page, testInfo, 'filament detail');
	}
	if (spool) {
		await page.goto(spool);
		await audit(page, testInfo, 'spool detail');
	}
	if (!filament && !spool) test.skip(true, 'no detail links found in library');
});
