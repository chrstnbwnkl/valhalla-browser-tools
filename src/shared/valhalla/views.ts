import { useStoredState, type Codec } from "../hooks/useStoredState";

/** A saved map view. */
export type View = {
  name: string;
  center: [lon: number, lat: number];
  zoom: number;
};

// shared by the tools, so a view saved in one of them is there in the others
export const VIEWS_KEY = "valhalla-browser-tools:views";
// where the tools kept their views before
const LEGACY_VIEWS_KEYS = ["locate-visualizer:views", "route-debugger:views"];

function isView(value: unknown): value is View {
  const view = value as Partial<Record<keyof View, unknown>> | null;
  return (
    typeof view?.name === "string" &&
    Array.isArray(view.center) &&
    view.center.length === 2 &&
    view.center.every(Number.isFinite) &&
    Number.isFinite(view.zoom)
  );
}

function validViews(stored: string | null): View[] {
  let saved: unknown;
  try {
    saved = JSON.parse(stored ?? "null");
  } catch {
    return [];
  }
  return Array.isArray(saved) ? saved.filter(isView) : [];
}

// nothing shared yet: start from what the tools saved on their own, the first of a name wins
function legacyViews() {
  const views: View[] = [];
  try {
    for (const key of LEGACY_VIEWS_KEYS) {
      for (const view of validViews(localStorage.getItem(key))) {
        if (!views.some((other) => other.name === view.name)) views.push(view);
      }
    }
  } catch {
    // storage unavailable
  }
  return views;
}

export const VIEWS: Codec<View[]> = {
  read: (stored) => (stored !== null ? validViews(stored) : legacyViews()),
  write: (views) => JSON.stringify(views),
};

/** Adds `view`, replacing one of the same name in place. */
export function withView(views: View[], view: View) {
  const existing = views.findIndex((other) => other.name === view.name);
  return existing < 0
    ? [...views, view]
    : views.map((other, i) => (i === existing ? view : other));
}

export const useViews = () => useStoredState(VIEWS_KEY, VIEWS);
