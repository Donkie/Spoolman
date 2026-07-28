import { test, type Page } from '@playwright/test';
import { audit, settle } from './audit';

// Mobile-accessibility audit for the authentication surfaces.
//
// These live apart from a11y-mobile.spec.ts because they need something that file's
// backend does not have: authentication turned on. The sign-in screen never renders
// against a default instance, so auditing it there would silently measure the library
// page twice and report a pass.
//
// The file configures itself rather than needing a second Playwright config. It asks
// the server what it is, and:
//
//   * skips entirely when authentication is disabled, which is the default and what CI
//     runs, so `npm run audit:a11y` keeps working unchanged;
//   * claims an unclaimed instance with the credentials below, so pointing the audit at
//     a throwaway auth-enabled server needs no setup at all;
//   * otherwise signs in with AUDIT_AUTH_USERNAME / AUDIT_AUTH_PASSWORD.
//
// One surface is always missing from any single run, unavoidably: claiming is one-way,
// so an instance shows either the claim screen or the sign-in screen, never both. A
// fresh instance audits sign-in (the test claims it first); pointing the audit at an
// already-claimed instance audits sign-in too. To audit the claim screen, run it once
// against a brand-new instance and read the report before the second run.
//
// Run it against an auth-enabled backend serving the built client with:
//   npm run build
//   SPOOLMAN_AUTH_ENABLED=TRUE uv run uvicorn spoolman.main:app --port 8000
//   AUDIT_BASE_URL=http://localhost:8000 npm run audit:a11y
//
// Or against `vite dev`, with VITE_APIURL pointing at the backend as usual.

// Resolved the same way src/lib/api/config.ts resolves it, so the audit works against
// both layouts: a `vite dev` server on 5174 talking to a separate backend through an
// absolute VITE_APIURL, and the backend serving the built SPA itself, where the API is
// same-origin. Getting this wrong is silent — every request 404s and every test skips.
const API = process.env.VITE_APIURL?.replace(/\/+$/, '') ?? '/api/v1';

const USERNAME = process.env.AUDIT_AUTH_USERNAME ?? 'audit-owner';
const PASSWORD = process.env.AUDIT_AUTH_PASSWORD ?? 'audit-owner-password';

// A second account, created by the suite, whose password is one the owner set. It is
// what makes the forced-change screen reachable — the flag cannot be set on oneself.
const TEMP_USERNAME = 'audit-temp-user';
const TEMP_PASSWORD = 'audit-temp-password';

interface AuthConfig {
	enabled: boolean;
	setup_required: boolean;
}

async function authConfig(page: Page): Promise<AuthConfig | null> {
	try {
		const response = await page.request.get(`${API}/auth/config`);
		if (!response.ok()) return null;
		return (await response.json()) as AuthConfig;
	} catch {
		// No backend reachable at all. Skipping beats failing the whole audit run.
		return null;
	}
}

/** Read the CSRF cookie the server set, which every write must echo in a header. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
	const cookies = await page.context().cookies();
	const csrf = cookies.find((c) => c.name === 'spoolman_csrf');
	return csrf ? { 'X-CSRF-Token': csrf.value } : {};
}

/** Sign in through the API, leaving the session cookie on the page's context. */
async function signIn(page: Page, username: string, password: string): Promise<boolean> {
	const response = await page.request.post(`${API}/auth/login`, {
		data: { username, password, remember: false }
	});
	return response.ok();
}

/** Put the page in a signed-in state as an administrator, or return false. */
async function signInAsOwner(page: Page): Promise<boolean> {
	const config = await authConfig(page);
	if (config === null || !config.enabled) return false;

	if (config.setup_required) {
		const claimed = await page.request.post(`${API}/auth/setup`, {
			data: { username: USERNAME, password: PASSWORD, display_name: 'Audit Owner' }
		});
		if (!claimed.ok()) return false;
		return true;
	}
	return signIn(page, USERNAME, PASSWORD);
}

test.describe('auth surfaces', () => {
	test('a11y: sign-in screen', async ({ page }, testInfo) => {
		await page.goto('/');
		// Claim the instance if it is unclaimed, rather than skipping: on a fresh server
		// the sign-in screen does not exist until somebody owns it, and skipping here
		// would mean the surface is never audited on exactly the throwaway instance this
		// suite is meant to be pointed at.
		test.skip(!(await signInAsOwner(page)), 'authentication is not enabled on this server');

		await page.context().clearCookies();
		await page.goto('/');
		await settle(page);
		await audit(page, testInfo, 'sign-in screen');
	});

	test('a11y: claim (first-run setup) screen', async ({ page }, testInfo) => {
		await page.goto('/');
		const config = await authConfig(page);
		test.skip(config === null || !config.enabled, 'authentication is not enabled on this server');
		test.skip(!config!.setup_required, 'instance is already claimed');

		await settle(page);
		await audit(page, testInfo, 'claim screen');
	});

	test('a11y: account page', async ({ page }, testInfo) => {
		await page.goto('/');
		test.skip(!(await signInAsOwner(page)), 'could not sign in');

		await page.goto('/account');
		await settle(page);
		await audit(page, testInfo, 'account');

		// The key-creation form is a separate surface: it is the only real form on the
		// page and none of its controls exist until it is opened.
		const newKey = page.getByRole('button', { name: /new api key/i }).first();
		if ((await newKey.count()) > 0) {
			await newKey.click();
			await audit(page, testInfo, 'account — new API key form');
		}
	});

	test('a11y: users page', async ({ page }, testInfo) => {
		await page.goto('/');
		test.skip(!(await signInAsOwner(page)), 'could not sign in');

		await page.goto('/users');
		await settle(page);
		await audit(page, testInfo, 'users');

		const newUser = page.getByRole('button', { name: /new user/i }).first();
		if ((await newUser.count()) > 0) {
			await newUser.click();
			await audit(page, testInfo, 'users — new user form');
		}
	});

	test('a11y: audit log', async ({ page }, testInfo) => {
		await page.goto('/');
		test.skip(!(await signInAsOwner(page)), 'could not sign in');

		await page.goto('/audit');
		await settle(page);
		await audit(page, testInfo, 'audit log');
	});

	test('a11y: forced password change', async ({ page }, testInfo) => {
		await page.goto('/');
		test.skip(!(await signInAsOwner(page)), 'could not sign in');

		// Create a throwaway account that must change its password. Re-running the audit
		// against the same instance is fine: a 409 means it already exists, and the reset
		// below puts it back into the state this surface needs either way.
		const headers = await csrfHeaders(page);
		await page.request.post(`${API}/auth/user`, {
			headers,
			data: {
				username: TEMP_USERNAME,
				password: TEMP_PASSWORD,
				level: 'read',
				is_admin: false,
				must_change_password: true
			}
		});

		const listed = await page.request.get(`${API}/auth/user`);
		test.skip(!listed.ok(), 'could not list users');
		const users = (await listed.json()) as { id: number; username: string }[];
		const temp = users.find((u) => u.username === TEMP_USERNAME);
		test.skip(temp === undefined, 'could not create the temporary account');

		const reset = await page.request.post(`${API}/auth/user/${temp!.id}/password`, {
			headers,
			data: { password: TEMP_PASSWORD, must_change_password: true }
		});
		test.skip(!reset.ok(), 'could not reset the temporary account');

		await page.context().clearCookies();
		test.skip(!(await signIn(page, TEMP_USERNAME, TEMP_PASSWORD)), 'could not sign in as the temporary user');

		await page.goto('/');
		await settle(page);
		await audit(page, testInfo, 'forced password change');
	});
});
