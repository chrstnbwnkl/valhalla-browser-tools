import { pointAt, TURN_TYPES } from "../../shared/course";
import { CoursePointType, type FitRecord } from "../../shared/fit";
import type { EditorPoint } from "../../shared/fitDraft";
import { runs, type Span } from "./spans";
import type { Settings } from "./types";

export const KINDS = {
  "turn-alert": "Earlier turn alerts",
  tunnel: "Tunnels",
  bridge: "Bridges",
  obstacle: "Gates, bollards, toll booths and steps",
  unpaved: "Unpaved stretches",
  steep: "Steep edges",
  climb: "Climbs",
  summit: "Summits and valleys",
  marker: "Distance markers",
} as const;
export type Kind = keyof typeof KINDS;

export type Suggestion = {
  id: string;
  kind: Kind;
  point: Omit<EditorPoint, "id">;
  /** The point it moves, for a suggestion that moves one. */
  replaces?: string;
  /** What it is, e.g. how long a bridge is. */
  detail: string;
};

// bridges shorter than this cross a ditch, not something worth a point
const MIN_BRIDGE = 20;
const MIN_UNPAVED = 50;
// a suggestion this close to a point of its type is already there
const NEAR = 25;

const NODE_NAMES: Record<string, string> = {
  gate: "Gate",
  bollard: "Bollard",
  toll_booth: "Toll booth",
  toll_gantry: "Toll gantry",
};

const meters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

function at(
  records: FitRecord[],
  distance: number,
  type: CoursePointType,
  name: string,
) {
  const p = pointAt(records, distance);
  return p && { lon: p.lon, lat: p.lat, distance: p.distance, type, name };
}

/** Moves every turn `offset` meters back along the track. */
export function turnAlerts(
  points: EditorPoint[],
  records: FitRecord[],
  offset: number,
): Suggestion[] {
  if (offset <= 0) return [];
  return points.flatMap((p) => {
    if (!TURN_TYPES.has(p.type) || p.distance - offset <= 0) return [];
    const point = at(records, p.distance - offset, p.type, p.name);
    return point
      ? [
          {
            id: `turn-alert:${p.id}:${offset}`,
            kind: "turn-alert" as const,
            point,
            replaces: p.id,
            detail: `${p.name || "turn"} ${offset} m early`,
          },
        ]
      : [];
  });
}

const nameOf = (span: Span, fallback: string) =>
  span.edge.names?.[0] ?? fallback;

/** Points where the edges have something to tell. */
export function edgeSuggestions(
  spans: Span[],
  records: FitRecord[],
  steepGrade: number,
): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (
    kind: Kind,
    distance: number,
    type: CoursePointType,
    name: string,
    detail: string,
  ) => {
    const point = at(records, distance, type, name);
    if (point)
      out.push({ id: `${kind}:${Math.round(distance)}`, kind, point, detail });
  };

  for (const run of runs(spans, (s) => !!s.edge.tunnel))
    add(
      "tunnel",
      run.from,
      CoursePointType.Tunnel,
      nameOf(run.first, "Tunnel"),
      `tunnel, ${meters(run.to - run.from)}`,
    );
  for (const run of runs(spans, (s) => !!s.edge.bridge && !s.edge.tunnel))
    if (run.to - run.from >= MIN_BRIDGE)
      add(
        "bridge",
        run.from,
        CoursePointType.Bridge,
        nameOf(run.first, "Bridge"),
        `bridge, ${meters(run.to - run.from)}`,
      );
  for (const run of runs(spans, (s) => s.edge.use === "steps"))
    add(
      "obstacle",
      run.from,
      CoursePointType.Obstacle,
      "Steps",
      `steps, ${meters(run.to - run.from)}`,
    );
  for (const span of spans) {
    const type = span.node?.type;
    const name = typeof type === "string" ? NODE_NAMES[type] : undefined;
    if (name)
      add(
        "obstacle",
        span.to,
        CoursePointType.Obstacle,
        name,
        name.toLowerCase(),
      );
  }
  for (const run of runs(spans, (s) => !!s.edge.unpaved))
    if (run.to - run.from >= MIN_UNPAVED)
      add(
        "unpaved",
        run.from,
        CoursePointType.Alert,
        "Unpaved",
        `unpaved, ${meters(run.to - run.from)}`,
      );
  const grade = (s: Span) =>
    typeof s.edge.max_upward_grade === "number" ? s.edge.max_upward_grade : 0;
  for (const run of runs(spans, (s) => grade(s) >= steepGrade)) {
    const max = Math.max(...run.spans.map(grade));
    add(
      "steep",
      run.from,
      CoursePointType.SteepIncline,
      `${max}% climb`,
      `up to ${max}% over ${meters(run.to - run.from)}`,
    );
  }
  return out;
}

/**
 * The alternating lows and highs of the profile, each standing out from its
 * neighbours by at least `prominence` meters.
 */
