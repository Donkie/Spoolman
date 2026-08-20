import { test as base, expect } from "@playwright/test";

/**
 * Base test that forces the UI into English regardless of the runner's browser
 * locale.
 *
 * client_v2 resolves its language with Paraglide, whose configured strategy is
 * localStorage → preferredLanguage → baseLocale (see client_v2/vite.config.ts),
 * so a runner whose browser reports e.g. Swedish would translate every label
 * and button the tests match on. We seed Paraglide's localStorage key before any
 * app code runs; the Playwright config additionally pins the context locale.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => window.localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await use(page);
  },
});

export { expect };
