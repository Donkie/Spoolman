import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vitest/config";

// Dedicated Vitest config (no PWA plugin, so no service-worker generation during
// unit runs). See TESTING_STRATEGY.md §1b.
export default defineConfig({
  plugins: [react(), svgr()],
  define: {
    // A couple of modules read import.meta.env.VITE_APIURL at import time.
    "import.meta.env.VITE_APIURL": JSON.stringify("/api/v1"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/**/*.d.ts", "src/vite-env.d.ts"],
      // Per-module thresholds (NOT global): enforce full coverage on the pure logic
      // that is unit-tested today. As Phase 2/3 land, add their modules here. A
      // global threshold is intentionally omitted so the many not-yet-tested UI
      // files don't fail CI. See TESTING_STRATEGY.md §4.
      // NOTE: saveload.ts is intentionally absent — only its useSavedState hook is
      // tested (behaviorally); the table-state hooks in the same file belong to a
      // later phase, so a per-file threshold there would be misleading.
      thresholds: {
        // branches capped at 85: the low-stock sort comparator has defensive
        // `?? 0` / `?? DEFAULT_TOTAL_WEIGHT` fallbacks that the upstream filter
        // makes unreachable (a weightless spool never reaches the sort).
        "src/pages/home/analytics.ts": { statements: 100, branches: 85, functions: 100, lines: 100 },
        "src/utils/scan.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/pages/locations/components/spoolCardHelpers.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
