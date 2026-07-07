import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Calibration wizard journey (TESTING_STRATEGY "Remaining"): the wizard lives in a
// modal opened from the Calibration card on the filament show page. Mutations set
// successNotification: false, so assertions are on DOM state and API responses,
// never on toasts.

async function seedFilament(request: import("@playwright/test").APIRequestContext): Promise<number> {
  const res = await request.post(`${APP_BASE_URL}/api/v1/filament`, {
    data: { name: `Calib ${Date.now()}`, density: 1.24, diameter: 1.75, weight: 1000 },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id;
}

test.describe("calibration wizard journey", () => {
  test("start wizard → skip all steps → finish → history shows a complete session", async ({ page, request }) => {
    const filamentId = await seedFilament(request);
    // The Calibration card lives under the "Calibration" tab on the filament show
    // page; ?tab=calibration deep-links straight to it.
    await page.goto(`${APP_BASE_URL}/filament/show/${filamentId}?tab=calibration`);

    // The Calibration card renders inside the active tab.
    await expect(page.getByText("Calibration", { exact: true }).first()).toBeVisible();

    // Starting the wizard creates an in_progress session.
    const [createRes] = await Promise.all([
      page.waitForResponse((r) => /\/api\/v1\/calibration\/session$/.test(r.url()) && r.request().method() === "POST"),
      page.getByRole("button", { name: "Start Wizard" }).click(),
    ]);
    expect(createRes.ok()).toBeTruthy();
    const sessionId = (await createRes.json()).id as number;

    const modal = page.locator(".ant-modal-content").filter({ hasText: "Calibration Wizard" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText("1 / 9")).toBeVisible();

    // Skip through the 8 intermediate steps.
    for (let step = 1; step <= 8; step++) {
      await modal
        .locator("button")
        .filter({ hasText: /^Skip$/ })
        .click();
      await expect(modal.getByText(`${step + 1} / 9`)).toBeVisible();
    }

    // Last step: "Skip & Finish" pops a confirm whose OK button is "Finish";
    // confirming completes the session (PATCH status=complete).
    await modal
      .locator("button")
      .filter({ hasText: /^Skip & Finish$/ })
      .click();
    const [completeRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new RegExp(`/api/v1/calibration/session/${sessionId}$`).test(r.url()) && r.request().method() === "PATCH",
      ),
      page.locator(".ant-modal-confirm").getByRole("button", { name: "Finish" }).click(),
    ]);
    expect(completeRes.ok()).toBeTruthy();
    expect((await completeRes.json()).status).toBe("complete");

    // Back on the card: the session shows up under Calibration History as Complete.
    await expect(modal).toBeHidden();
    await expect(page.getByText("Calibration History")).toBeVisible();
    await expect(page.locator(".ant-collapse").getByText("Complete").first()).toBeVisible();
  });

  test("cancel keeps the session in progress and the card offers to resume", async ({ page, request }) => {
    const filamentId = await seedFilament(request);
    await page.goto(`${APP_BASE_URL}/filament/show/${filamentId}?tab=calibration`);

    await page.getByRole("button", { name: "Start Wizard" }).click();
    const modal = page.locator(".ant-modal-content").filter({ hasText: "Calibration Wizard" });
    await expect(modal).toBeVisible();

    await modal
      .locator("button")
      .filter({ hasText: /^Cancel$/ })
      .click();
    await expect(modal).toBeHidden();

    // The in_progress session persists, so the entry button now resumes it.
    await expect(page.getByRole("button", { name: /Resume Wizard/ })).toBeVisible();
  });
});
