// Shared between playwright.config.ts (webServer definitions) and the specs.
// Two static harness instances serve the built client at the two deploy shapes
// (PWA base-path/SW tests), and a third runs the REAL backend (API + client +
// temp SQLite) for whole-app user-journey tests.
export const ROOT_BASE_URL = "http://127.0.0.1:30011";
export const SUBPATH_BASE_URL = "http://127.0.0.1:30012";
export const SUBPATH = "/spoolman";
export const APP_BASE_URL = "http://127.0.0.1:30013";

export const DEPLOYMENTS = [
  { name: "root deploy", origin: ROOT_BASE_URL, base: "" },
  { name: "sub-path deploy", origin: SUBPATH_BASE_URL, base: SUBPATH },
] as const;
