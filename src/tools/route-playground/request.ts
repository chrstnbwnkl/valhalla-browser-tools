import type { Position } from "geojson";
import { decodePolyline } from "../../shared/map/geo";
import {
  CORRELATION_OPTIONS,
  SEARCH_FILTER_OPTIONS,
  isObject,
  type Json,
  type LocateRequest as Request,
  type Location,
  type Option,
} from "../../shared/valhalla/request";

export const ROUTE_OPTIONS: Option[] = [
  { path: "type", values: ["break", "through", "via", "break_through"] },
  ...CORRELATION_OPTIONS,
  { path: "waiting", hint: "0 s" },
  ...SEARCH_FILTER_OPTIONS,
];

export function inserted(
  locations: Location[],
  location: Location,
  at: number,
) {
  return [...locations.slice(0, at), location, ...locations.slice(at)];
}

export function moved(locations: Location[], from: number, to: number) {
  const next = locations.filter((_, i) => i !== from);
  return inserted(next, locations[from]!, to);
}

type Ring = Position[];

/** The outer rings of exclude_polygons (a list of rings or a FeatureCollection) and where they are in it. */
export function exclusionRings(request: Request | null) {
  const value = request?.exclude_polygons;
  const rings: unknown[] = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.features)
      ? value.features.map(
          (feature: { geometry?: { coordinates?: unknown[] } }) =>
            feature?.geometry?.coordinates?.[0],
        )
      : [];
  return rings
    .map((ring, i) => ({ i, ring }))
    .filter(
      (r): r is { i: number; ring: Ring } =>
        Array.isArray(r.ring) && r.ring.length > 2,
    );
}

export function withExclusion(request: Request, ring: Ring): Request {
  const value = request.exclude_polygons;
  if (isObject(value) && Array.isArray(value.features)) {
    const feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    };
    return {
      ...request,
      exclude_polygons: {
        ...value,
        features: [...(value.features as unknown[]), feature],
      },
    };
  }
  return {
    ...request,
    exclude_polygons: [
      ...(Array.isArray(value) ? (value as unknown[]) : []),
      ring,
    ],
  };
}

export function withoutExclusion(request: Request, i?: number): Request {
  const { exclude_polygons: value, ...rest } = request;
  const list: unknown[] | undefined = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.features)
      ? (value.features as unknown[])
      : undefined;
  if (i === undefined || !list) return rest;
  const left = list.filter((_, other) => other !== i);
  if (!left.length) return rest;
  return {
    ...request,
    exclude_polygons: Array.isArray(value)
      ? left
      : { ...(value as Json), features: left },
  };
}

/** The lines of linear_cost_factors: encoded shapes with a factor, or GeoJSON features with a factor property. */
export function costLines(request: Request | null) {
  const entries: unknown[] = Array.isArray(request?.linear_cost_factors)
    ? request.linear_cost_factors
    : [];
  return entries
    .map((entry, i) => {
      const e = entry as {
        shape?: unknown;
        factor?: unknown;
        geometry?: { coordinates?: unknown };
        properties?: { factor?: unknown };
      } | null;
      const coords =
        typeof e?.shape === "string"
          ? decodePolyline(e.shape)
          : e?.geometry?.coordinates;
      const factor = e?.factor ?? e?.properties?.factor;
      return { i, coords, factor: typeof factor === "number" ? factor : null };
    })
    .filter(
      (
        line,
      ): line is { i: number; coords: Position[]; factor: number | null } =>
        Array.isArray(line.coords) && line.coords.length > 1,
    );
}

export const factorEffect = (factor: number | null) =>
  factor === null || factor === 1 ? "neutral" : factor > 1 ? "avoid" : "prefer";

export function withCostLine(request: Request, shape: string): Request {
  const lines = request.linear_cost_factors;
  return {
    ...request,
    linear_cost_factors: [
      ...(Array.isArray(lines) ? (lines as unknown[]) : []),
      { shape, factor: 1 },
    ],
  };
}

export function withFactor(
  request: Request,
  i: number,
  factor: number,
): Request {
  const lines = request.linear_cost_factors as Json[];
  return {
    ...request,
    linear_cost_factors: lines.map((entry, other) => {
      if (other !== i) return entry;
      if (typeof entry.shape === "string" || !isObject(entry.properties))
        return { ...entry, factor };
      return { ...entry, properties: { ...entry.properties, factor } };
    }),
  };
}

export function withoutCostLine(request: Request, i: number): Request {
  const { linear_cost_factors: lines, ...rest } = request;
  const left = (lines as unknown[]).filter((_, other) => other !== i);
  return left.length ? { ...request, linear_cost_factors: left } : rest;
}

/** The options set for `costing`. */
export function costingOptionsOf(
  request: Request | null,
  costing: string,
): Json {
  const all = request?.costing_options;
  const own = isObject(all) ? all[costing] : undefined;
  return isObject(own) ? own : {};
}

/** `undefined` removes the option, and the objects it leaves empty. */
export function withCostingOption(
  request: Request,
  costing: string,
  name: string,
  value: unknown,
): Request {
  const { costing_options: current, ...rest } = request;
  const all: Json = isObject(current) ? { ...current } : {};
  const own: Json = isObject(all[costing]) ? { ...all[costing] } : {};
  if (value === undefined) delete own[name];
  else own[name] = value;
  if (Object.keys(own).length) all[costing] = own;
  else delete all[costing];
  return Object.keys(all).length ? { ...request, costing_options: all } : rest;
}
