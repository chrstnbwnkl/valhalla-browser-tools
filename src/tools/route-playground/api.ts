import type { Position } from "geojson";
import { encodePolyline } from "../../shared/map/geo";
import { isObject, type Json } from "../../shared/valhalla/request";
import type { TracedLeg, TracePath } from "./edges";
import type { RouteResponse } from "./routes";

// weights and turn weights only come in this format
export const FORMAT = "osrm";

export type Filters = { attributes: string[]; action: "include" | "exclude" };

// the edges view can't draw an edge without these, so no filter drops them
const DRAWN_ATTRIBUTES = [
  "shape",
  "edge.begin_shape_index",
  "edge.end_shape_index",
];

/** Takes the filter with or without the "filters" key around it; throws on anything else. */
export function toFilters(value: unknown): Filters {
  const outer =
    isObject(value) && isObject(value.filters) ? value.filters : value;
  const { attributes, action } = isObject(outer) ? outer : {};
  if (
    !Array.isArray(attributes) ||
    !attributes.every((a) => typeof a === "string")
  )
    throw new Error('"attributes" must be a list of attribute names.');
  if (action !== "include" && action !== "exclude")
    throw new Error('"action" must be "include" or "exclude".');
  return { attributes, action };
}

async function post(
  server: string,
  endpoint: string,
  body: Json,
  signal?: AbortSignal,
) {
  // a string body is sent as text/plain, which avoids a CORS preflight
  const res = await fetch(`${server}/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  return (await res.json()) as unknown;
}

const valhallaError = (data: unknown, prefix = "error") =>
  isObject(data) && typeof data.error === "string"
    ? `${prefix} ${JSON.stringify(data.error_code)}: ${data.error}`
    : null;

export async function fetchRoute(
  server: string,
  request: Json,
  signal: AbortSignal,
) {
  let data: unknown;
  try {
    data = await post(server, "route", request, signal);
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(`Request to ${server} failed: ${(e as Error).message}`, {
      cause: e,
    });
  }
  const routes = isObject(data) ? data.routes : undefined;
  if (Array.isArray(routes) && routes.length) return data as RouteResponse;
  // errors come in Valhalla's shape or in OSRM's
  const osrm = isObject(data) && typeof data.message === "string" ? data : null;
  throw new Error(
    valhallaError(data, "Error") ??
      (osrm
        ? `${typeof osrm.code === "string" ? osrm.code : "Error"}: ${osrm.message as string}`
        : "No routes in the response."),
  );
}

/** A trace_attributes request for `coords`, with what the route was requested with. */
export function traceRequest(
  coords: Position[],
  shapeMatch: "edge_walk" | "map_snap",
  sent: Json,
  filters: Filters | null,
): Json {
  const trace: Json = {
    encoded_polyline: encodePolyline(coords),
    shape_match: shapeMatch,
  };
  for (const key of ["costing", "costing_options", "date_time"])
    if (key in sent) trace[key] = sent[key];
  if (filters) {
    const others = filters.attributes.filter(
      (a) => !DRAWN_ATTRIBUTES.includes(a),
    );
    trace.filters = {
      attributes:
        filters.action === "include"
          ? [...DRAWN_ATTRIBUTES, ...others]
          : others,
      action: filters.action,
    };
  }
  return trace;
}

/**
 * The edges of each leg. A leg is traced on its own, as edge_walk can't cross a
 * waypoint that breaks the route; where edge_walk fails (at via and through
 * waypoints), map_snap finds the edges instead, which may stray from the route.
 */
export function traceLegs(
  server: string,
  shapes: Position[][],
  sent: Json,
  filters: Filters | null,
  signal: AbortSignal,
): Promise<TracedLeg[]> {
  const trace = async (coords: Position[]): Promise<TracedLeg> => {
    let data: unknown;
    for (const shapeMatch of ["edge_walk", "map_snap"] as const) {
      data = await post(
        server,
        "trace_attributes",
        traceRequest(coords, shapeMatch, sent, filters),
        signal,
      );
      if (isObject(data) && Array.isArray(data.edges) && data.edges.length)
        return { path: data as TracePath, snapped: shapeMatch === "map_snap" };
    }
    throw new Error(valhallaError(data) ?? "no edges in the response");
  };
  return Promise.all(shapes.map(trace));
}

/** The encoded shape of the edges under a drawn line. */
export async function mapMatch(
  server: string,
  coords: Position[],
  request: Json,
) {
  const body: Json = {
    shape: coords.map(([lon, lat]) => ({ lon, lat })),
    shape_match: "map_snap",
    filters: { attributes: ["shape"], action: "include" },
  };
  for (const key of ["costing", "costing_options"])
    if (key in request) body[key] = request[key];
  let data: unknown;
  try {
    data = await post(server, "trace_attributes", body);
  } catch (e) {
    data = { error: (e as Error).message };
  }
  if (isObject(data) && typeof data.shape === "string") return data.shape;
  throw new Error(
    `Could not map match the line: ${valhallaError(data) ?? (isObject(data) && typeof data.error === "string" ? data.error : "no shape in the response")}`,
  );
}
