import { test, expect } from "./fixtures";
import { addFilter, createSpoolViaModal, navTab, onlyVisible, openApp, openToolbarMenu, searchFor, unique } from "./helpers";

/**
 * The library's find-things subsystem: the top-bar cross-entity search, and the
 * toolbar's group / filter / sort controls. All of it is new in client_v2 — the
 * legacy client had an Ant Design table with per-column filters instead — and
 * all of it is backed by real API calls (`/search`, the distinct-value endpoints
 * behind the filter menu, and the sorted/filtered spool query itself), so it can
 * only be verified against a running backend.
 *
 * The specs share one pair of spools created up front, which is why they run
 * serially: creating them is the slowest part by far, and the assertions are all
 * read-only.
 */

// Two spools that differ in every dimension the toolbar can group or filter by.
const first = {
  vendorName: unique("SearchVendor"),
  filamentName: unique("SearchFilament"),
  locationName: unique("SearchShelf"),
  material: "PLA",
  weightG: 1000,
};
const second = {
  vendorName: unique("OtherVendor"),
  filamentName: unique("OtherFilament"),
  locationName: unique("OtherShelf"),
  material: "PETG",
  weightG: 750,
};

test.describe.configure({ mode: "serial" });

test("create the spools the search and toolbar tests work with", async ({ page }) => {
  await openApp(page);
  await createSpoolViaModal(page, first);
  await createSpoolViaModal(page, second);

  // Both landed. Checked through the search rather than the list because the list
  // is paginated: on an instance that already holds a few pages of spools, a new
  // one is not necessarily on the page you are looking at.
  for (const { filamentName } of [first, second]) {
    const panel = await searchFor(page, filamentName);
    await expect(panel.getByText(filamentName, { exact: true }).first()).toBeVisible();
  }
});

test("the top-bar search covers all three entities", async ({ page }) => {
  await openApp(page);

  await test.step("a filament name lands in the Filaments section", async () => {
    const panel = await searchFor(page, first.filamentName);
    await expect(panel.getByText("Filaments", { exact: true })).toBeVisible();
    await expect(panel.getByText(first.filamentName, { exact: true }).first()).toBeVisible();

    // The other filament is not a match — the search really did filter, rather
    // than the panel listing everything.
    await expect(panel.getByText(second.filamentName, { exact: true })).toHaveCount(0);
  });

  await test.step("a manufacturer name lands in the Manufacturers section", async () => {
    const panel = await searchFor(page, first.vendorName);
    await expect(panel.getByText("Manufacturers", { exact: true })).toBeVisible();
    await expect(panel.getByText(first.vendorName, { exact: true }).first()).toBeVisible();
  });

  await test.step("a location lands in the Spools section", async () => {
    // Spools match on their own text — comment, location, lot number and text
    // extra fields — not on their filament's name, so the location is what finds
    // an individual spool.
    const panel = await searchFor(page, first.locationName);
    await expect(panel.getByText("Spools", { exact: true })).toBeVisible();
    await expect(panel.getByText(first.locationName, { exact: true })).toBeVisible();
  });
});

test("a filament result offers its spools as shortcuts", async ({ page }) => {
  // Issue #993: a spool only matches on its own text, so searching a filament
  // name used to be a dead end — the hit named the filament you own but gave no
  // way to reach any of its spools. Each filament hit now carries the first few.
  const many = {
    vendorName: unique("PillVendor"),
    filamentName: unique("PillFilament"),
    locationName: unique("PillShelf"),
    count: 6,
  };

  await openApp(page);
  await createSpoolViaModal(page, many);

  const panel = await searchFor(page, many.filamentName);
  await expect(panel.getByText(many.filamentName, { exact: true })).toBeVisible();

  // Six spools, five pills: the rest are behind an overflow link to the filament,
  // which lists all of them.
  const pills = panel.locator(".pills a:not(.more)");
  await expect(pills).toHaveCount(5);
  await expect(pills.first()).toHaveText(/^#\d+/);
  await expect(panel.locator(".pills a.more")).toHaveText("+1 more");

  // The point of the whole thing: one click from a filament name to a spool.
  await pills.first().click();
  await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);
  await expect(panel).toBeHidden();
});

test("a search that matches nothing says so", async ({ page }) => {
  await openApp(page);

  const panel = await searchFor(page, unique("NoSuchThing"));
  await expect(panel.getByText("No matches found")).toBeVisible();
});

