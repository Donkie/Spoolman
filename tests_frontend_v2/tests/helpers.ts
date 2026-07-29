import { Locator, Page, expect } from "@playwright/test";

/**
 * Generate a unique-ish suffix so repeated runs against the same (persistent)
 * database don't collide. Includes a non-ASCII marker, matching the repo's
 * habit of using åäö as an encoding canary in text fields.
 */
export function unique(prefix: string): string {
  return `${prefix}-åäö-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Narrow a locator to the one element that is actually rendered.
 *
 * The top bar renders its navigation twice — a desktop row and a mobile row —
 * and hides one with CSS, so nav links and the add button each match twice. The
 * tests run at a desktop viewport, so exactly one of each is visible.
 */
export function onlyVisible(locator: Locator): Locator {
  return locator.locator("visible=true");
}

/**
 * Assert that the app shell has rendered rather than the page having crashed or
 * stalled on the SPA fallback. The logo is present on every route and carries a
 * stable, untranslated accessible name.
 */
export async function expectAppShell(page: Page): Promise<void> {
  await expect(page.getByRole("link", { name: "Spoolman home" })).toBeVisible();
}

/**
 * Open the application at its root. This is the single entry point; every other
 * page is reached by clicking through the UI (see navTab / openAddSpoolModal).
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expectAppShell(page);
  await expect(page).toHaveTitle("Library | Spoolman");
}

/**
 * Click a top-bar navigation tab and wait for its page to take over.
 *
 * Each route sets its own <title> from `documentTitle.*`, which is the cheapest
 * proof that the new page component actually mounted (rather than the tab
 * merely being highlighted).
 */
export async function navTab(page: Page, label: string, title: string): Promise<void> {
  await onlyVisible(page.getByRole("link", { name: label, exact: true })).click();
  await expect(page).toHaveTitle(title);
  await expectAppShell(page);
}

/**
 * Open the "Add spools" modal from the top bar and return the dialog.
 *
 * Scoped to the header because an empty library also renders an "Add spools"
 * call-to-action in the list body.
 */
export async function openAddSpoolModal(page: Page): Promise<Locator> {
  await onlyVisible(page.locator("header").getByRole("button", { name: "Add spools" })).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Locate a numeric input in the add-spool modal by its field label.
 *
 * NumberInput renders a bare <input> wrapped in a <label> together with stepper
 * buttons and an optional help toggle, so its accessible name picks up that
 * extra furniture and `getByLabel` can't match it exactly. We instead find the
 * form item whose label text *starts with* the given label — anchoring at the
 * start keeps "Weight" from also matching "Spool Weight".
 */
export function numberField(dialog: Locator, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return dialog
    .locator("label")
    .filter({ hasText: new RegExp(`^\\s*${escaped}\\b`) })
    .first()
    .locator("input")
    .first();
}
