import { test, expect } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

/**
 * Re-pointing a spool at a different filament (issue #1010).
 *
 * The whole point of the feature is what does *not* change: people who organise
 * their shelves by spool number replace the roll in slot #37 and need slot #37 to
 * still be slot #37 afterwards. So the assertions here are as much about the id
 * and location surviving as about the filament actually swapping.
 *
 * It also covers the weight decision the dialog puts in front of the user: a
 * spool created from a filament records that filament's full weight as its own,
 * and would otherwise keep the old figure forever — this client has no other
 * field for it.
 */
test("change which filament a spool holds, keeping the spool itself", async ({ page }) => {
  const vendorName = unique("Vendor");
  const oldFilament = unique("OldFilament");
  const newFilament = unique("NewFilament");
  const locationName = unique("Shelf");

  await openApp(page);

  // The spool under test: 1000 g net, 250 g of it already used (750 g left).
  await createSpoolViaModal(page, { vendorName, filamentName: oldFilament, locationName, weightG: 1000, usedG: 250 });
  // The filament it will be changed to, on a 750 g spool. Creating it through the
  // modal also creates a spool of its own, which this test simply ignores. It gets
  // its own manufacturer because the helper asserts the new-manufacturer hint.
  await createSpoolViaModal(page, {
    vendorName: unique("Vendor"),
    filamentName: newFilament,
    locationName: unique("Shelf"),
    weightG: 750,
  });

  // Open the first spool's inspector by searching for its location — the library
  // is paginated, so clicking a row found by search is the reliable way in.
  const panel = await searchFor(page, locationName);
  await panel.getByRole("link").filter({ hasText: locationName }).first().click();
  await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);

  const inspector = page.locator(".insp");
  await expect(inspector).toContainText(oldFilament);
  // The spool number this whole feature exists to preserve.
  const spoolId = (await inspector.locator(".idmono").first().innerText()).trim();
  expect(spoolId).toMatch(/^#\d+$/);

  await test.step("pick the new filament", async () => {
    await inspector.getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The spool's current filament is listed but not selectable — changing to
    // what it already holds is not a change.
    await expect(dialog.getByText("current", { exact: true })).toBeVisible();

    await dialog.locator("input.search-big").fill(newFilament);
    await dialog.locator(".res-item").filter({ hasText: newFilament }).first().click();

    // The spool recorded the old filament's 1000 g as its own full weight, so the
    // dialog offers to take the new filament's 750 g instead. Checked by default;
    // the 250 g already used is kept either way, leaving 500 g.
    const adopt = dialog.getByRole("checkbox");
    await expect(adopt).toBeChecked();
    await expect(dialog).toContainText("750 g");
    await expect(dialog).toContainText("500 g");

    await dialog.getByRole("button", { name: "Change filament", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("the spool is the same spool, holding the new filament", async () => {
    await expect(inspector).toContainText(newFilament);
    await expect(inspector).not.toContainText(oldFilament);
    // Same number, same shelf: nothing about the spool itself moved. Location is
    // an editable combobox in the inspector, so it is read as an input value.
    await expect(inspector.locator(".idmono").first()).toHaveText(spoolId);
    await expect(inspector.getByRole("combobox").first()).toHaveValue(locationName);
    // 750 g full, 250 g used.
    await expect(inspector.locator(".gauge")).toContainText("500");
    await expect(inspector.locator(".gauge")).toContainText("750 g");
  });

  await test.step("the change survives a reload", async () => {
    await page.reload();
    await expect(inspector).toContainText(newFilament);
    await expect(inspector.locator(".idmono").first()).toHaveText(spoolId);
  });
});
