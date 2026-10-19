import { useMemo, useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";

export function useDarkScheme() {
  return useSyncExternalStore(
    (onChange) => {
      const query = matchMedia(DARK);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => matchMedia(DARK).matches,
  );
}

const TOKENS = [
  "surface",
  "surface-raised",
  "surface-sunken",
  "line",
  "line-strong",
  "ink",
  "ink-muted",
  "ink-subtle",
  "green",
  "green-ink",
  "green-soft",
  "magenta",
  "magenta-ink",
  "magenta-soft",
  "blue",
  "blue-soft",
  "amber",
  "amber-ink",
  "amber-soft",
  "danger",
  "danger-soft",
] as const;

export type ColorToken = (typeof TOKENS)[number];
export type ThemeColors = Record<ColorToken, string>;

/** The theme's colours, for map layers and canvases, which CSS can't reach. */
export function useThemeColors(): ThemeColors {
  const dark = useDarkScheme();
  return useMemo(() => {
    void dark; // re-read on theme change
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      TOKENS.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]),
    ) as ThemeColors;
  }, [dark]);
}
