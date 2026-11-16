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
export const DEFAULT_DISTANCE_TOLERANCE = 0.1;
export const MIN_DISTANCE_TOLERANCE = 0.02;
export const MAX_DISTANCE_TOLERANCE = 0.5;

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
    title: `How far either side of the heading the turning points may lie, in degrees (${MIN_HEADING_TOLERANCE}–${MAX_HEADING_TOLERANCE}).`,
  },
  {
    path: "round_trip_options.distance_tolerance",
    hint: `${DEFAULT_DISTANCE_TOLERANCE}`,
    title: `How far the round trip may miss the distance, as a fraction of it (${MIN_DISTANCE_TOLERANCE}–${MAX_DISTANCE_TOLERANCE}); the search stops at the first round trip within it, so larger is faster.`,
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

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

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

/** The options of the start, the one location of a round trip. */
export const START_OPTIONS = LOCATION_OPTIONS;

// the group of the turning points the round trip uses; the others are group 1
const USED_GROUP = 2;

/** A turning point the server considered, and whether the round trip uses it. */
export type Seed = { location: Position; used: boolean };

/**
 * The turning points of a route in a verbose response: the ones the server
 * found going out, then the ones coming back. Two of them are used, in the
 * order the round trip passes them.
 */
export function seedsOf(route: unknown): Seed[] {
  const seeds = isObject(route) ? route.round_trip_seeds : undefined;
  if (!Array.isArray(seeds)) return [];
  return seeds.flatMap((seed) =>
    isObject(seed) &&
    Array.isArray(seed.location) &&
    seed.location.length === 2 &&
    seed.location.every((c) => typeof c === "number") &&
    typeof seed.group === "number"
      ? [
          {
            location: seed.location,
            used: seed.group === USED_GROUP,
          },
        ]
      : [],
  );
}
