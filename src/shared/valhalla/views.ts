import { useStoredState } from "../hooks/useStoredState";

export type View = { name: string; center: [number, number]; zoom: number };

export const VIEWS_KEY = "valhalla-browser-tools:views";

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

const parse = (raw: unknown) => (Array.isArray(raw) ? raw.filter(isView) : []);

/** Adds `view`, replacing one with the same name. */
export function withView(views: View[], view: View) {
  return views.some((other) => other.name === view.name)
    ? views.map((other) => (other.name === view.name ? view : other))
    : [...views, view];
}

export const useViews = () => useStoredState(VIEWS_KEY, parse);
