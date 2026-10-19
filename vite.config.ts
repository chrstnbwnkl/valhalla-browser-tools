/// <reference types="vitest/config" />
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const PAGES = [
  "index.html",
  "attributes-controller-builder/index.html",
  "locate-playground/index.html",
  "route-playground/index.html",
  "route-comparison/index.html",
];

export default defineConfig({
  // works under any path, e.g. /valhalla-browser-tools/
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
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
