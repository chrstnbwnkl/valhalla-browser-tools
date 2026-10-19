# Valhalla Browser Tools

Some small vibe coded browser-only tools for the Valhalla routing engine. The playgrounds should allow for quick and easy exploration of Valhalla's capability, as well as making sense of and sharing specific requests.

## Development

The site is a multi-page [Vite](https://vite.dev) build: every tool is its own page and its own React app, sharing the design system and components in `src/shared`.

```sh
pnpm install
pnpm dev        # dev server, all pages
pnpm test       # Vitest + Testing Library
pnpm typecheck
pnpm lint       # ESLint + Prettier; `pnpm format` fixes formatting
pnpm build      # static site in dist/
```

- `src/theme/theme.css`: Tailwind, configured from the Waypoint tokens in `assets/tokens.css`. Only the Waypoint palette, fonts, radii and shadows exist as utilities (`bg-surface`, `text-ink-muted`, `shadow-float`, …).
- `src/shared`: UI components, hooks and helpers used by more than one tool.
- `src/shared/map`: a thin wrapper around MapLibre. `MapView` creates the map; inside it, hooks such as `useGeoJSONSource`, `useLayer` and `useMapEvent` add things on mount, follow their inputs and remove them on unmount, and `Marker` renders React into a marker. Anything else goes straight to the MapLibre map from `useMap()`. In tests, `maplibre-gl` and terra-draw are replaced by fakes (`src/test/`) that record what is put on the map and can fire map events.
- `src/shared/valhalla`: request helpers, option fields, the server picker and saved map views.
- `src/tools/<tool>`: one directory per tool, with its tests next to the code. Its page is `<tool>/index.html`, listed in `PAGES` in `vite.config.ts`.
- `src/tools/route-playground/costing-options.json` is generated from `openapi.yaml` by `scripts/generate-costing-options.py`.

Tests never call a Valhalla server: any `fetch` they don't stub fails them. Responses they need are recorded once and checked in, like `src/tools/route-playground/fixtures`.

`main` is built and deployed to GitHub Pages by `.github/workflows/pages.yml`, including after the daily option-of-the-day commit.
