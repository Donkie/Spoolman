import { test, expect } from "./fixtures";
import { navSidebar, openApp } from "./helpers";

/**
 * Smoke test: starting from the app root, click through every entry in the
 * sidebar and confirm each page renders inside the app shell with no browser
 * console errors. This proves the whole app is reachable purely by UI
 * navigation (only the initial "open the app" uses a direct URL).
 */

// Sidebar destinations in click order. `href` is the language-independent menu
// link; list pages additionally render an Ant Design <table>. The trailing "/"
// entry navigates back to Home.
const destinations: { href: string; expectsTable?: boolean }[] = [
  { href: "/spool", expectsTable: true },
  { href: "/filament", expectsTable: true },
  { href: "/vendor", expectsTable: true },
  { href: "/locations" },
  { href: "/settings" },
  { href: "/help" },
  { href: "/" },
];

test("navigate through every page via the sidebar", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${page.url()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`${page.url()}: ${err.message}`));

  await openApp(page);

  for (const { href, expectsTable } of destinations) {
    await test.step(`navigate to ${href}`, async () => {
      await navSidebar(page, href);
      if (expectsTable) {
        // Ant Design renders a separate <table> for the sticky header and body.
        await expect(page.getByRole("table").first()).toBeVisible();
      }
    });
  }

  expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
});
