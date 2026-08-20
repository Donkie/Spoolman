import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Spoolman's frontend integration tests.
 *
 * The tests run against a fully deployed Spoolman instance (see
 * docker-compose.yml), reached over the published host port. The base URL is
 * configurable so the same tests can point at any running instance.
 */
const baseURL = process.env.SPOOLMAN_BASE_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "./tests",
  // Fail the build on CI if a test.only was left in the source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The tests share one Spoolman instance, so keep them serial to avoid
  // cross-test interference in the shared database.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    // Pin the browser locale so date/number formatting is deterministic. The
    // app's language is additionally forced to English in tests/fixtures.ts.
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
