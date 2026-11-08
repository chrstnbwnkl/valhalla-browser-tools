import type { Position } from "geojson";
import { courseName, routeTrack, sportOf } from "./course";
import type { CoursePointType, Sport } from "./fit";
import type { Route } from "./valhalla/osrm";
import { isObject, type Json } from "./valhalla/request";

/** Where the route playground leaves a course for the fitfile editor. */
export const DRAFT_KEY = "valhalla-browser-tools:fitfile-editor";
export const EDITOR_PATH = "../fitfile-editor/";

export type EditorPoint = {
  id: string;
  lon: number;
  lat: number;
  /** Meters along the track. */
  distance: number;
  type: CoursePointType;
  name: string;
};

export type DraftSource = {
  server: string;
  costing: string;
  /** The route request, for the costing of the trace_attributes requests. */
  sent: Json;
  route: Route;
  start?: Position;
};

export type Draft = {
  version: 1;
  name: string;
  sport: Sport;
  points: EditorPoint[];
  source: DraftSource;
  /** Ids of the suggestions turned down. */
  dismissed: string[];
};

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The route without what the editor doesn't use, intersections above all. */
export function stripRoute(route: Route): Route {
  return {
    ...route,
    legs: route.legs?.map((leg) => ({
      ...leg,
      steps: leg.steps?.map(({ intersections: _, ...step }) => step),
    })),
  };
}

export function createDraft(source: DraftSource): Draft {
  const route = stripRoute(source.route);
  const { coursePoints } = routeTrack(route, source.start);
  return {
    version: 1,
    name: courseName(route, source.costing),
    sport: sportOf(source.costing),
    points: coursePoints.map(({ lon, lat, distance, type, name }, i) => ({
      id: `p${i}`,
      lon,
      lat,
      distance,
      type,
      name,
    })),
    source: { ...source, route },
    dismissed: [],
  };
}

/** The stored draft, or null for none or one that doesn't look like one. */
export function parseDraft(raw: unknown): Draft | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const { source, points, name, sport, dismissed } = raw;
  if (
    !isObject(source) ||
    typeof source.server !== "string" ||
    !isObject(source.route) ||
    !Array.isArray(points) ||
    typeof name !== "string" ||
    typeof sport !== "number"
  )
    return null;
  return {
    ...(raw as Draft),
    dismissed: Array.isArray(dismissed) ? (dismissed as string[]) : [],
  };
}

/** Leaves the draft where the editor finds it; false where storage is full or off. */
export function storeDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    // useStoredState in an open editor tab hears of it through the storage event
    return true;
  } catch {
    return false;
  }
}
