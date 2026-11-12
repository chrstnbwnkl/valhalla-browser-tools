import type { Position } from "geojson";
import { COSTINGS } from "../route-playground/costing";
import {
  LOCATION_OPTIONS,
  isObject,
  type Json,
  type LocateRequest as Request,
  type Option,
} from "../../shared/valhalla/request";

// /round_trip has a limit per costing, and none for the multimodal ones
const MULTIMODAL = ["multimodal", "transit", "bikeshare", "auto_pedestrian"];
export const ROUND_TRIP_COSTINGS = COSTINGS.filter(
  (costing) => !MULTIMODAL.includes(costing),
);

// what the server does when an option is left out or out of range
export const DEFAULT_HEADING = 0;
export const DEFAULT_HEADING_TOLERANCE = 45;
export const MIN_HEADING_TOLERANCE = 10;
export const MAX_HEADING_TOLERANCE = 180;
export const DEFAULT_OVERLAP_FACTOR = 1;
export const MIN_OVERLAP_FACTOR = 0;
export const MAX_OVERLAP_FACTOR = 10;

/** The fields of round_trip_options, and alternates next to them. */
export const ROUND_TRIP_FIELDS: Option[] = [
  {
    path: "round_trip_options.distance",
    hint: "required, m",
    title:
      "The length the round trip should have, in meters. Required; the server clamps it to the max_round_trip_distance of the costing.",
  },
  {
    path: "round_trip_options.heading",
    hint: `${DEFAULT_HEADING}°`,
    title:
      "The direction the round trip heads out in, in degrees clockwise from north.",
  },
  {
    path: "round_trip_options.heading_tolerance",
    hint: `${DEFAULT_HEADING_TOLERANCE}°`,
    title: `How far either side of the heading the round trip may stray, in degrees (${MIN_HEADING_TOLERANCE}–${MAX_HEADING_TOLERANCE}).`,
  },
  {
    path: "round_trip_options.overlap_factor",
    hint: `${DEFAULT_OVERLAP_FACTOR}`,
    title: `How strongly to avoid travelling the same road twice (${MIN_OVERLAP_FACTOR}–${MAX_OVERLAP_FACTOR}); 0 doesn't care.`,
  },
  {
    path: "alternates",
    group: "",
    hint: "0",
    title: "How many more round trips to return, next to the best one.",
  },
];

export function roundTripOptionsOf(request: Request | null): Json {
  const options = request?.round_trip_options;
  return isObject(options) ? options : {};
}

/** The value of one of ROUND_TRIP_FIELDS. */
export function fieldOf(request: Request | null, path: string): unknown {
  const [key = "", sub] = path.split(".");
  return sub ? roundTripOptionsOf(request)[sub] : request?.[key];
}

/** `undefined` removes the field, and round_trip_options once empty. */
export function withField(
  request: Request,
  path: string,
  value: unknown,
): Request {
  const [key = "", sub] = path.split(".");
  if (!sub) {
    const { [key]: _, ...rest } = request;
    return value === undefined ? rest : { ...request, [key]: value };
  }
  const options: Json = { ...roundTripOptionsOf(request) };
  if (value === undefined) delete options[sub];
  else options[sub] = value;
  const { round_trip_options: _, ...rest } = request;
  return Object.keys(options).length
    ? { ...request, round_trip_options: options }
    : rest;
}

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** The options as the server ends up using them, or null without a distance. */
export function effectiveOptions(request: Request | null) {
  const options = roundTripOptionsOf(request);
  const distance = num(options.distance);
  if (distance === undefined || distance <= 0) return null;
  const heading = num(options.heading) ?? DEFAULT_HEADING;
  const tolerance = num(options.heading_tolerance) ?? DEFAULT_HEADING_TOLERANCE;
  return {
    distance,
    heading: ((heading % 360) + 360) % 360,
    headingTolerance: Math.min(
      MAX_HEADING_TOLERANCE,
      Math.max(MIN_HEADING_TOLERANCE, tolerance),
    ),
  };
}

// the range of beeline to network distance factors the server seeds for: dense
// grids detour little, sparse rural networks a lot
const MIN_ROAD_NETWORK_FACTOR = 1.2;
const MAX_ROAD_NETWORK_FACTOR = 2.0;

/**
 * Where the server seeds the intermediate points: between `inner` and `outer`
 * meters from the start, `groups` sectors within the heading tolerance. Mirrors
 * the current server implementation, which may change.
 */
export function seedArea(distance: number, headingTolerance: number) {
  const groups = headingTolerance < 15 ? 1 : headingTolerance < 45 ? 2 : 3;
  const rad = ((headingTolerance / groups) * Math.PI) / 180;
  const radius = (factor: number) =>
    distance / (factor * (2 + 2 * (groups - 1) * Math.sin(rad)));
  return {
    groups,
    inner: radius(MAX_ROAD_NETWORK_FACTOR),
    outer: radius(MIN_ROAD_NETWORK_FACTOR),
  };
}

