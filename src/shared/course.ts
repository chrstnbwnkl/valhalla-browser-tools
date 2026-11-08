import type { Position } from "geojson";
import {
  CoursePointType,
  Sport,
  type FitCourse,
  type FitCoursePoint,
  type FitRecord,
} from "./fit";
import { encodePolyline } from "./map/geo";
import { isObject } from "./valhalla/request";
import {
  flattenSteps,
  routeCoords,
  type Route,
  type Step,
} from "./valhalla/osrm";

// records get no further apart than this, so elevation is sampled along long edges too
export const DEFAULT_SPACING = 50;
// a climb or drop smaller than this is noise in the elevation model
export const CLIMB_THRESHOLD = 3;

export function haversine([lon1, lat1]: Position, [lon2, lat2]: Position) {
  const rad = Math.PI / 180;
  const dLat = (lat2! - lat1!) * rad;
  const dLon = (lon2! - lon1!) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1! * rad) * Math.cos(lat2! * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const TURNS: Record<string, CoursePointType> = {
  uturn: CoursePointType.UTurn,
  "sharp right": CoursePointType.SharpRight,
  right: CoursePointType.Right,
  "slight right": CoursePointType.SlightRight,
  straight: CoursePointType.Straight,
  "slight left": CoursePointType.SlightLeft,
  left: CoursePointType.Left,
  "sharp left": CoursePointType.SharpLeft,
};

const FORKS: Record<string, CoursePointType> = {
  "sharp right": CoursePointType.RightFork,
  right: CoursePointType.RightFork,
  "slight right": CoursePointType.RightFork,
  "sharp left": CoursePointType.LeftFork,
  left: CoursePointType.LeftFork,
  "slight left": CoursePointType.LeftFork,
};

/** The types a navigation device announces as a turn. */
export const TURN_TYPES: ReadonlySet<CoursePointType> = new Set([
  ...Object.values(TURNS),
  ...Object.values(FORKS),
  CoursePointType.MiddleFork,
]);

type Point = { type: CoursePointType; name: string };

const modeOf = (step: Step | undefined) =>
  (step as { mode?: unknown } | undefined)?.mode;

/**
 * The course point of a step, or null for none: the turn the maneuver is, the
 * start and end of every leg where there are several, and boarding a ferry.
 */
export function coursePointOf(
  step: Step,
  before: Step | undefined,
  legIdx: number,
  legCount: number,
): Point | null {
  const { type = "", modifier = "" } = step.maneuver ?? {};
  const street = step.name || step.ref || "";
  if (type === "depart" || type === "arrive") {
    if (legCount < 2) return null;
    return type === "depart"
      ? { type: CoursePointType.SegmentStart, name: `Leg ${legIdx + 1} start` }
      : { type: CoursePointType.SegmentEnd, name: `Leg ${legIdx + 1} end` };
  }
  if (modeOf(step) === "ferry" && modeOf(before) !== "ferry")
    return { type: CoursePointType.Transport, name: street || "Ferry" };
  // the turn is told on the way in
  if (type === "exit roundabout" || type === "exit rotary") return null;
  if (type === "fork")
    return {
      type: FORKS[modifier] ?? CoursePointType.MiddleFork,
      name: street,
    };
  if (type === "roundabout" || type === "rotary") {
    const exit = (step.maneuver as { exit?: unknown }).exit;
    return {
      type: TURNS[modifier] ?? CoursePointType.Generic,
      name: typeof exit === "number" ? `Exit ${exit} ${street}`.trim() : street,
    };
  }
  const turn = TURNS[modifier];
  if (turn !== undefined) return { type: turn, name: street };
  if (type === "continue" || type === "new name")
    return { type: CoursePointType.Straight, name: street };
  return { type: CoursePointType.Generic, name: street };
}

/**
 * The records of the route, with distance along the shape and time from the
 * step durations, and a course point at the start of every step that has one.
 */
export function routeTrack(
  route: Route,
  start?: Position,
  spacing = DEFAULT_SPACING,
) {
  const records: FitRecord[] = [];
  const coursePoints: FitCoursePoint[] = [];

  const push = (at: Position, distance: number, time: number) =>
    records.push({ lon: at[0]!, lat: at[1]!, distance, time });

  /** Adds the shape `coords`, crossed in `duration` seconds. */
  function add(coords: Position[], duration: number) {
    const prev = records.at(-1);
    const from = prev ? { ...prev } : null;
    const path = from ? [[from.lon, from.lat], ...coords] : coords;
    const lengths = path.slice(1).map((c, i) => haversine(path[i]!, c));
    const total = lengths.reduce((a, b) => a + b, 0);
    let distance = from?.distance ?? 0;
    let time = from?.time ?? 0;
    if (!from && path[0]) push(path[0], distance, time);
    lengths.forEach((length, i) => {
      if (!length) return;
      const [a, b] = [path[i]!, path[i + 1]!];
      const dt = total ? (duration * length) / total : 0;
      const parts = Math.ceil(length / spacing);
      for (let k = 1; k <= parts; k++) {
        const f = k / parts;
        push(
          [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f],
          distance + length * f,
          time + dt * f,
        );
      }
      distance += length;
      time += dt;
    });
  }

  const steps = flattenSteps(route);
  const legCount = route.legs?.length ?? 0;
  if (!steps.length) {
    add(routeCoords(route, start), route.duration ?? 0);
    return { records, coursePoints };
  }
  let elapsed = 0;
  steps.forEach(({ step, legIdx, coords }, i) => {
    const point = coursePointOf(step, steps[i - 1]?.step, legIdx, legCount);
    const at = step.maneuver?.location ?? coords[0];
    const last = records.at(-1);
    if (point && at)
      coursePoints.push({
        ...point,
        lon: at[0]!,
        lat: at[1]!,
        distance: last?.distance ?? 0,
        time: elapsed,
      });
    add(coords, step.duration ?? 0);
    // turn costs and a step with no length still take time
    elapsed += step.duration ?? 0;
    const end = records.at(-1);
    if (end) end.time = Math.max(end.time, elapsed);
  });
  return { records, coursePoints };
}

/** Index of the last record at or before `distance`. */
function recordBefore(records: FitRecord[], distance: number) {
  let lo = 0;
  let hi = records.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (records[mid]!.distance <= distance) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Where on the track `distance` is, with the time and altitude there. */
export function pointAt(records: FitRecord[], distance: number) {
  const i = recordBefore(records, distance);
  const a = records[i];
  const b = records[i + 1];
  if (!a) return null;
  if (!b || b.distance === a.distance)
    return { lon: a.lon, lat: a.lat, distance: a.distance, time: a.time };
  const f = Math.min(
    1,
    Math.max(0, (distance - a.distance) / (b.distance - a.distance)),
  );
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return {
    lon: lerp(a.lon, b.lon),
    lat: lerp(a.lat, b.lat),
    distance: lerp(a.distance, b.distance),
    time: lerp(a.time, b.time),
    altitude:
      a.altitude !== undefined && b.altitude !== undefined
        ? lerp(a.altitude, b.altitude)
        : undefined,
  };
}

/**
 * The point of the track nearest `at` between `after` and `after + window`
 * meters, for a track that passes the same place twice.
 */
export function snapToTrack(
  records: FitRecord[],
  at: Position,
  after = 0,
  window = Infinity,
) {
  const [lon, lat] = at as [number, number];
  const kx = Math.cos((lat * Math.PI) / 180);
  let best: { distance: number; d2: number } | null = null;
  for (let i = recordBefore(records, after); i + 1 < records.length; i++) {
    const a = records[i]!;
    const b = records[i + 1]!;
    if (a.distance > after + window) break;
    const ax = (a.lon - lon) * kx;
    const ay = a.lat - lat;
    const bx = (b.lon - lon) * kx;
    const by = b.lat - lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d2 = px * px + py * py;
    if (!best || d2 < best.d2)
      best = { distance: a.distance + (b.distance - a.distance) * t, d2 };
  }
  if (!best) return records[0] ? pointAt(records, 0) : null;
  return pointAt(records, best.distance);
}

/**
 * Sum of the climbs and of the drops, each counted once the altitude has moved
 * `threshold` meters from where the last one was counted.
 */
export function climb(altitudes: number[], threshold = CLIMB_THRESHOLD) {
  let ascent = 0;
  let descent = 0;
  let ref = altitudes[0];
  for (const h of altitudes) {
    if (ref === undefined) break;
    if (h > ref && h - ref >= threshold) {
      ascent += h - ref;
      ref = h;
    } else if (h < ref && ref - h >= threshold) {
      descent += ref - h;
      ref = h;
    }
  }
  return { ascent, descent };
}

/**
 * Heights at `coords` from the server's /height, or null where it has no
 * elevation data for all of them.
 */
export async function fetchHeights(
  server: string,
  coords: Position[],
  signal?: AbortSignal,
): Promise<number[] | null> {
  const res = await fetch(`${server}/height`, {
    method: "POST",
    body: JSON.stringify({
      encoded_polyline: encodePolyline(coords),
      height_precision: 1,
    }),
    signal,
  });
  const data = (await res.json()) as unknown;
  if (isObject(data) && typeof data.error === "string")
    throw new Error(data.error);
  const heights = isObject(data) ? data.height : undefined;
  if (
    !Array.isArray(heights) ||
    heights.length !== coords.length ||
    !heights.every((h) => typeof h === "number")
  )
    return null;
  // -32768 is what a tile without data gives
  return heights.some((h) => h <= -32768) ? null : heights;
}

export function sportOf(costing: string) {
  switch (costing) {
    case "auto":
    case "taxi":
    case "bus":
    case "truck":
      return Sport.Driving;
    case "bicycle":
    case "bikeshare":
      return Sport.Cycling;
    case "pedestrian":
      return Sport.Walking;
    case "motor_scooter":
    case "motorcycle":
      return Sport.Motorcycling;
    default:
      return Sport.Generic;
  }
}

export function courseName(route: Route, costing: string) {
  const km = ((route.distance ?? 0) / 1000).toFixed(1);
  return `${costing || "route"} ${km} km`;
}

/**
 * The course of `route`, with altitudes from the server where it has them;
 * `missing` says why not where it doesn't.
 */
export async function buildCourse(
  server: string,
  route: Route,
  costing: string,
  options: { start?: Position; now?: Date; signal?: AbortSignal } = {},
): Promise<{ course: FitCourse; missing: string | null }> {
  const { records, coursePoints } = routeTrack(route, options.start);
  let heights: number[] | null = null;
  let missing: string | null = null;
  try {
    heights = await fetchHeights(
      server,
      records.map((r) => [r.lon, r.lat]),
      options.signal,
    );
    if (!heights) missing = "the server has no elevation data here";
  } catch (e) {
    if (options.signal?.aborted) throw e;
    missing = `/height failed: ${(e as Error).message}`;
  }
  if (heights) records.forEach((r, i) => (r.altitude = heights[i]));
  return {
    course: {
      name: courseName(route, costing),
      sport: sportOf(costing),
      start: options.now ?? new Date(),
      records,
      coursePoints,
      ...(heights ? climb(heights) : {}),
    },
    missing,
  };
}

export const fitFilename = (name: string) =>
  `${name.trim().replace(/\s+/g, "-") || "course"}.fit`;

export function download(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/vnd.ant.fit" }),
  );
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
