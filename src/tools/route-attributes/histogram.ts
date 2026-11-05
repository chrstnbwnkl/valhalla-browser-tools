import type { Position } from "geojson";
import type { RouteEdge } from "../route-playground/edges";
import { edgeAttributes } from "../route-playground/themes";

// numeric, but identifiers or positions rather than quantities
const SKIPPED = /(^|_)id$|_shape_index$|_heading$/;
// integers spanning at most this many values get a bin each
const MAX_INTEGER_BINS = 40;
const TARGET_BINS = 20;
const EARTH_KM = 6371.0088;
const MI_PER_KM = 0.621371;

/** The edge attributes whose values are all numbers, for histograms. */
export function numericKeys(edges: RouteEdge[]) {
  const keys = new Map<string, boolean>();
  for (const { edge } of edges)
    for (const [key, value] of Object.entries(edgeAttributes(edge))) {
      if (SKIPPED.test(key) || value === null || value === undefined) continue;
      keys.set(key, (keys.get(key) ?? true) && typeof value === "number");
    }
  return [...keys].flatMap(([key, numeric]) => (numeric ? [key] : [])).sort();
}

function haversineKm(coords: Position[]) {
  const rad = Math.PI / 180;
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1 = 0, lat1 = 0] = coords[i - 1]!;
    const [lon2 = 0, lat2 = 0] = coords[i]!;
    const a =
      Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
      Math.cos(lat1 * rad) *
        Math.cos(lat2 * rad) *
        Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
    km += 2 * EARTH_KM * Math.asin(Math.sqrt(a));
  }
  return km;
}

/** An edge's length in `units`; from its shape when the length was filtered out. */
export function edgeLength({ edge, coords }: RouteEdge, units?: string) {
  if (typeof edge.length === "number") return edge.length;
  const km = haversineKm(coords);
  return units === "miles" ? km * MI_PER_KM : km;
}

/** A step of 1, 2 or 5 times a power of ten, near `raw`. */
function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * power >= raw) ?? 10;
  return step * power;
}

export type Bin = {
  /** Inclusive; `to` is exclusive except in the last bin. */
  from: number;
  to: number;
  distance: number;
  edges: number[];
};

export type Histogram = {
  bins: Bin[];
  /** Whether each bin is one integer value rather than a range. */
  discrete: boolean;
  /** The mean weighted by distance, over the edges with a value. */
  mean: number;
  min: number;
  max: number;
  /** The distance of the edges with a value, and of those without one. */
  distance: number;
  missing: number;
};

/** The distance along the route in bins of `key`'s values; null when no edge has one. */
export function histogram(
  edges: RouteEdge[],
  key: string,
  units?: string,
): Histogram | null {
  const valued: { idx: number; value: number; distance: number }[] = [];
  let missing = 0;
  for (const e of edges) {
    const value = edgeAttributes(e.edge)[key];
    const distance = edgeLength(e, units);
    if (typeof value === "number" && Number.isFinite(value))
      valued.push({ idx: e.idx, value, distance });
    else missing += distance;
  }
  if (!valued.length) return null;

  const values = valued.map((v) => v.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const discrete =
    values.every(Number.isInteger) && max - min < MAX_INTEGER_BINS;
  const step = discrete
    ? 1
    : max > min
      ? niceStep((max - min) / TARGET_BINS)
      : 1;
  const start = discrete ? min : Math.floor(min / step) * step;
  const count = discrete
    ? max - min + 1
    : Math.max(1, Math.ceil((max - start) / step - 1e-9));
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({
    from: start + i * step,
    to: start + (i + 1) * step,
    distance: 0,
    edges: [],
  }));
  for (const { idx, value, distance } of valued) {
    const bin = bins[Math.min(Math.floor((value - start) / step), count - 1)]!;
    bin.distance += distance;
    bin.edges.push(idx);
  }

  const distance = valued.reduce((sum, v) => sum + v.distance, 0);
  const mean = distance
    ? valued.reduce((sum, v) => sum + v.value * v.distance, 0) / distance
    : values.reduce((sum, v) => sum + v, 0) / values.length;
  return { bins, discrete, mean, min, max, distance, missing };
}
