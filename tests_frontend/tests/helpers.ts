import { Page, expect } from "@playwright/test";

/**
 * Generate a unique-ish suffix so repeated runs against the same (persistent)
 * database don't collide. Includes a non-ASCII marker, matching the repo's
 * habit of using åäö as an encoding canary in text fields.
 */
export function unique(prefix: string): string {
  return `${prefix}-åäö-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Assert that a Spoolman page has actually rendered rather than crashed or got
 * stuck on the loadable fallback. The sidebar title "Spoolman" is present on
 * every route inside the app shell.
 */
export async function expectAppShell(page: Page): Promise<void> {
  await expect(page.getByText("Spoolman").first()).toBeVisible();
  await expect(page.getByText("Page is Loading...")).toHaveCount(0);
}

/**
 * Open the application at its root. This is the single entry point; every other
 * page is reached by clicking through the UI (see navSidebar / clickCreate).
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expectAppShell(page);
}

/**
 * Click a sidebar menu entry, located by its link target rather than its label
 * so navigation is independent of the active language.
 */
export async function navSidebar(page: Page, href: string): Promise<void> {
  await page.locator(`.ant-menu-item a[href="${href}"]`).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
  await expectAppShell(page);
}

/**
 * Click the "Create" button on a resource list page. Refine renders it as a
 * link to `/{resource}/create`, so we target that href (language-independent).
 */
export async function clickCreate(page: Page, resourcePath: string): Promise<void> {
  await page.locator(`a[href="${resourcePath}/create"]`).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`${resourcePath}/create`);
  // Wait for the list page (and its table column headers) to finish unmounting
  // before the caller touches the form, otherwise a field locator can transiently
  // match a stale table header (e.g. the "Name" column) during the transition.
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
}

/**
 * Pick an option from an Ant Design <Select>, located by its field label.
 *
 * The option is matched by its visible text and clicked via the concrete
 * `.ant-select-item-option` element rather than the ARIA `option` role: Ant
 * Design sets each option's accessible name to the underlying value (e.g. the
 * row id), and the role node does not settle as a stable click target.
 */
export async function selectAntdOption(page: Page, label: string, optionText: string): Promise<void> {
  const combo = page.getByLabel(label, { exact: true });
  await combo.click();
  // Type to filter: narrows the (sometimes long, async-loading) option list down
  // to a stable single match before clicking. Ant Design re-renders the list as
  // options stream in, which otherwise leaves the option an unstable click target.
  await combo.fill(optionText);
  await page.locator(".ant-select-item-option").filter({ hasText: optionText }).first().click();
}

/**
 * Fill an Ant Design numeric input located by its form-item label.
 *
 * Used for inputs that aren't bound to a form field name (so they have no
 * label/input association and can't be reached with getByLabel), such as the
 * spool weight inputs. The form item is identified by its label element to
 * avoid matching unrelated items that merely mention the same words.
 */
export async function fillAntdNumberByLabel(page: Page, label: string, value: string): Promise<void> {
  const formItem = page
    .locator(".ant-form-item")
    .filter({ has: page.locator(".ant-form-item-label label", { hasText: label }) });
  await formItem.locator("input").first().fill(value);
}
