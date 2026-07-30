import { test, expect } from "./fixtures";
import { Route } from "@playwright/test";
import { expectAppShell, openApp } from "./helpers";

/**
 * The upgrade path off the legacy client's service worker.
 *
 * The old React client shipped a vite-plugin-pwa worker registered at `./sw.js`
 * with scope `./` (see client/dist/registerSW.js), so every visitor who ever
 * opened Spoolman has an active worker at the deploy root whose precache holds a
 * complete copy of the old app shell — served for every navigation. Upgrading
 * the server does not touch that: unless something answers the browser's update
 * check for `/sw.js`, the registration survives and the user keeps getting the
 * old UI against the new backend. client_v2/static/sw.js is that answer.
 *
 * The test stands in a worker that behaves like the old one (precache + navigate
 * handler), proves the trap is real, then swaps the real `/sw.js` back in and
 * asserts the app recovers on its own.
 */

/**
 * Stand-in for the legacy worker.
 *
 * We can't use the genuine article: only one client is mounted at a time, so the
 * deployment under test serves client_v2's `/sw.js` at the very URL the legacy
 * registration lives at. This reproduces the two behaviours that actually trap
 * the user — a precache that outlives the upgrade, and a navigation handler that
 * answers from it (workbox's `createHandlerBoundToURL("index.html")`).
 */
const LEGACY_SW = `
const CACHE = 'workbox-precache-v2-legacy';
const SHELL =
  '<!doctype html><html><head><title>Spoolman (legacy)</title></head>' +
  '<body><h1 id="legacy-shell">legacy react shell</h1></body></html>';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.put('index.html', new Response(SHELL, { headers: { 'Content-Type': 'text/html' } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match('index.html')));
  }
});
`;

test("the deployed build serves the self-destructing service worker", async ({ request }) => {
  // Guards the plumbing the fix depends on: that client_v2/static/sw.js survives
  // the build into the root of client_v2/build, and that SinglePageApplication
  // serves it as a script rather than 404ing it or falling back to the SPA
  // document. A worker fetched with an HTML content type is discarded by the
  // browser, which is indistinguishable from the 404 we are fixing.
  const response = await request.get("/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
  expect(await response.text()).toContain("self.registration.unregister()");
});

test("a legacy service worker registration destroys itself and the new UI boots", async ({ page, context }) => {
  // Serve the legacy stand-in at the one URL the old registration uses. Routing
  // is per-context and Playwright gives every test a fresh one, so no other test
  // sees a worker.
  const serveLegacySW = (route: Route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: LEGACY_SW });
  await context.route("**/sw.js", serveLegacySW);

  await openApp(page);

  // Register exactly the way client/dist/registerSW.js does.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;
  });

  await test.step("the stale worker really does keep serving the old app", async () => {
    await page.reload();
    await expect(page.locator("#legacy-shell")).toBeVisible();
    await expect(page).toHaveTitle("Spoolman (legacy)");
  });

  // Upgrade: from here on `/sw.js` is whatever the server actually ships.
  await context.unroute("**/sw.js", serveLegacySW);

  // The browser also update-checks on navigation, but on its own schedule; ask
  // explicitly so the test doesn't race it. Everything after this point is the
  // shipped worker's own doing — note that nothing below reloads the page.
  //
  // A failed update is swallowed on purpose. It is exactly what a missing
  // /sw.js produces (Chromium rejects on the 404), and the spec's response to a
  // failed update is to leave the existing registration in place — which is the
  // regression itself. Letting the assertions below report it keeps the failure
  // reading as what the user would see: still on the old UI.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("./");
    await registration?.update().catch(() => {});
  });

  await test.step("the new client comes back without user intervention", async () => {
    await expect(page.locator("#legacy-shell")).toHaveCount(0);
    await expectAppShell(page);
    await expect(page).toHaveTitle("Library | Spoolman");
  });

  await test.step("nothing is left behind", async () => {
    // A surviving registration would re-trap the user on the next visit; a
    // surviving cache is the old app shell sitting in storage forever.
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistration("./").then((r) => !!r)))
      .toBe(false);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual([]);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(false);
  });
});
