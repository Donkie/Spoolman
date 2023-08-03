import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import mkcert from 'vite-plugin-mkcert'


export default defineConfig({
  server: { https: true },
  plugins: [react(), svgr(), mkcert()],
});
