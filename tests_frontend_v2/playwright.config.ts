import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Spoolman Svelte client (client_v2).
 *
 * The tests run against a fully deployed Spoolman instance (see
 * docker-compose.yml), reached over the published host port. The base URL is
 * configurable so the same tests can point at any running instance.
 *
 * The default host port differs from the legacy suite's (tests_frontend, 8000)
 * so both stacks can be up at the same time locally.
 */
const baseURL = process.env.SPOOLMAN_BASE_URL ?? "http://localhost:8001";

export default defineConfig({
  testDir: "./tests",
  // Fail the build on CI if a test.only was left in the source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The tests share one Spoolman instance, so keep them serial to avoid
  // cross-test interference in the shared database.
  workers: 1,
  // Argos uploads only from the CI screenshots step; any other run would upload
  // an empty build and show every screen as removed.
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never" }],
        ["@argos-ci/playwright/reporter", { uploadToArgos: !!process.env.ARGOS_UPLOAD }],
      ]
    : [["list"]],
  use: {
    baseURL,
    // Pin the browser locale so date/number formatting is deterministic. The
    // app's language is additionally forced to English in tests/fixtures.ts.
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  // The screenshots project seeds a fixed dataset and needs an empty database,
  // so CI runs it first on its own; see tests/screenshots.spec.ts.
  projects: [
    {
      name: "screenshots",
      testMatch: "screenshots.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        // Argos-recommended flags for stable font rendering across runs.
        launchOptions: { args: ["--disable-lcd-text", "--font-render-hinting=none"] },
      },
    },
    {
      name: "chromium",
      testIgnore: "screenshots.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
