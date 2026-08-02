/*
 * Self-destructing service worker — the upgrade path off the legacy React client.
 *
 * The legacy client (`client/`) registered a vite-plugin-pwa worker at `./sw.js`
 * with scope `./`, injected into its index.html. That means *every* visitor who
 * ever opened Spoolman has an active worker at the deploy root — not just people
 * who installed it to a home screen — and its precache holds a complete copy of
 * the old app shell, served for every navigation.
 *
 * client_v2 has no worker of its own. If nothing lived at this path the update
 * check would 404, and per the service worker spec a failed update leaves the
 * existing registration intact: the browser would keep serving the old React UI
 * from cache against the new backend, with nothing to indicate the upgrade ever
 * happened. So we must *answer* that update check — with a worker that takes
 * over, clears everything the old one left behind, and then removes itself.
 *
 * Keep this file for as long as anyone might still be upgrading from a version
 * that shipped the legacy PWA. It is deliberately dependency-free and lives in
 * `static/`, which adapter-static copies to the build root, so it is reachable at
 * `sw.js` relative to the deploy base path — the exact URL the old registration
 * polls, base path or not.
 *
 * Covered by tests_frontend_v2/tests/legacy-sw.spec.ts.
 */

self.addEventListener('install', () => {
	// Don't queue up behind the outgoing worker in "waiting" — that state only
	// clears when every tab is closed, which is precisely the user who is stuck.
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Drop the old app shell. Nothing on this origin caches anything anymore,
			// so clearing the lot is both correct and the only way to be sure the
			// precache can't resurface.
			const keys = await caches.keys();
			await Promise.all(keys.map((key) => caches.delete(key)));

			await self.registration.unregister();

			// unregister() doesn't touch pages that are already open — they stay
			// controlled, still showing whatever the old worker handed them. Reload
			// them so they come back uncontrolled, straight from the server.
			const windows = await self.clients.matchAll({ type: 'window' });
			await Promise.all(
				windows.map((client) =>
					// navigate() rejects for clients this worker doesn't control; that's a
					// page we can't help anyway, and the registration is already gone.
					Promise.resolve(client.navigate(client.url)).catch(() => {})
				)
			);
		})()
	);
});
