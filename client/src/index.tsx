import "@ant-design/v5-patch-for-react-19";
import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./i18n";

const shouldBypassLoopbackPwaCache = import.meta.env["VITE_BYPASS_LOOPBACK_PWA_CACHE"] === "true";
const normalizedHostname = window.location.hostname.replace(/^\[|\]$/g, "");
const isLoopbackHost =
  normalizedHostname === "localhost" ||
  normalizedHostname === "::1" ||
  /^127(?:\.\d{1,3}){3}$/.test(normalizedHostname);

if (shouldBypassLoopbackPwaCache && isLoopbackHost) {
  // Opt-in local review builds can clear loopback-host PWA state before boot so stale assets
  // from earlier test runs do not mask the current bundle.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  }
  if ("caches" in window) {
    void caches.keys().then((keys) => {
      keys.forEach((key) => {
        void caches.delete(key);
      });
    });
  }
}

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <React.Suspense fallback="loading">
      <App />
    </React.Suspense>
  </React.StrictMode>,
);
