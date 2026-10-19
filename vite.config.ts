/// <reference types="vitest/config" />
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Every page Vite builds. A tool is added here once it is ported to React; its index.html stays at the
// same path as before so shared links keep working.
const PAGES = ['index.html', 'attributes-controller-builder/index.html'];

// Tools not ported yet are plain HTML + JS. The dev server serves them from the repo as they are; the build
// copies them over unchanged.
const LEGACY = ['assets', 'locate-playground', 'route-playground'];

function legacy(): Plugin {
  return {
    name: 'legacy-pages',
    apply: 'build',
    closeBundle() {
      for (const dir of LEGACY) {
        cpSync(resolve(import.meta.dirname, dir), resolve(import.meta.dirname, 'dist', dir), {
          recursive: true,
          filter: (path) => !path.endsWith('.py'),
        });
      }
    },
  };
}

export default defineConfig({
  // relative, so the site works under /valhalla-browser-tools/ on Pages as well as on any other path
  base: './',
  plugins: [react(), tailwindcss(), legacy()],
  build: {
    // keeps the bundles apart from the legacy assets/ folder
    assetsDir: 'static',
    rolldownOptions: {
      input: PAGES.map((page) => resolve(import.meta.dirname, page)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
