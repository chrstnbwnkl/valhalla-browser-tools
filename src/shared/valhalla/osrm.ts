import type { Position } from "geojson";
import { decodePolyline } from "../map/geo";
import type { Json } from "./request";

// what is used of an OSRM-format /route response
type Geometry = string | { coordinates?: Position[] };
export type Intersection = Json & { location?: Position; turn_weight?: number };
export type Step = {
  geometry?: Geometry;
  weight?: number;
  duration?: number;
  distance?: number;
  name?: string;
  ref?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    instruction?: string;
    location?: Position;
  };
  intersections?: Intersection[];
};
export type Leg = { weight?: number; steps?: Step[] };
export type Route = {
  weight?: number;
  weight_name?: string;
  duration?: number;
  distance?: number;
  geometry?: Geometry;
  legs?: Leg[];
};
export type RouteResponse = {
  routes: Route[];
  waypoints?: (Json & { location?: Position })[];
};

/**
 * GeoJSON or an encoded polyline, whose precision (5 or 6) is guessed by which
 * decoding starts closer to `hint`, a known position.
 */
export function toCoords(geometry: Geometry | undefined, hint?: Position) {
  if (!geometry) return [];
  if (typeof geometry !== "string") return geometry.coordinates ?? [];
  const p5 = decodePolyline(geometry, 5);
  const p6 = decodePolyline(geometry, 6);
  const [a, b] = [p5[0], p6[0]];
  if (!a || !b) return [];
  if (!hint) return Math.abs(a[1]!) > 90 || Math.abs(a[0]!) > 180 ? p6 : p5;
  const dist = (c: Position) => Math.hypot(c[0]! - hint[0]!, c[1]! - hint[1]!);
  return dist(b) < dist(a) ? p6 : p5;
}

export type FlatStep = {
  idx: number;
  legIdx: number;
  step: Step;
  coords: Position[];
};

export const flattenSteps = (route: Route): FlatStep[] =>
  (route.legs ?? [])
    .flatMap((leg, legIdx) =>
      (leg.steps ?? []).map((step) => ({ legIdx, step })),
    )
    .map(({ legIdx, step }, idx) => ({
      idx,
      legIdx,
      step,
      coords: toCoords(step.geometry, step.maneuver?.location),
    }));

export function routeCoords(route: Route, start?: Position) {
  if (route.geometry) return toCoords(route.geometry, start);
  return flattenSteps(route).flatMap((s) => s.coords);
}

/** The shape of every leg, from its steps; a route without steps is one shape. */
export function legShapes(route: Route, start?: Position) {
  const same = (a?: Position, b?: Position) =>
    a?.[0] === b?.[0] && a?.[1] === b?.[1];
  const shapes = (route.legs ?? []).map((leg) =>
    (leg.steps ?? [])
      .flatMap((step) => toCoords(step.geometry, step.maneuver?.location))
      // a step starts where the one before it ended
      .filter((c, i, all) => !i || !same(c, all[i - 1])),
  );
  return shapes.length && shapes.every((shape) => shape.length > 1)
    ? shapes
    : [routeCoords(route, start)];
}

export type RouteResult = { data: RouteResponse; sent: Json; status: string };
