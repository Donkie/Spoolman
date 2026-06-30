import "@ant-design/v5-patch-for-react-19";
import React from "react";
import { createRoot } from "react-dom/client";

import "./utils/authReloadHandler";
import App from "./App";
import "./i18n";
import { getBasePath } from "./utils/url";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <React.Suspense fallback="loading">
      <App />
    </React.Suspense>
  </React.StrictMode>,
);

if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = getBasePath(); // "" at root, "/spoolman" when sub-path hosted
    void navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` });
  });
}