test("opening a search result navigates to its inspector", async ({ page }) => {
  await openApp(page);

  const panel = await searchFor(page, first.locationName);
  await panel.getByRole("link").filter({ hasText: first.locationName }).first().click();

  // Results are links, not buttons, so they carry the selection in the URL: the
  // inspector is a shareable, back-button-able view of the library.
  await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);
  await expect(panel).toBeHidden();
});

test("grouping the library by location and by manufacturer", async ({ page }) => {
  await openApp(page);

  // Narrow the list to this spec's two spools first. The library is paginated, so
  // on an instance with real data in it an unfiltered assertion about a specific
  // group would depend on where that group happened to land.
  await addFilter(page, "Location", first.locationName);
  await addFilter(page, "Location", second.locationName);

  await test.step("group by location", async () => {
    const menu = await openToolbarMenu(page, "Group");
    await menu.getByRole("button", { name: "Location", exact: true }).click();

    // Each spool's location becomes a group header, and the control reports the
    // mode it is in.
    await expect(onlyVisible(page.getByRole("button", { name: /^Group:\s*Location/ }))).toBeVisible();
    await expect(page.getByText(first.locationName, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(second.locationName, { exact: true }).first()).toBeVisible();
  });

  await test.step("group by manufacturer", async () => {
    const menu = await openToolbarMenu(page, "Group");
    await menu.getByRole("button", { name: "Manufacturer", exact: true }).click();

    await expect(onlyVisible(page.getByRole("button", { name: /^Group:\s*Manufacturer/ }))).toBeVisible();
    await expect(page.getByText(first.vendorName, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(second.vendorName, { exact: true }).first()).toBeVisible();
  });

  await test.step("the grouping survives a reload", async () => {
    // Group/sort/filter live in the URL, so the view is shareable and a reload
    // lands on the same list.
    await page.reload();
    await expect(onlyVisible(page.getByRole("button", { name: /^Group:\s*Manufacturer/ }))).toBeVisible();
  });

  await test.step("and survives leaving the library and coming back", async () => {
    // The nav tab links to a bare `/`, which carries no view state at all, so the
    // grouping comes back from the browser's remembered view instead (#1036).
    // The filters deliberately do not come back: they hide spools, and one
    // silently restored later reads as missing data rather than as a preference.
    await navTab(page, "Settings", "Settings | Spoolman");
    await navTab(page, "Library", "Library | Spoolman");

    await expect(onlyVisible(page.getByRole("button", { name: /^Group:\s*Manufacturer/ }))).toBeVisible();
    await expect(page.getByRole("button", { name: `Location: ${first.locationName}` })).toHaveCount(0);

    // Restored by NAVIGATING to the URL that spells the view out, not by holding
    // it off to one side: the address bar still describes what is on screen, so
    // the view stays linkable.
    await expect(page).toHaveURL(/[?&]group=vendor/);
  });

  await test.step("and the default grouping is still selectable afterwards", async () => {
    // The restored view had to become a real URL for this to work. While it was
    // only implied, choosing the default grouping serialised back to the very
    // same bare URL, and an unchanged URL doesn't re-run the load — so the
    // control silently refused to move.
    const menu = await openToolbarMenu(page, "Group");
    await menu.getByRole("button", { name: "Filament", exact: true }).click();

    await expect(onlyVisible(page.getByRole("button", { name: /^Group:\s*Filament/ }))).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]group=/);
  });
});

test("filtering the library by location narrows it, and the chip clears it", async ({ page }) => {
  await openApp(page);

  await test.step("filter on both spools' locations", async () => {
    // The Filter menu is two levels: choose the property, then one of its values.
    // The values come from the backend's distinct-location endpoint, so our new
    // locations only appear there if the spools really were persisted. Two values
    // of the same property are an OR, so this narrows the list to exactly ours.
    await addFilter(page, "Location", first.locationName);
    await addFilter(page, "Location", second.locationName);

    await expect(page.getByText(first.filamentName, { exact: true })).toBeVisible();
    await expect(page.getByText(second.filamentName, { exact: true })).toBeVisible();
  });

  await test.step("clicking a chip removes just that filter", async () => {
    await page.getByRole("button", { name: `Location: ${second.locationName}` }).click();

    await expect(page.getByRole("button", { name: `Location: ${second.locationName}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Location: ${first.locationName}` })).toBeVisible();

    await expect(page.getByText(first.filamentName, { exact: true })).toBeVisible();
    await expect(page.getByText(second.filamentName, { exact: true })).toHaveCount(0);
  });
});

