import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Keep tests isolated: unmount React trees and wipe storage between cases so no
// test leaks state (poisoned keys, mounted components) into the next.
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as Partial<Window>).SPOOLMAN_BASE_PATH;
});

// jsdom does not implement matchMedia; antd's responsive hooks (Grid.useBreakpoint)
// call it. Provide an inert stub so components render in the "desktop" branch.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
