import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SURFACES_DIR, TAP_MIN, type SurfaceResult, type TapTarget } from './report';

// Mobile-accessibility audit for client_v2.
//
// Two independent checks run against every surface, under a Pixel 5 mobile
// emulation (see playwright.config.ts):
//
//   1. axe-core — the full WCAG 2.0/2.1 A + AA ruleset PLUS the WCAG 2.2
//      `target-size` rule (SC 2.5.8, 24x24 CSS px minimum). Real conformance
//      failures.
//
//   2. A custom tap-target measurement — flags interactive controls smaller
//      than TAP_MIN px in either dimension. An *advisory* thumb-comfort check
//      (Apple HIG 44px / Material 48px), stricter than the WCAG minimum and
//      catching targets axe considers technically compliant.
//
// Each surface's findings are written to SURFACES_DIR as JSON; the consolidated
// `a11y-report.md` is rendered by globalTeardown (which survives worker
// restarts). Raw findings are also attached to the Playwright HTML report.

let surfaceCount = 0;

// Let the DOM and any async lists settle. The app holds an open live-sync
// WebSocket, so `networkidle` never fires — we bound it and fall through.
async function settle(page: Page, ms = 500) {
	await page.waitForLoadState('domcontentloaded').catch(() => {});
	await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
	await page.waitForTimeout(ms);
}

// Measure every interactive control in the live DOM and return those smaller
// than `min` px in either dimension. Runs in the browser.
function collectSmallTargets(min: number): TapTarget[] {
	const SELECTOR = [
		'a[href]',
		'button',
		'input:not([type="hidden"])',
		'select',
		'textarea',
		'summary',
		'[role="button"]',
		'[role="link"]',
		'[role="checkbox"]',
		'[role="radio"]',
		'[role="switch"]',
		'[role="tab"]',
		'[role="menuitem"]',
		'[tabindex]:not([tabindex="-1"])'
	].join(',');

	const out: TapTarget[] = [];
	const seen = new Set<Element>();

	for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
		if (seen.has(el)) continue;
		seen.add(el);

		const style = getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
		if ((el as HTMLButtonElement).disabled) continue;

		// WCAG exempts targets rendered inline within a run of text (e.g. a link
		// inside a sentence). Skip inline <a> elements to avoid false positives.
		if (el.tagName === 'A' && style.display.startsWith('inline')) continue;

		const rect = el.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue; // not rendered
		if (rect.width >= min && rect.height >= min) continue;

		const id = el.id ? `#${el.id}` : '';
		const rawCls = (el as HTMLElement).className;
		const cls =
			typeof rawCls === 'string' && rawCls.trim()
				? '.' + rawCls.trim().split(/\s+/).slice(0, 2).join('.')
				: '';
		const aria = el.getAttribute('aria-label');

		out.push({
			tag: el.tagName.toLowerCase(),
			text: (aria || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
			selector: `${el.tagName.toLowerCase()}${id}${cls}`,
			width: Math.round(rect.width),
			height: Math.round(rect.height)
		});
	}
	return out;
}

// Run both checks against whatever is currently rendered and record the result.
async function audit(page: Page, testInfo: TestInfo, label: string) {
	await settle(page);

	const axeResults = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();

	const smallTargets = await page.evaluate(collectSmallTargets, TAP_MIN);

	const surface: SurfaceResult = {
		order: surfaceCount++,
		label,
		url: page.url(),
		axe: axeResults.violations.map((v) => ({
			id: v.id,
			impact: v.impact,
			help: v.help,
			nodes: v.nodes.length,
			targets: v.nodes.slice(0, 5).map((n) => n.target.join(' '))
		})),
		smallTargets
	};

	const file = path.join(SURFACES_DIR, `${label.replace(/[^a-z0-9]+/gi, '-')}.json`);
	await writeFile(file, JSON.stringify(surface, null, 2), 'utf8');

	await testInfo.attach(`${label} — axe violations`, {
		body: JSON.stringify(axeResults.violations, null, 2),
		contentType: 'application/json'
	});
	await testInfo.attach(`${label} — small tap targets`, {
		body: JSON.stringify(smallTargets, null, 2),
		contentType: 'application/json'
	});

	// Soft assertions: the run completes and reports every surface, but the test
	// is still marked failed if anything is out of spec — useful as a CI gate.
	const serious = surface.axe.filter((v) => v.impact === 'serious' || v.impact === 'critical');
	expect.soft(serious, `${label}: serious/critical axe violations`).toEqual([]);
	expect.soft(smallTargets, `${label}: tap targets under ${TAP_MIN}px`).toEqual([]);
}

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
