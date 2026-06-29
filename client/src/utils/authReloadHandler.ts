import { axiosInstance } from "@refinedev/simple-rest";

const RELOAD_FLAG_KEY = "spoolmanAuthReloadedAt";
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Reloads the page on 401 so a forward-auth proxy can redirect through its
 * login portal and back. Cooldown bounds reload loops if recovery fails. The
 * PWA service worker's NavigationRoute would otherwise serve the precached
 * index.html and prevent the reload from reaching the proxy, so unregister it.
 */
async function reloadOnAuthFailure(): Promise<void> {
  let last = 0;
  try {
    last = Number(localStorage.getItem(RELOAD_FLAG_KEY) || "0");
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
  try {
    localStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch {
      /* fall through to reload anyway */
    }
  }
  window.location.reload();
}

// Guard against double-registration: in dev, Vite/React fast refresh can
// re-evaluate this module, which would otherwise stack duplicate interceptors
// and fire multiple reloads per 401. The flag lives on the shared axios
// instance (not module scope) so it survives module re-evaluation.
const instance = axiosInstance as typeof axiosInstance & {
  __spoolmanAuthReloadInstalled?: boolean;
};

if (!instance.__spoolmanAuthReloadInstalled) {
  instance.__spoolmanAuthReloadInstalled = true;

  axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401) {
        // Auto-reload only on idempotent requests so unsaved form data on
        // POST/PUT/PATCH/DELETE is preserved — mutation 401s surface through
        // the Refine notification provider instead.
        const method = String(error.config?.method ?? "get").toLowerCase();
        if (method === "get" || method === "head") void reloadOnAuthFailure();
      }
      return Promise.reject(error);
    },
  );
}
