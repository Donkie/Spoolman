import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// A custom (extra) field seeded via the API must surface both in the settings
// manager table and as a real control on the spool create form.

test.describe("extra fields journey", () => {
  test("seeded field shows in settings and on the create form", async ({ page, request }) => {
    const stamp = Date.now();
    const key = `e2e_note_${stamp}`;
    const name = `E2E Note ${stamp}`;
    const res = await request.post(`${APP_BASE_URL}/api/v1/field/spool/${key}`, {
      data: { name, field_type: "text" },
    });
    expect(res.ok()).toBeTruthy();

    // Settings extra-fields manager lists the field.
    await page.goto(`${APP_BASE_URL}/settings/extra/spool`);
    await expect(page.getByText(name).first()).toBeVisible();

    // The spool create form renders the field as a labelled control.
    await page.goto(`${APP_BASE_URL}/spool/create`);
    await expect(page.getByLabel(name)).toBeVisible();
  });
});
