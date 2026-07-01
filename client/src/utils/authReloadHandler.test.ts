import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthResponseError, reloadOnAuthFailure } from "./authReloadHandler";

// Regression cover for the 401 auto-reload behavior (TESTING_CANDIDATES row 58c):
// reload only for idempotent requests, a cooldown to bound reload loops, and SW
// unregistration first. Oracle: the observable effects (window.location.reload calls,
// SW unregister) with the clock and storage mocked at the boundary.

const originalLocation = window.location;
let reloadSpy: ReturnType<typeof vi.fn>;

function stubLocation() {
  reloadSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload: reloadSpy },
  });
}

beforeEach(() => {
  // Clear the persisted cooldown flag ("spoolmanAuthReloadedAt") so reload
  // suppression can't leak between cases and make results order-dependent.
  localStorage.clear();
  vi.useFakeTimers();
  stubLocation();
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("reloadOnAuthFailure", () => {
  it("reloads the page on the first failure", async () => {
    await reloadOnAuthFailure();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("suppresses a second reload within the cooldown window", async () => {
    await reloadOnAuthFailure();
    await reloadOnAuthFailure();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("reloads again once the cooldown has elapsed", async () => {
    await reloadOnAuthFailure();
    vi.advanceTimersByTime(30_001);
    await reloadOnAuthFailure();
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });

  it("unregisters service workers before reloading", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    await reloadOnAuthFailure();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});

describe("handleAuthResponseError", () => {
  it("reloads on a 401 for an idempotent GET, and re-rejects", async () => {
    await expect(
      handleAuthResponseError({ response: { status: 401 }, config: { method: "get" } }),
    ).rejects.toBeDefined();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("does NOT reload on a 401 for a mutating request (preserves unsaved data)", async () => {
    await expect(
      handleAuthResponseError({ response: { status: 401 }, config: { method: "post" } }),
    ).rejects.toBeDefined();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("does NOT reload on a non-401 error", async () => {
    await expect(
      handleAuthResponseError({ response: { status: 500 }, config: { method: "get" } }),
    ).rejects.toBeDefined();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("defaults a missing method to GET and reloads", async () => {
    await expect(handleAuthResponseError({ response: { status: 401 } })).rejects.toBeDefined();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});
