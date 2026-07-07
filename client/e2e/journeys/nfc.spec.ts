import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// The NFC bind/encode modals on the spool show page. Web NFC isn't available in
// headless Chromium, but the modals still render (encode prepares the TigerTag
// binary and offers the browser/download fallbacks), which is what we cover here.

test.describe("NFC modals journey", () => {
  test("bind and encode modals open from the spool show page", async ({ page, request }) => {
    const fil = await (
      await request.post(`${APP_BASE_URL}/api/v1/filament`, {
        data: { name: `Nfc ${Date.now()}`, density: 1.24, diameter: 1.75, weight: 1000 },
      })
    ).json();
    const spool = await (await request.post(`${APP_BASE_URL}/api/v1/spool`, { data: { filament_id: fil.id } })).json();

    await page.goto(`${APP_BASE_URL}/spool/show/${spool.id}`);

    // Link (bind) modal — the trigger now lives in the "Labels & Tags" overflow menu.
    await page.getByRole("button", { name: /Labels & Tags/ }).click();
    await page.getByRole("menuitem", { name: /Link NFC Tag/ }).click();
    await expect(page.getByText("Link NFC Tag to Spool")).toBeVisible();
    await page.locator(".ant-modal-close").first().click();
    await expect(page.getByText("Link NFC Tag to Spool")).toBeHidden();

    // Encode modal — reopen the menu (it closes after selecting an item).
    await page.getByRole("button", { name: /Labels & Tags/ }).click();
    await page.getByRole("menuitem", { name: /Encode to NFC/ }).click();
    await expect(page.getByText("Encode Spool to NFC Tag")).toBeVisible();
  });
});
