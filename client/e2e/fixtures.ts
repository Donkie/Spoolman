import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test as base } from "@playwright/test";
import { COVERAGE_ENABLED, RAW_COVERAGE_DIR } from "./coverage-options";

// All e2e specs import { test, expect } from this module instead of @playwright/test
// so that, when E2E_COVERAGE=1, each test's Chromium V8 JS coverage is captured and
// dropped as raw JSON for the global teardown to aggregate. When coverage is off this
// is a pass-through, so normal runs are unaffected.
//
// The fixture also fails any test during which the backend answered an API request
// with a 5xx. Every designed error path in Spoolman's API returns 2xx/4xx, so a 5xx
// is always an unhandled server crash — and optimistic client writes would otherwise
// swallow it (a UNIQUE-constraint 500 on the setting table survived a green CI run
// exactly that way).
//
// This overrides the built-in `page` fixture (rather than an auto fixture that depends
// on `page`) so request-only tests — the manifest checks in pwa.spec.ts — never pay to
// spin up a browser page.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (COVERAGE_ENABLED) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }

    const serverErrors: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 500 && response.url().includes("/api/")) {
        serverErrors.push(`${response.request().method()} ${response.url()} → ${response.status()}`);
      }
    });

    await use(page);

    if (COVERAGE_ENABLED) {
      const coverage = await page.coverage.stopJSCoverage();
      // Skip tests that never loaded app JS — an empty entry list makes monocart warn.
      const appEntries = coverage.filter((e) => e.url.includes("/assets/"));
      if (appEntries.length > 0) {
        if (!existsSync(RAW_COVERAGE_DIR)) {
          mkdirSync(RAW_COVERAGE_DIR, { recursive: true });
        }
        const safe = `${testInfo.testId}-${testInfo.repeatEachIndex}-${testInfo.retry}`.replace(/[^a-z0-9-]/gi, "_");
        writeFileSync(path.join(RAW_COVERAGE_DIR, `${safe}.json`), JSON.stringify(appEntries));
      }
    }

    if (serverErrors.length > 0) {
      throw new Error(`Backend returned server error(s) during this test:\n  ${serverErrors.join("\n  ")}`);
    }
  },
});

export const expect = test.expect;
