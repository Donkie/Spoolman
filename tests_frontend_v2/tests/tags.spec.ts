import { APIRequestContext, Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { createSpoolViaModal, navTab, openApp, searchFor, unique } from "./helpers";

/**
 * NFC/RFID tags: linking one to a spool, and reacting to a reader that scans it.
 *
 * The whole feature is reachable without any NFC hardware, which is the point of
 * the reader contract being a plain `POST /api/v1/tag/scan`: these tests are a
 * reader. What they cannot cover is Web NFC — reading a tag with the phone
 * running the browser — because there is no way to present a physical tag to a
 * headless Chromium. That path is verified by hand on an Android device; the
 * control is absent rather than disabled everywhere else, which is itself
 * asserted below.
 */

/**
 * Where the REST API lives. Same origin as the app in a normal deployment, but
 * overridable so the suite can also run against a vite dev server talking to a
 * backend on another port.
 */
const API_BASE =
  process.env.SPOOLMAN_API_URL ?? `${process.env.SPOOLMAN_BASE_URL ?? "http://localhost:8001"}/api/v1`;

let readerCounter = 0;

/**
 * A UID no other run has used. Tags are globally unique and never expire, so a
 * hard-coded one would be linked to some spool from a previous run the second
 * time the suite is pointed at a persistent database — and the specs below turn
 * on whether a UID is free or taken.
 */
function uniqueUid(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
}

/**
 * Report a tag scan, exactly as a reader-side agent would.
 *
 * Each call invents a new reader id unless given one. That is not incidental:
 * the server broadcasts an identical `(uid, reader_id)` pair only once every few
 * seconds, so that a reader re-reading a tag left sitting on it doesn't flood
 * every browser. Tests that poll — waiting for a socket that may still be
 * connecting — would otherwise have their retries swallowed by that debounce.
 */
async function scan(
  request: APIRequestContext,
  uid: string,
  opts: { readerId?: string; name?: string } = {},
): Promise<void> {
  const res = await request.post(`${API_BASE}/tag/scan`, {
    data: {
      uid,
      reader_id: opts.readerId ?? `test-reader-${++readerCounter}`,
      ...(opts.name ? { name: opts.name } : {}),
    },
  });
  expect(res.ok()).toBeTruthy();
}

/**
 * Keep scanning until the page reacts.
 *
 * The relay socket opens when something starts listening, and a scan sent into
 * the gap between "the dialog is on screen" and "its socket is connected" is
 * simply not delivered — there is no queue, and nothing to wait for from the
 * outside. Re-scanning until the expectation holds is what makes that race a
 * non-issue rather than a flake.
 */
async function scanUntil(
  request: APIRequestContext,
  uid: string,
  check: () => Promise<void>,
  opts: { readerId?: string; name?: string } = {},
): Promise<void> {
  await expect(async () => {
    await scan(request, uid, opts);
    await check();
  }).toPass({ timeout: 15000, intervals: [500, 500, 1000, 1000, 2000] });
}

/** Create one spool through the UI and open it, returning its inspector and id. */
async function createAndOpenSpool(page: Page): Promise<{ inspector: Locator; id: string }> {
  const locationName = unique("Shelf");
  await createSpoolViaModal(page, {
    vendorName: unique("Vendor"),
    filamentName: unique("Filament"),
    locationName,
  });

  const panel = await searchFor(page, locationName);
  await panel.getByRole("link").filter({ hasText: locationName }).first().click();
  await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);

  const id = /sel=spool(?::|%3A)(\d+)/.exec(page.url())?.[1];
  expect(id).toBeTruthy();
  return { inspector: page.locator(".insp"), id: id as string };
}

/** The inspector's Tags section: everything after its heading. */
function tagsSection(inspector: Locator): Locator {
  return inspector.locator(".col").filter({ hasText: "Tags" }).first();
}