export function extremes(altitudes: number[], prominence: number) {
  const out: { kind: "low" | "high"; i: number; last?: true }[] = [];
  let dir = 0;
  let lo = 0;
  let hi = 0;
  let cand = 0;
  altitudes.forEach((h, i) => {
    if (dir === 0) {
      if (h > altitudes[hi]!) hi = i;
      if (h < altitudes[lo]!) lo = i;
      if (altitudes[hi]! - altitudes[lo]! < prominence) return;
      if (lo < hi) {
        out.push({ kind: "low", i: lo });
        dir = 1;
        cand = hi;
      } else {
        out.push({ kind: "high", i: hi });
        dir = -1;
        cand = lo;
      }
    } else if (dir === 1) {
      if (h > altitudes[cand]!) cand = i;
      else if (altitudes[cand]! - h >= prominence) {
        out.push({ kind: "high", i: cand });
        dir = -1;
        cand = i;
      }
    } else if (h < altitudes[cand]!) cand = i;
    else if (h - altitudes[cand]! >= prominence) {
      out.push({ kind: "low", i: cand });
      dir = 1;
      cand = i;
    }
  });
  // the climb or drop the route ends on
  if (dir !== 0)
    out.push({ kind: dir === 1 ? "high" : "low", i: cand, last: true });
  return out;
}

/** The category of a climb by its length times its grade, as Strava has it. */
export function climbCategory(length: number, gain: number) {
  const grade = length ? (gain / length) * 100 : 0;
  if (grade < 3) return null;
  const score = length * grade;
  if (score >= 80000) return CoursePointType.HorsCategory;
  if (score >= 64000) return CoursePointType.FirstCategory;
  if (score >= 32000) return CoursePointType.SecondCategory;
  if (score >= 16000) return CoursePointType.ThirdCategory;
  if (score >= 8000) return CoursePointType.FourthCategory;
  return null;
}

/** Categorized climbs, and summits and valleys along the way. */
export function elevationSuggestions(
  records: FitRecord[],
  altitudes: number[],
  prominence: number,
): Suggestion[] {
  if (altitudes.length !== records.length || records.length < 2) return [];
  const out: Suggestion[] = [];
  const found = extremes(altitudes, prominence);
  const last = records.length - 1;
  found.forEach(({ kind, i, last: unconfirmed }, k) => {
    const r = records[i]!;
    const h = Math.round(altitudes[i]!);
    // the climb or drop the route ends on has no other side to stand out from
    if (i > 0 && i < last && !unconfirmed)
      out.push({
        id: `summit:${kind}:${Math.round(r.distance)}`,
        kind: "summit",
        point: {
          lon: r.lon,
          lat: r.lat,
          distance: r.distance,
          type:
            kind === "high" ? CoursePointType.Summit : CoursePointType.Valley,
          name: `${h} m`,
        },
        detail: `${kind === "high" ? "summit" : "valley"} at ${h} m`,
      });
    const top = found[k + 1];
    if (kind !== "low" || top?.kind !== "high") return;
    const end = records[top.i]!;
    const length = end.distance - r.distance;
    const gain = altitudes[top.i]! - altitudes[i]!;
    const category = climbCategory(length, gain);
    if (category === null) return;
    const grade = Math.round((gain / length) * 100);
    out.push({
      id: `climb:${Math.round(r.distance)}`,
      kind: "climb",
      point: {
        lon: r.lon,
        lat: r.lat,
        distance: r.distance,
        type: category,
        name: `${(length / 1000).toFixed(1)}km ${grade}% ${Math.round(gain)}m`,
      },
      detail: `${meters(length)} at ${grade}%, ${Math.round(gain)} m up`,
    });
  });
  return out;
}

export function distanceMarkers(
  records: FitRecord[],
  everyKm: number,
): Suggestion[] {
  const total = records.at(-1)?.distance ?? 0;
  if (everyKm <= 0) return [];
  const out: Suggestion[] = [];
  for (let km = everyKm; km * 1000 < total; km += everyKm) {
    const point = at(
      records,
      km * 1000,
      CoursePointType.MileMarker,
      `${km} km`,
    );
    if (point)
      out.push({
        id: `marker:${km}`,
        kind: "marker",
        point,
        detail: `${km} km`,
      });
  }
  return out;
}

/** Every suggestion not yet taken or turned down, nor already there as a point. */
export function suggest({
  points,
  records,
  altitudes,
  spans,
  settings,
  dismissed,
}: {
  points: EditorPoint[];
  records: FitRecord[];
  altitudes: number[] | null;
  spans: Span[] | null;
  settings: Settings;
  dismissed: string[];
}) {
  const all = [
    ...turnAlerts(points, records, settings.alertOffset),
    ...(spans ? edgeSuggestions(spans, records, settings.steepGrade) : []),
    ...(altitudes
      ? elevationSuggestions(records, altitudes, settings.prominence)
      : []),
    ...distanceMarkers(records, settings.markerEvery),
  ];
  const skip = new Set(dismissed);
  return all.filter(
    (s) =>
      !skip.has(s.id) &&
      (s.replaces !== undefined ||
        !points.some(
          (p) =>
            p.type === s.point.type &&
            Math.abs(p.distance - s.point.distance) < NEAR,
        )),
  );
}
