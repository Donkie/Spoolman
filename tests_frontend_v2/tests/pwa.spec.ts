import { test, expect } from "./fixtures";
import { openApp } from "./helpers";

/**
 * Installability. The legacy client shipped a web app manifest and a set of PWA
 * icons through vite-plugin-pwa, so anyone who had added Spoolman to a home
 * screen got a real standalone app. client_v2 has no such plugin — its manifest
 * and icons are plain files in `static/` — which makes this the kind of thing
 * that can silently stop shipping without anyone noticing until an installed app
 * turns back into a browser tab.
 *
 * These assertions are deliberately about the deployed artifact rather than the
 * source tree: the manifest has to survive the build, land at the deploy root and
 * be served with a type a browser will accept.
 */

test("the manifest is served and describes an installable app", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);

  // Some browsers refuse a manifest served as text/plain, which is what a naive
  // static-file server does with this extension.
  expect(response.headers()["content-type"]).toContain("application/manifest+json");

  const manifest = await response.json();
  expect(manifest.name).toBe("Spoolman");
  // The three fields that decide whether the browser offers to install it at all.
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);

  // A maskable icon is what keeps Android from framing the icon in a white box.
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
});

test("every icon the manifest promises actually exists", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();

  for (const icon of manifest.icons as { src: string }[]) {
    // Icon sources are relative to the manifest, which is what lets the same file
    // work under SPOOLMAN_BASE_PATH without a rebuild.
    expect(icon.src).not.toMatch(/^\//);
    const response = await request.get(`/${icon.src}`);
    expect(response.status(), `icon ${icon.src}`).toBe(200);
    expect(response.headers()["content-type"], `icon ${icon.src}`).toContain("image/png");
  }

  // Not in the manifest — iOS reads it from the document instead — but part of
  // the same "added to a home screen" story.
  expect((await request.get("/apple-touch-icon-180x180.png")).status()).toBe(200);
});

test("the app links to the manifest and the touch icon", async ({ page }) => {
  await openApp(page);

  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
