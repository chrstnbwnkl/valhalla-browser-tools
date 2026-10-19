/// <reference types="vitest/config" />
import { cpSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const PAGES = [
  "index.html",
  "attributes-controller-builder/index.html",
  "locate-playground/index.html",
];

// not ported yet: served and copied as they are
const LEGACY = ["assets", "route-playground"];

function legacy(): Plugin {
  return {
    name: "legacy-pages",
    apply: "build",
    closeBundle() {
      for (const dir of LEGACY) {
        cpSync(
          resolve(import.meta.dirname, dir),
          resolve(import.meta.dirname, "dist", dir),
          {
            recursive: true,
            filter: (path) => !path.endsWith(".py"),
          },
        );
      }
    },
  };
}

export default defineConfig({
  // works under any path, e.g. /valhalla-browser-tools/
  base: "./",
  plugins: [react(), tailwindcss(), legacy()],
  build: {
    // apart from the legacy assets/
    assetsDir: "static",
    rolldownOptions: {
      input: PAGES.map((page) => resolve(import.meta.dirname, page)),
      output: {
        codeSplitting: {
          groups: [
            { name: "maplibre", test: /node_modules[\\/].*maplibre-gl/ },
            {
              name: "react",
              test: /node_modules[\\/].*(react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
    // MapLibre alone is ~1 MB
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    unstubGlobals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
