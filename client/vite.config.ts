import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  base: "",
  // Emit INLINE source maps only for the e2e coverage build (E2E_COVERAGE=1) so
  // Playwright's V8 coverage can be mapped back to the TypeScript sources at report
  // time (inline = the map travels inside each bundle's source, so monocart resolves
  // it without a running server). Production builds stay map-free.
  build: { sourcemap: process.env.E2E_COVERAGE === "1" ? "inline" : false },
  plugins: [
    react(),
    svgr(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      devOptions: {
        enabled: true,
      },
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Spoolman",
        short_name: "Spoolman",
        description: "Keep track of your inventory of 3D-printer filament spools.",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        background_color: "#1F1F1F",
        theme_color: "#DC7734",
        display: "standalone",
        start_url: "/",
        scope: "/",
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Do NOT register a NavigationRoute bound to the precached index.html.
        //
        // vite is built with base:"" (see above) so client/dist/index.html
        // references its assets relatively ("./config.js", "./assets/...").
        // The backend rewrites those "./ paths to the runtime base path at
        // serve time (spoolman/client.py SinglePageApplication), but that
        // rewrite only touches the copy FastAPI serves -- it never reaches the
        // raw file workbox precaches. If the service worker answered a deep
        // hard-navigation (e.g. /spool/print) from that precached HTML, the
        // browser would resolve "./config.js" / "./assets/*" against the deep
        // URL and 404, so the app would fail to boot.
        //
        // navigateFallback: null suppresses the NavigationRoute entirely
        // (workbox sw-template guards it behind `if (navigateFallback)`), so
        // every navigation -- root and deep, root-deploy and sub-path deploy --
        // goes to the network/backend, which serves the correctly rewritten
        // index.html. Asset precaching and cleanupOutdatedCaches are unaffected,
        // so already-loaded assets are still cached for post-boot offline use.
        //
        // Trade-off: a fully-offline cold launch of the installed PWA requires
        // the network for the initial document fetch. This is acceptable for an
        // online-first inventory app and is, in practice, no real regression:
        // config.js (window.SPOOLMAN_BASE_PATH) is served dynamically by the
        // backend and is intentionally not precached, so an offline cold boot
        // could never initialise anyway.
        navigateFallback: null,
      },
    }),
  ],
});
