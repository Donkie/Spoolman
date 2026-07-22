# Spoolman UI

A simple [refine](https://github.com/refinedev/refine) based UI for manipulating the data in the Spoolman database.

## Local Review Cache Reset

Set `VITE_BYPASS_LOOPBACK_PWA_CACHE=true` when you want loopback URLs such as `localhost`, `127.0.0.1`, or `::1` to clear existing service workers and browser caches before the app boots. This is intended for local review and debugging when stale PWA assets are masking the current frontend bundle.