async function openAddTag(inspector: Locator): Promise<Locator> {
  await tagsSection(inspector).getByRole("button", { name: "Add tag" }).click();
  const dialog = inspector.page().getByRole("dialog", { name: "Link a tag" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The UID is the whole of a tag's identity, and the same physical tag reports
 * itself differently on different readers — `04:a2:b3:c4` here, `04-A2-B3-C4`
 * there. The server normalizes so that all of those are one tag; what the client
 * has to get right is showing the canonical answer back rather than whatever was
 * typed, since otherwise one tag looks like several.
 */
test("a tag is linked by UID in any spelling, and listed in its canonical form", async ({ page }) => {
  // Reported the way a reader with colon separators and lowercase hex would.
  const uid = uniqueUid();
  const typed = (uid.match(/../g) as string[]).join(":").toLowerCase();

  await openApp(page);
  const { inspector } = await createAndOpenSpool(page);
  const tags = tagsSection(inspector);

  await expect(tags.getByText("No tags linked.")).toBeVisible();

  const dialog = await openAddTag(inspector);
  await dialog.getByLabel("Tag UID").fill(typed);

  await test.step("the dialog says what the UID resolves to before committing", async () => {
    await expect(dialog.getByText("This tag is not linked to anything yet.")).toBeVisible();
  });

  await dialog.getByRole("button", { name: "Link tag" }).click();
  await expect(dialog).toBeHidden();

  await test.step("the tag appears, spelled the way the server stores it", async () => {
    // Arriving through the spool's ordinary `updated` event — nothing patches the
    // list locally, so seeing it here is also proof that wiring works.
    await expect(tags.getByText(uid, { exact: true })).toBeVisible();
    await expect(tags.getByText("No tags linked.")).toBeHidden();
  });

  await test.step("and can be unlinked again", async () => {
    await tags.getByRole("button", { name: "Unlink" }).click();
    const confirm = page.getByRole("dialog").filter({ hasText: "Unlink this tag?" });
    await confirm.getByRole("button", { name: "Unlink", exact: true }).click();
    await expect(tags.getByText(uid, { exact: true })).toBeHidden();
    await expect(tags.getByText("No tags linked.")).toBeVisible();
  });
});

/**
 * The dialog is listening while it is open, so the tag you are about to link can
 * be captured by tapping it on the reader instead of reading a UID off a sticker
 * and typing it in. This is the main reason the feature is usable at all.
 */
test("tapping a tag on a reader fills the link dialog", async ({ page, request }) => {
  const uid = uniqueUid();

  await openApp(page);
  const { inspector } = await createAndOpenSpool(page);
  const dialog = await openAddTag(inspector);

  await scanUntil(request, uid, async () => {
    await expect(dialog.getByLabel("Tag UID")).toHaveValue(uid, { timeout: 1500 });
  });

  await dialog.getByRole("button", { name: "Link tag" }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsSection(inspector).getByText(uid, { exact: true })).toBeVisible();
});

/**
 * A tag belongs to exactly one spool, so linking one that is already spoken for
 * has to be a move rather than a second link or a dead end. The dialog offers it
 * as one button because the alternative — telling the user to go and find the
 * other spool and unlink it there — is the kind of errand software should run
 * itself.
 */
test("a tag already on another spool is moved, not duplicated", async ({ page }) => {
  const uid = uniqueUid();

  await openApp(page);

  const first = await createAndOpenSpool(page);
  let dialog = await openAddTag(first.inspector);
  await dialog.getByLabel("Tag UID").fill(uid);
  await dialog.getByRole("button", { name: "Link tag" }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsSection(first.inspector).getByText(uid, { exact: true })).toBeVisible();

  const second = await createAndOpenSpool(page);
  dialog = await openAddTag(second.inspector);
  await dialog.getByLabel("Tag UID").fill(uid);

  await test.step("the dialog names the spool holding it, and offers to take it", async () => {
    await expect(dialog.getByText(`Currently linked to spool #${first.id}`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Link tag" })).toBeHidden();
  });

  await dialog.getByRole("button", { name: `Move it here from #${first.id}` }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsSection(second.inspector).getByText(uid, { exact: true })).toBeVisible();

  await test.step("and the spool that had it no longer does", async () => {
    await page.goto(`/?sel=spool:${first.id}`);
    const inspector = page.locator(".insp");
    await expect(tagsSection(inspector).getByText("No tags linked.")).toBeVisible();
  });
});

/**
 * The payoff: tap a tag at the printer and the browser at the bench opens that
 * spool. Off by default, because a page that navigates itself unasked is hostile
 * — so the setting being what turns it on is part of what's under test.
 */
test("a scanned tag opens its spool once auto-navigate is switched on", async ({ page, request }) => {
  const uid = uniqueUid();

  await openApp(page);
  const { inspector, id } = await createAndOpenSpool(page);
  const dialog = await openAddTag(inspector);
  await dialog.getByLabel("Tag UID").fill(uid);
  await dialog.getByRole("button", { name: "Link tag" }).click();
  await expect(dialog).toBeHidden();

  await navTab(page, "Settings", "Settings | Spoolman");

  await test.step("Web NFC is offered only where it exists, so not here", async () => {
    // Chromium on Linux has no NDEFReader, which is the same situation as every
    // desktop, every iPhone and every plain-HTTP install: the control is absent
    // rather than present-but-broken.
    await expect(page.getByRole("button", { name: "Read a tag with this phone" })).toHaveCount(0);
  });

  const autoNavigate = page.getByLabel("Auto-navigate");
  await expect(autoNavigate).toHaveAttribute("aria-checked", "false");
  await autoNavigate.click();
  await expect(autoNavigate).toHaveAttribute("aria-checked", "true");

  await test.step("the settings page itself does not react", async () => {
    // Only the browsing pages do. Otherwise setting a scanner up would throw you
    // off the page you were setting it up on -- which is exactly what pairing does,
    // since the tag tapped to pair is delivered here too.
    const before = page.url();
    await scan(request, uid);
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(before);
  });

  await navTab(page, "Library", "Library | Spoolman");
  await scanUntil(request, uid, async () => {
    await expect(page).toHaveURL(new RegExp(`sel=spool(:|%3A)${id}`), { timeout: 1500 });
  });
});

/**
 * An unknown tag has no spool to open, and silently ignoring it would be
 * indistinguishable from the tap not registering at all. It says what it read and
 * what to do with it instead — and, crucially, stays where it is.
 */
test("an unknown tag reports itself instead of navigating", async ({ page, request }) => {
  await openApp(page);
  await navTab(page, "Settings", "Settings | Spoolman");
  await page.getByLabel("Auto-navigate").click();
  // Back to a page that reacts to scans at all -- Settings deliberately doesn't.
  await navTab(page, "Library", "Library | Spoolman");

  const before = page.url();
  const unknown = uniqueUid();
  await scanUntil(request, unknown, async () => {
    await expect(page.getByText(new RegExp(`Unknown tag ${unknown}`))).toBeVisible({ timeout: 1500 });
  });
  expect(page.url()).toBe(before);
});

/**
 * Pairing is done by walking over and tapping a tag on the reader you mean. The
 * browser listens to every reader, takes the id off the first scan it hears, and
 * narrows to that one — no codes to type, and no server state involved.
 */
test("a reader is paired by tapping a tag on it", async ({ page, request }) => {
  const readerId = `bench-${Date.now().toString(36)}`;
  const uid = uniqueUid();

  await openApp(page);
  // Link the tag first, so the tap used for pairing is one that *would* navigate
  // if the settings page reacted to scans. Pairing with an unknown tag would pass
  // this test for the wrong reason.
  const { inspector, id } = await createAndOpenSpool(page);
  const dialog = await openAddTag(inspector);
  await dialog.getByLabel("Tag UID").fill(uid);
  await dialog.getByRole("button", { name: "Link tag" }).click();
  await expect(dialog).toBeHidden();

  await navTab(page, "Settings", "Settings | Spoolman");
  await page.getByLabel("Auto-navigate").click();

  await expect(page.getByText(/Scans from any reader/)).toBeVisible();
  await page.getByRole("button", { name: "Pair by tapping" }).click();
  await expect(page.getByText("Tap any tag on the reader you want...")).toBeVisible();

  const settingsUrl = page.url();
  await scanUntil(
    request,
    uid,
    async () => {
      await expect(page.getByText(/Only scans from this reader/)).toBeVisible({
        timeout: 1500,
      });
    },
    { readerId },
  );

  await test.step("the reader is named as a name, not as a word in a sentence", async () => {
    await expect(page.getByTitle(readerId)).toHaveText(readerId);
  });

  await test.step("and pairing did not throw us off the page we paired on", async () => {
    // The tap that pairs is delivered to the auto-navigate subscription as well,
    // so this used to pair the reader and immediately navigate to spool #id.
    expect(page.url()).toBe(settingsUrl);
    await expect(page).not.toHaveURL(new RegExp(`sel=spool(:|%3A)${id}`));
  });

  await test.step("the pairing is this browser's own, and survives a reload", async () => {
    await page.reload();
    await expect(page.getByTitle(readerId)).toHaveText(readerId);
  });

  await page.getByRole("button", { name: "Use any reader" }).click();
  await expect(page.getByText(/Scans from any reader/)).toBeVisible();
});
