import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..");

// Whether the current run collects client code coverage. The coverage build emits
// inline source maps (see vite.config.ts) and runs the app under the real backend.
export const COVERAGE_ENABLED = process.env.E2E_COVERAGE === "1";

// Where each test's raw V8 coverage is dropped, then aggregated by the global teardown.
export const RAW_COVERAGE_DIR = path.join(clientDir, ".coverage-raw");

// monocart-coverage-reports options, shared by the teardown. Only the app's own
// source (client/src) is counted — bundled node_modules and the config.js/sw.js
// shims are filtered out so the number reflects OUR code.
export const coverageReportOptions = {
  name: "Spoolman e2e coverage",
  outputDir: path.join(clientDir, "coverage-e2e"),
  reports: [["v8"], ["console-summary"], ["json-summary"]],
  // Keep only Vite's application bundles; drop config.js, the service worker, workbox.
  entryFilter: (entry: { url: string }) => entry.url.includes("/assets/"),
  // After source-map resolution, keep only our TypeScript under src/.
  sourceFilter: (sourcePath: string) => sourcePath.includes("src/") && !sourcePath.includes("node_modules"),
};