const EARTH_RADIUS = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** The position `meters` from `from` in the direction `bearing`. */
export function destination(
  [lon = 0, lat = 0]: Position,
  bearing: number,
  meters: number,
): Position {
  const d = meters / EARTH_RADIUS;
  const b = toRad(bearing);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2),
    );
  return [toDeg(λ2), toDeg(φ2)];
}

/** The initial bearing from `a` to `b`, in degrees clockwise from north. */
export function bearing(
  [lon1 = 0, lat1 = 0]: Position,
  [lon2 = 0, lat2 = 0]: Position,
) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The ring of the annular sector between `inner` and `outer` meters, `from` to `to` degrees. */
export function sectorRing(
  center: Position,
  inner: number,
  outer: number,
  from: number,
  to: number,
): Position[] {
  const steps = Math.max(2, Math.ceil((to - from) / 3));
  const arc = (radius: number) =>
    Array.from({ length: steps + 1 }, (_, i) =>
      destination(center, from + ((to - from) * i) / steps, radius),
    );
  const outerArc = arc(outer);
  const innerArc = inner > 0 ? arc(inner).reverse() : [center];
  return [...outerArc, ...innerArc, outerArc[0]!];
}

/** The options of the start; the server sets node_snap_tolerance to 0 itself. */
export const START_OPTIONS = LOCATION_OPTIONS.filter(
  (option) => option.path !== "node_snap_tolerance",
);

/** A point the round trip passes through, from the seed group `group`. */
export type Seed = { location: Position; group: number };

/** The seeds of a route in a verbose response, in the order it passes them. */
export function seedsOf(route: unknown): Seed[] {
  const seeds = isObject(route) ? route.round_trip_seeds : undefined;
  if (!Array.isArray(seeds)) return [];
  return seeds.filter(
    (seed): seed is Seed =>
      isObject(seed) &&
      Array.isArray(seed.location) &&
      seed.location.length === 2 &&
      seed.location.every((c) => typeof c === "number") &&
      typeof seed.group === "number",
  );
}

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((c) => typeof c === "number");

/** A seed that survived the server's filtering, and where it snapped to. */
export type SeedCandidate = Seed & { snapped: Position | null };

/**
 * The seeds of a verbose response from a debug build: every sampled point, and
 * the candidates left after filtering. Empty without them.
 */
export function seedDebugOf(data: unknown) {
  const list = (key: string) => {
    const value = isObject(data) ? data[key] : undefined;
    return Array.isArray(value) ? value.filter(isObject) : [];
  };
  const samples: Seed[] = list("round_trip_seed_samples").flatMap((s) =>
    isPosition(s.location) && typeof s.group === "number"
      ? [{ location: s.location, group: s.group }]
      : [],
  );
  const candidates: SeedCandidate[] = list(
    "round_trip_seed_candidates",
  ).flatMap((s) =>
    isPosition(s.location) && typeof s.group === "number"
      ? [
          {
            location: s.location,
            group: s.group,
            snapped: isPosition(s.snapped_location) ? s.snapped_location : null,
          },
        ]
      : [],
  );
  return { samples, candidates };
}

const samePosition = (a: Position, b: Position) =>
  Math.abs(a[0]! - b[0]!) < 1e-6 && Math.abs(a[1]! - b[1]!) < 1e-6;

/** Where in `seeds` each of `points` comes, counted from 1, or null if it isn't there. */
export const orderIn = (points: Seed[], seeds: Seed[]) =>
  points.map((p) => {
    const i = seeds.findIndex((s) => samePosition(s.location, p.location));
    return i < 0 ? null : i + 1;
  });

/** The samples that didn't make it to the candidates. */
export const droppedSamples = (samples: Seed[], candidates: Seed[]) =>
  samples.filter(
    (s) => !candidates.some((c) => samePosition(c.location, s.location)),
  );

/** The great-circle distance between two positions, in meters. */
export function distance(
  [lon1 = 0, lat1 = 0]: Position,
  [lon2 = 0, lat2 = 0]: Position,
) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const a =
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
}

// the server seeds its random points from the start rounded to 1e-6°
const WIGGLE_STEPS = [-2, -1, 1, 2];

/**
 * The start moved by one or two millionths of a degree in each direction:
 * about 0.1–0.2 m, but a different seed for every point the server samples.
 */
export function wiggled(
  [lon = 0, lat = 0]: Position,
  random = Math.random,
): Position {
  const step = () =>
    WIGGLE_STEPS[Math.floor(random() * WIGGLE_STEPS.length)]! * 1e-6;
  return [+(lon + step()).toFixed(6), +(lat + step()).toFixed(6)];
}
