import { test, expect, type Page } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

/**
 * Re-filing a filament under a different manufacturer.
 *
 * The manufacturer used to be decided once, in the add-spool modal, and there was
 * no way back: a filament created under the wrong brand — or under none — stayed
 * there, and since the library groups by manufacturer that mis-files every spool
 * of it. This is the companion of `change-filament.spec.ts` one level up.
 *
 * The three paths through the picker are all covered here because they are three
 * different requests: an existing manufacturer, one created on the spot, and
 * none at all (which is a `vendor_id: null` PATCH — the only way to clear it, and
 * the case a dropped key would silently turn into a no-op).
 *
 * It also covers the consequence the dialog exists to spell out: a filament with
 * no empty spool weight of its own takes its manufacturer's, and that is the
 * number `PUT /spool/{id}/measure` subtracts from a reading off the scale.
 */

/** The inspector's edits are debounced, so wait on the request, not on a sleep. */
function patched(page: Page, entity: "vendor" | "filament"): Promise<unknown> {
  return page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(`/${entity}/`));
}

test("change which manufacturer a filament is filed under", async ({ page }) => {
  const oldVendor = unique("OldVendor");
  const newVendor = unique("NewVendor");
  const createdVendor = unique("CreatedVendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);

  // The filament under test, and a second manufacturer for it to move to. The
  // second spool is only there to bring `newVendor` into existence.
  await createSpoolViaModal(page, { vendorName: oldVendor, filamentName, locationName, weightG: 1000 });
  await createSpoolViaModal(page, {
    vendorName: newVendor,
    filamentName: unique("OtherFilament"),
    locationName: unique("OtherShelf"),
  });

  const inspector = page.locator(".insp");

  await test.step("give the new manufacturer an empty spool weight", async () => {
    // Both manufacturers are created by name alone, so neither has one yet. This
    // is what makes the change visible below: the filament has no tare weight of
    // its own, so whatever its manufacturer says is what applies to it.
    // Picked by the destination in the href: a manufacturer's name also appears
    // under its filaments in the results, so matching on text alone opens one of
    // those instead.
    const panel = await searchFor(page, newVendor);
    await panel.locator('a[href*="sel=vendor"]').filter({ hasText: newVendor }).first().click();
    await expect(page).toHaveURL(/[?&]sel=vendor(:|%3A)\d+/);

    const saved = patched(page, "vendor");
    await inspector.getByRole("spinbutton", { name: "Empty Spool Weight" }).fill("250");
    await inspector.getByRole("spinbutton", { name: "Empty Spool Weight" }).blur();
    await saved;
  });

  await test.step("open the filament", async () => {
    const panel = await searchFor(page, filamentName);
    await panel.locator('a[href*="sel=filament"]').filter({ hasText: filamentName }).first().click();
    await expect(page).toHaveURL(/[?&]sel=filament(:|%3A)\d+/);
    await expect(inspector).toContainText(oldVendor);
  });

  // The id this filament keeps throughout: nothing below deletes and re-creates it.
  const filamentUrl = page.url();

  await test.step("move it to a manufacturer that already exists", async () => {
    await inspector.getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The one it is filed under now is listed but not selectable.
    await expect(dialog.getByText("current", { exact: true })).toBeVisible();

    await dialog.locator("input.search-big").fill(newVendor);
    await dialog.locator(".res-item").filter({ hasText: newVendor }).first().click();

    // The filament has no empty spool weight of its own, so it inherits the new
    // manufacturer's 250 g — the dialog says so before anything is written.
    // Asserted on the note rather than the dialog: the picked row shows 250 g too.
    await expect(dialog.locator(".note")).toContainText("250 g");

    await dialog.getByRole("button", { name: "Change manufacturer", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Same filament, new manufacturer — and the spool it holds has not moved.
    await expect(inspector).toContainText(newVendor);
    await expect(inspector).not.toContainText(oldVendor);
    await expect(inspector).toContainText(locationName);
    expect(page.url()).toBe(filamentUrl);
  });

  await test.step("the change survives a reload", async () => {
    await page.reload();
    await expect(inspector).toContainText(newVendor);
    await expect(inspector).not.toContainText(oldVendor);
  });

  await test.step("move it to a manufacturer that does not exist yet", async () => {
    await inspector.getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator("input.search-big").fill(createdVendor);
    // No manufacturer of that name, so the picker offers to create one.
    await dialog.getByRole("button", { name: `Create “${createdVendor}”` }).click();

    // Going the other way: the filament was inheriting 250 g and the new
    // manufacturer has none, so it is about to be left without one.
    await expect(dialog.locator(".note")).toContainText("250 g");

    await dialog.getByRole("button", { name: "Change manufacturer", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(inspector).toContainText(createdVendor);
    await expect(inspector).not.toContainText(newVendor);
  });

  await test.step("the created manufacturer is a real one", async () => {
    // It has its own detail view, reachable by search — so it was created through
    // the API rather than merely named in the filament's request.
    const panel = await searchFor(page, createdVendor);
    await expect(panel.getByText("Manufacturers", { exact: true })).toBeVisible();
    await expect(panel.getByText(createdVendor, { exact: true }).first()).toBeVisible();
    await page.goto(filamentUrl);
    await expect(inspector).toContainText(createdVendor);
  });

  await test.step("leave it with no manufacturer at all", async () => {
    await inspector.getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator(".res-item").filter({ hasText: "No manufacturer" }).first().click();
    await dialog.getByRole("button", { name: "Change manufacturer", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(inspector).not.toContainText(createdVendor);
    await expect(inspector).toContainText("No manufacturer");

    // Cleared on the server, not just in the cache: a null vendor_id is the whole
    // point of this path, and a dropped key would have left it untouched.
    await page.reload();
    await expect(inspector).not.toContainText(createdVendor);
    await expect(inspector).toContainText("No manufacturer");
    // The filament itself came through all three changes intact.
    await expect(inspector).toContainText(filamentName);
    await expect(inspector).toContainText(locationName);

    // And it is not a one-way door: the action is still there on a filament with
    // no manufacturer, which is the only way one ever gets given one.
    await expect(inspector.getByRole("button", { name: "Change", exact: true })).toBeVisible();
  });
});
