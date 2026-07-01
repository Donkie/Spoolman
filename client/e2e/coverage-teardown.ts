import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { CoverageReport } from "monocart-coverage-reports";
import { COVERAGE_ENABLED, RAW_COVERAGE_DIR, coverageReportOptions } from "./coverage-options";

// Playwright globalTeardown: aggregate every test's raw V8 coverage into one report,
// map it back through the inline source maps to client/src, and print a summary.
export default async function coverageTeardown(): Promise<void> {
  if (!COVERAGE_ENABLED) return;

  let files: string[];
  try {
    files = readdirSync(RAW_COVERAGE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    console.warn("[coverage] no raw coverage captured");
    return;
  }

  const report = new CoverageReport(coverageReportOptions);
  for (const file of files) {
    const raw = JSON.parse(readFileSync(path.join(RAW_COVERAGE_DIR, file), "utf8"));
    await report.add(raw);
  }

  const results = await report.generate();
  rmSync(RAW_COVERAGE_DIR, { recursive: true, force: true });

  const bytes = results?.summary?.bytes;
  if (bytes) {
    console.log(`[coverage] client e2e bytes coverage: ${bytes.pct}%  (${bytes.covered}/${bytes.total})`);
  }
  console.log(`[coverage] full report: ${path.join(coverageReportOptions.outputDir, "index.html")}`);
}
