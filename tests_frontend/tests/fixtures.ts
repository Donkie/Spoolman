import { test as base, expect } from "@playwright/test";

/**
 * Base test that forces the UI into English regardless of the runner's browser
 * locale.
 *
 * Spoolman detects the language with i18next (order: localStorage → navigator),
 * so a runner whose browser reports e.g. Swedish would translate every label
 * and button the tests match on. We seed i18next's cache key before any app
 * code runs; the Playwright config additionally pins the context locale.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => window.localStorage.setItem("i18nextLng", "en"));
    await use(page);
  },
});

export { expect };