test("filtering the library by a date range", async ({ page }) => {
  await openApp(page);

  // Pin the list to this spec's spools first; the library is paginated.
  await addFilter(page, "Location", first.locationName);

  const openDateMenu = async () => {
    const menu = await openToolbarMenu(page, "Filter");
    await menu.getByRole("button", { name: "Registered", exact: true }).click();
    return menu;
  };

  await test.step("a preset range narrows the list", async () => {
    // These spools were created seconds ago, so "the last 24 hours" keeps them and
    // "older than a year" cannot. Registered is the one timestamp every spool has.
    const menu = await openDateMenu();
    await menu.getByRole("button", { name: "Last 24 hours", exact: true }).click();

    await expect(page.getByRole("button", { name: "Registered: Last 24 hours" })).toBeVisible();
    await expect(page.getByText(first.filamentName, { exact: true })).toBeVisible();
  });

  await test.step("the range stays relative across a reload", async () => {
    // The URL carries the range itself, not the instant it resolved to, so a
    // reloaded (or shared) view re-asks the question against the current clock.
    await expect(page).toHaveURL(/registered(:|%3A)-24h/);
    await page.reload();

    await expect(page.getByRole("button", { name: "Registered: Last 24 hours" })).toBeVisible();
    await expect(page.getByText(first.filamentName, { exact: true })).toBeVisible();
  });

  await test.step("picking another range replaces it instead of stacking", async () => {
    const menu = await openDateMenu();
    await menu.getByRole("button", { name: "Older than 1 year", exact: true }).click();

    await expect(page.getByRole("button", { name: "Registered: Older than 1 year" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registered: Last 24 hours" })).toHaveCount(0);
    // Nothing this new can be a year old, so the list empties out.
    await expect(page.getByText(first.filamentName, { exact: true })).toHaveCount(0);
  });

  await test.step("a custom range with an open end", async () => {
    // Leaving the "to" field empty is what makes the range open-ended, which is
    // the whole reason the custom range is two separate fields.
    const menu = await openDateMenu();
    await menu.locator('input[type="date"]').first().fill("2020-01-01");
    await menu.getByRole("button", { name: "Apply", exact: true }).click();

    // The date is rendered through Intl, so its order is the locale's business
    // ("Jan 1, 2020" / "1 Jan 2020"); only the phrasing around it is ours.
    const chip = page.getByRole("button", { name: /^Registered: Since .*2020/ });
    await expect(chip).toBeVisible();
    await expect(page.getByText(first.filamentName, { exact: true })).toBeVisible();
  });

  await test.step("the chip clears the range again", async () => {
    await page.getByRole("button", { name: /^Registered: Since .*2020/ }).click();

    await expect(page.getByRole("button", { name: /^Registered:/ })).toHaveCount(0);
    await expect(page.getByText(first.filamentName, { exact: true })).toBeVisible();
  });
});

test("changing the sort survives a reload and keeps the list working", async ({ page }) => {
  await openApp(page);
  await addFilter(page, "Location", first.locationName);

  const menu = await openToolbarMenu(page, "Sort");
  // The sort menu is built from the spool field metadata fetched over the API and
  // split into Spool / Filament / Manufacturer / Extra fields sections.
  await expect(menu.getByText("Filament", { exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "Material", exact: true }).click();

  await expect(onlyVisible(page.getByRole("button", { name: /^Sort:\s*Material/ }))).toBeVisible();

  // The backend can only order *groups* three ways, so a sort it can't apply to a
  // grouped list flattens the view rather than showing a silently wrong order.
  await expect(onlyVisible(page.getByRole("button", { name: /^Group:\s*None/ }))).toBeVisible();

  // A sort key the backend rejects would 400 and drop the list into its error
  // state, so re-asserting the rows is what proves the query was valid.
  await expect(page.getByText("Couldn't reach the Spoolman API. Is the backend running?")).toHaveCount(0);
  await expect(page.getByRole("link").filter({ hasText: first.filamentName })).toHaveCount(1);

  await page.reload();
  await expect(onlyVisible(page.getByRole("button", { name: /^Sort:\s*Material/ }))).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: first.filamentName })).toHaveCount(1);
});
