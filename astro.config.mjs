import { defineConfig } from "astro/config";

// Static output: `astro build` writes plain files to dist/.
// No adapter, no server runtime.
export default defineConfig({
  site: process.env.PUBLIC_TARGET === "test" ? (process.env.PUBLIC_LAB === "1" ? "https://lab.goshi.app" : "https://test.goshi.app") : "https://goshi.app",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    // Every stylesheet is a hashed file, so the CSP never needs inline <style> blocks.
    inlineStylesheets: "never",
  },
  compressHTML: true,
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  server: { port: 4321 },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
