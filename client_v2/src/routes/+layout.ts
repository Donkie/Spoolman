import { browser } from '$app/environment';

// Spoolman ships as a client-side SPA served from the backend, so disable SSR
// and prerender the shell.
export const ssr = false;
export const prerender = true;
