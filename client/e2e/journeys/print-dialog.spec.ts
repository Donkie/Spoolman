import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Print-dialog permutations (TESTING_STRATEGY "Remaining"): the spool-select step
// (select-all, empty-selection error) and the QR dialog's template editing with its
// live label preview. The real Print button opens the browser print dialog, so it
// is asserted visible but never clicked.

async function seedSpool(request: import("@playwright/test").APIRequestContext, name: string): Promise<number> {
  const fil = await (
    await request.post(`${APP_BASE_URL}/api/v1/filament`, {
      data: { name, density: 1.24, diameter: 1.75, weight: 1000 },
    })
  ).json();
  const spool = await (await request.post(`${APP_BASE_URL}/api/v1/spool`, { data: { filament_id: fil.id } })).json();
  return spool.id as number;
}

test.describe("print dialog journeys", () => {
  test("spool selection step: empty-selection error, select all, continue to the dialog", async ({ page, request }) => {
    await seedSpool(request, `PrintSel ${Date.now()}`);

    // Without ?spools=… the printing page starts on the selection step.
    await page.goto(`${APP_BASE_URL}/spool/print`);
    await expect(page.getByText("Select spools to print labels for.")).toBeVisible();

    // Continuing with nothing selected is rejected with a message.
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText("You have not selected any spools.")).toBeVisible();

    // Select/Unselect All checks every row and enables progress to the QR dialog.
    await page.getByText("Select/Unselect All").click();
    await expect(page.getByText(/spools? selected/)).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("button", { name: /Print/ }).first()).toBeVisible();
  });

  test("label template edits update the rendered preview", async ({ page, request }) => {
    const spoolId = await seedSpool(request, `PrintTpl ${Date.now()}`);

    await page.goto(`${APP_BASE_URL}/spool/print?spools=${spoolId}`);
    await expect(page.getByRole("button", { name: /Print/ }).first()).toBeVisible();

    // The template editor lives in the collapsed "Content Settings" panel.
    await page.getByText("Content Settings", { exact: true }).click();

    // Replace the template with a marker that interpolates the spool id and
    // verify the live preview renders the interpolated text.
    const template = page.locator("textarea").first();
    await template.fill("E2E-MARKER {id}");
    await expect(page.getByText(`E2E-MARKER ${spoolId}`).first()).toBeVisible();

    // The template help "Show" button opens the tag-reference modal.
    await page.getByRole("button", { name: /^Show$/ }).click();
    await expect(page.locator(".ant-modal-content").last()).toBeVisible();
  });
});
