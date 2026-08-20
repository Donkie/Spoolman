import { test, expect } from "./fixtures";
import { openApp, openToolbarMenu } from "./helpers";

/**
 * Searchable toolbar menus (#1045).
 *
 * The Library's sort and filter menus grow with the install: every custom extra
 * field adds a sort field and a filter property, and a filter's values are the
 * whole library's filaments, locations and lot numbers. Past a point they can
 * only be scrolled, so each long list carries a search box.
 *
 * Everything asserted here holds on an empty database — the sort menu ships 18
 * fixed fields and the filter menu 9 properties, both already past the length
 * that earns a box, while the group menu's five fixed entries never do. The
 * matching rules themselves are unit-tested (client_v2 src/lib/utils/match.test.ts);
 * what needs a browser is that the box appears on the right lists, narrows them,
 * and that the keyboard works.
 */

/** The search box inside an open toolbar menu. */
const searchBox = (menu: import("@playwright/test").Locator) =>
  menu.getByRole("textbox", { name: "Search" });

/** The labels of a menu's currently visible entries. */
async function itemLabels(menu: import("@playwright/test").Locator): Promise<string[]> {
  return (await menu.locator(".menu-item").allInnerTexts()).map((t) => t.trim());
}

test("the sort menu is searchable, and Enter takes the first match", async ({ page }) => {
  await openApp(page);
  const menu = await openToolbarMenu(page, "Sort");

  // Opened with a pointer, the box takes focus so the menu can be typed at
  // straight away.
  await expect(searchBox(menu)).toBeFocused();

  await searchBox(menu).fill("temp");
  expect(await itemLabels(menu)).toEqual(["Extruder Temp\n°C", "Bed Temp\n°C"]);

  // A section survives only as long as one of its fields does.
  await expect(menu.getByText("Filament", { exact: true })).toBeVisible();
  await expect(menu.getByText("Spool", { exact: true })).toBeHidden();

  // Enter applies the first field still listed.
  await searchBox(menu).press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.locator(".chip.sort")).toContainText("Extruder Temp");
});

test("a query that matches nothing says so rather than emptying the menu", async ({ page }) => {
  await openApp(page);
  const menu = await openToolbarMenu(page, "Sort");

  await searchBox(menu).fill("nothingmatchesthis");
  expect(await itemLabels(menu)).toEqual(["No matches found"]);

  // Escape clears the query first, and only closes the menu once it is empty —
  // so a mistyped query costs one key, not the whole menu.
  await searchBox(menu).press("Escape");
  await expect(searchBox(menu)).toHaveValue("");
  await expect(menu).toBeVisible();

  await searchBox(menu).press("Escape");
  await expect(menu).toBeHidden();
});

test("the filter menu searches its properties, archived included", async ({ page }) => {
  await openApp(page);
  const menu = await openToolbarMenu(page, "Filter");

  await searchBox(menu).fill("lot");
  // A substring match, not a fuzzy one: "Location" contains those letters in
  // order but not together, and must not be offered here.
  expect(await itemLabels(menu)).toEqual(["Lot Nr"]);

  // "Show Archived" is a filter like any other and answers to the same box.
  await searchBox(menu).fill("arch");
  expect(await itemLabels(menu)).toEqual(["Show Archived"]);

  // Every move between lists starts a fresh query, because the one that found a
  // property says nothing about its values. Stepping into Material and back out
  // must therefore leave the property list unnarrowed. (On an empty database
  // Material itself has no values to offer, and so no box of its own — which is
  // the same rule seen from the other side: a list too short to scroll gets no
  // search box.)
  await searchBox(menu).fill("material");
  await menu.locator(".menu-item").first().click();
  const back = menu.getByRole("button", { name: "Material" });
  await expect(back).toBeVisible();
  await expect(searchBox(menu)).toHaveCount(0);

  await back.click();
  await expect(searchBox(menu)).toHaveValue("");
  expect(await itemLabels(menu)).toContain("Location");
});

test("the group menu is short enough to need no search box", async ({ page }) => {
  await openApp(page);
  const menu = await openToolbarMenu(page, "Group");

  await expect(menu.getByRole("button", { name: "None (flat)" })).toBeVisible();
  await expect(searchBox(menu)).toHaveCount(0);
});
