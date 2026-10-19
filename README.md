# Valhalla Browser Tools

Some small vibe coded browser-only tools for the Valhalla routing engine. The playgrounds should allow for quick and easy exploration of Valhalla's capability, as well as making sense of and sharing specific requests.

## Development

The site is a multi-page [Vite](https://vite.dev) build: every tool is its own page and its own React app, sharing the design system and components in `src/shared`. Tools not yet ported to React are plain HTML + JS and are copied into the build as they are.

```sh
pnpm install
pnpm dev        # dev server, all pages
pnpm test       # Vitest + Testing Library
pnpm typecheck
pnpm build      # static site in dist/
```

- `src/theme/theme.css`: Tailwind, configured from the Waypoint tokens in `assets/tokens.css`. Only the Waypoint palette, fonts, radii and shadows exist as utilities (`bg-surface`, `text-ink-muted`, `shadow-float`, …).
- `src/shared`: UI components, hooks and helpers used by more than one tool.
- `src/tools/<tool>`: one directory per tool, with its tests next to the code. Its page is `<tool>/index.html`, listed in `PAGES` in `vite.config.ts`; the path stays what it was, so shared links keep working.

`main` is built and deployed to GitHub Pages by `.github/workflows/pages.yml`, including after the daily option-of-the-day commit.
