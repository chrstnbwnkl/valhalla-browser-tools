import { useMemo, useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";

/** Whether the OS asks for the dark theme. */
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

// the colour tokens of the design system (see assets/tokens.css)
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

/**
 * The resolved colours of the design system, for what CSS can't reach, like map layers and canvases. They change
 * with the theme, so whatever is drawn with them should depend on the returned object.
 */
export function useThemeColors(): ThemeColors {
  const dark = useDarkScheme();
  return useMemo(() => {
    void dark; // read again whenever the theme changes
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      TOKENS.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]),
    ) as ThemeColors;
  }, [dark]);
}
