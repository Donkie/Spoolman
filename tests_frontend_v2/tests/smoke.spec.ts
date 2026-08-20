import { test, expect } from "./fixtures";
import { navTab, openApp } from "./helpers";

/**
 * Smoke test: starting from the app root, click through every entry in the top
 * bar and confirm each page renders inside the app shell with no browser console
 * errors. This proves the whole app is reachable purely by UI navigation (only
 * the initial "open the app" uses a direct URL).
 */

// Navigation destinations in click order, ending back on the Library.
const destinations: { label: string; title: string }[] = [
  { label: "Dashboard", title: "Dashboard | Spoolman" },
  { label: "Labels", title: "Labels | Spoolman" },
  { label: "Settings", title: "Settings | Spoolman" },
  { label: "Library", title: "Library | Spoolman" },
];

test("navigate through every page via the top bar", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${page.url()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`${page.url()}: ${err.message}`));

  await openApp(page);

  for (const { label, title } of destinations) {
    await test.step(`navigate to ${label}`, async () => {
      await navTab(page, label, title);
    });
  }

  expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
});

test("the library list loads its data from the API", async ({ page }) => {
  await openApp(page);

  // The list is server-paged: it renders either rows or one of its two empty
  // states. What must never show is the "couldn't reach the API" message, which
  // is how a broken client/backend origin split surfaces to a user.
  await expect(page.getByText("Couldn't reach the Spoolman API. Is the backend running?")).toHaveCount(0);

  // The toolbar rendered: its sort options are derived from the spool field
  // metadata fetched over the API, so its presence means the client reached the
  // backend and not just its own bundle.
  await expect(page.getByRole("button", { name: /^Group/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sort/ })).toBeVisible();
});
