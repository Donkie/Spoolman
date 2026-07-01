import { DEPLOYMENTS } from "./constants";
import { expect, test } from "./fixtures";

// End-to-end coverage for the two PWA serving behaviours that only exist once the
// built client is served through the backend's base-path rewrite, and can only be
// proven in a real browser (see TESTING_STRATEGY.md §4 / vite.config.ts):
//
//   #95 — the manifest's root-absolute start_url/scope are rewritten to the deploy
//         base path (tweak_manifest), otherwise an installed PWA points at the wrong
//         origin and browsers reject the install under a sub-path.
//   #93 — workbox's navigateFallback is suppressed, so a deep hard-navigation is
//         served the base-path-rewritten index.html from the network rather than the
//         raw precached HTML — whose relative "./" assets would 404 at depth.
//
// Both deploy shapes (root and /spoolman sub-path) are exercised.

for (const d of DEPLOYMENTS) {
  test.describe(`manifest base-path rewrite (#95) — ${d.name}`, () => {
    test("start_url and scope point at the deploy base path; icons stay relative", async ({ request }) => {
      const res = await request.get(`${d.origin}${d.base}/manifest.webmanifest`);
      expect(res.ok()).toBeTruthy();
      expect(res.headers()["content-type"]).toContain("application/manifest+json");

      const manifest = await res.json();
      const expectedBase = d.base === "" ? "/" : `${d.base}/`;
      expect(manifest.start_url).toBe(expectedBase);
      expect(manifest.scope).toBe(expectedBase);

      // Icon srcs are intentionally left relative so they resolve against the
      // served manifest URL (<base>/manifest.webmanifest -> <base>/pwa-64x64.png).
      expect(manifest.icons[0].src).toBe("pwa-64x64.png");
    });
  });

  test.describe(`service worker deep-navigation (#93) — ${d.name}`, () => {
    const expectedScopePath = `${d.base}/`; // "/" at root, "/spoolman/" under a sub-path

    test("registers a service worker scoped to the deploy base path", async ({ page }) => {
      await page.goto(`${d.origin}${d.base}/`);

      await page.waitForFunction(
        async () => {
          const reg = await navigator.serviceWorker?.getRegistration();
          return Boolean(reg?.active);
        },
        undefined,
        { timeout: 20_000 },
      );

      const scope = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg?.scope ?? "";
      });
      expect(new URL(scope).pathname).toBe(expectedScopePath);
    });

    test("a deep hard-navigation boots the app with every asset resolving (no 404)", async ({ page }) => {
      // First load registers + (skipWaiting) activates the SW. There is no clientsClaim,
      // so control is established on a later navigation; reload until this page is under
      // the SW's control, so the deep navigation below genuinely goes through it — the
      // state in which a #93 regression (serving raw precached HTML) would bite.
      await page.goto(`${d.origin}${d.base}/`);
      await expect(async () => {
        await page.reload();
        const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
        expect(controlled).toBe(true);
      }).toPass({ timeout: 30_000 });

      // Record any static asset (js/css/config.js) that fails to load on the deep nav.
      // API calls (there is no backend here) are 4xx by design and must be ignored.
      const failedAssets: string[] = [];
      page.on("response", (r) => {
        const { pathname } = new URL(r.url());
        const isAsset = /\.(?:js|css)$/.test(pathname) || pathname.endsWith("/config.js");
        if (isAsset && !pathname.includes("/api/") && r.status() >= 400) {
          failedAssets.push(`${r.status()} ${pathname}`);
        }
      });

      // Deep URL that is not a real file. With navigateFallback suppressed the SW must
      // let this reach the network, which returns the rewritten index.html whose "./"
      // assets have been turned into absolute "<base>/..." paths that resolve at depth.
      await page.goto(`${d.origin}${d.base}/spool/print`, { waitUntil: "load" });

      // The page was already SW-controlled, so this deep navigation genuinely went
      // through the SW rather than only proving the raw network path.
      expect(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);

      // config.js executed → the base path global is set to this deploy's base.
      const basePath = await page.evaluate(
        () => (window as unknown as { SPOOLMAN_BASE_PATH?: string }).SPOOLMAN_BASE_PATH,
      );
      expect(basePath).toBe(d.base); // "" at root, "/spoolman" under a sub-path

      // React mounted (at minimum the Suspense "loading" fallback) → the app booted
      // rather than dying on a 404'd bundle.
      await expect(page.locator("#root")).not.toBeEmpty();

      expect(failedAssets, "static assets must not 404 on a deep hard-navigation").toEqual([]);
    });
  });
}
