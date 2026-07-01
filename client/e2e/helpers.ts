import type { Locator, Page } from "@playwright/test";

// Escape every regex metacharacter (incl. backslash) so a plain string can be
// embedded literally in a RegExp. These helpers build regexes from label/path
// strings; without this, a metacharacter in the input would change the match.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ant Design / refine buttons often pair an icon (which contributes its own
// aria-label, e.g. "save") with the visible label, so the accessible *name*
// becomes "save Save" and getByRole({ name: "Save" }) is unreliable across the
// custom (create) and refine-default (edit) forms. Matching on exact button TEXT
// (the icon's svg has no text content) is stable for both.
export const buttonByText = (page: Page, text: string): Locator =>
  page.locator("button").filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) });

export const saveButton = (page: Page): Locator => buttonByText(page, "Save");

// Match a URL by pathname, tolerating a trailing query/hash. The list pages persist
// table state into the URL hash (#pagination=...), which leaks onto subsequent
// navigations, so a plain "…/create$" regex is too strict.
export const atPath = (pathname: string): RegExp => new RegExp(`${escapeRegExp(pathname)}(?:[?#]|$)`);

// Submit a create/clone form and return the id from the POST response body.
export async function saveAndGetId(page: Page, resourcePath: string): Promise<number> {
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => new RegExp(`/api/v1/${escapeRegExp(resourcePath)}$`).test(r.url()) && r.request().method() === "POST",
    ),
    saveButton(page).click(),
  ]);
  const body = await res.json();
  return body.id as number;
}
