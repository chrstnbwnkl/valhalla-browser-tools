import type { Position } from "geojson";
import { decodePolyline } from "../../shared/map/geo";
import {
  flattenSteps,
  routeCoords,
  type RouteResponse,
  type Step,
} from "../../shared/valhalla/osrm";
import { isObject, type Json } from "../../shared/valhalla/request";

/** A step (OSRM) or maneuver (Valhalla) of a route. */
export type Segment = {
  idx: number;
  leg: number;
  coords: Position[];
  /** The weight (OSRM) or cost (Valhalla). */
  cost?: number;
  duration?: number;
  distance?: number;
  title: string;
  detail: string;
  arrival: boolean;
  /** Intersections along it; only OSRM has them, with their turn weights. */
  intersections: { at: Position; turnCost: number; raw: Json }[];
  raw: Json;
};

export type Route = {
  coords: Position[];
  segments: Segment[];
  legCosts: (number | undefined)[];
  cost?: number;
  /** What the cost is, e.g. the weight_name. */
  costName: string;
  duration?: number;
  distance?: number;
  distanceUnit: string;
};

export type Response = {
  format: "osrm" | "valhalla";
  /** The best route first, then the alternatives. */
  routes: Route[];
  waypoints: { at: Position; raw: Json }[];
};

// Valhalla's maneuver types for arriving at a destination
const ARRIVALS = new Set([4, 5, 6]);

function fromOsrm(data: RouteResponse): Response {
  const start = data.waypoints?.[0]?.location;
  return {
    format: "osrm",
    routes: data.routes.map((route) => ({
      coords: routeCoords(route, start),
      segments: flattenSteps(route).map(({ idx, legIdx, step, coords }) => {
        const { geometry: _, intersections = [], ...raw } = step as Step & Json;
        const maneuver = [step.maneuver?.type, step.maneuver?.modifier]
          .filter(Boolean)
          .join(" ");
        return {
          idx,
          leg: legIdx,
          coords,
          cost: step.weight,
          duration: step.duration,
          distance: step.distance,
          title: step.maneuver?.instruction ?? step.name ?? "",
          detail: `#${idx} ${maneuver}${step.ref ? ` · ref ${step.ref}` : ""}`,
          arrival: step.maneuver?.type === "arrive",
          intersections: intersections.flatMap((intersection) =>
            intersection.location
              ? [
                  {
                    at: intersection.location,
                    turnCost: intersection.turn_weight ?? 0,
                    raw: intersection,
                  },
                ]
              : [],
          ),
          raw,
        };
      }),
      legCosts: (route.legs ?? []).map((leg) => leg.weight),
      cost: route.weight,
      costName: `weight (${route.weight_name ?? "?"})`,
      duration: route.duration,
      distance: route.distance,
      distanceUnit: "m",
    })),
    waypoints: (data.waypoints ?? []).flatMap((w) =>
      w.location ? [{ at: w.location, raw: w }] : [],
    ),
  };
}

type Maneuver = Json & {
  begin_shape_index?: number;
  end_shape_index?: number;
  cost?: number;
  time?: number;
  length?: number;
  instruction?: string;
  street_names?: string[];
  type?: number;
};
type Trip = {
  units?: string;
  locations?: (Json & { lat: number; lon: number })[];
  summary?: { cost?: number; time?: number; length?: number };
  legs: {
    shape: string;
    maneuvers?: Maneuver[];
    summary?: { cost?: number };
  }[];
};

function fromTrip(trip: Trip): Route {
  let idx = 0;
  const segments = trip.legs.flatMap((leg, legIdx) => {
    const shape = decodePolyline(leg.shape);
    return (leg.maneuvers ?? []).map((maneuver) => ({
      idx: idx++,
      leg: legIdx,
      coords: shape.slice(
        maneuver.begin_shape_index ?? 0,
        (maneuver.end_shape_index ?? 0) + 1,
      ),
      cost: maneuver.cost,
      duration: maneuver.time,
      distance: maneuver.length,
      title: maneuver.instruction ?? "",
      detail: [`#${idx - 1}`, maneuver.street_names?.join(" / ")]
        .filter(Boolean)
        .join(" "),
      arrival: ARRIVALS.has(maneuver.type ?? -1),
      intersections: [],
      raw: maneuver,
    }));
  });
  return {
    coords: trip.legs.flatMap((leg) => decodePolyline(leg.shape)),
    segments,
    legCosts: trip.legs.map((leg) => leg.summary?.cost),
    cost: trip.summary?.cost,
    costName: "cost",
    duration: trip.summary?.time,
    distance: trip.summary?.length,
    distanceUnit: trip.units === "miles" ? "mi" : "km",
  };
}

function fromValhalla(trip: Trip, alternates: unknown[]): Response {
  return {
    format: "valhalla",
    routes: [
      trip,
      ...alternates.flatMap((a) =>
        isObject(a) && isObject(a.trip) ? [a.trip as Trip] : [],
      ),
    ].map(fromTrip),
    waypoints: (trip.locations ?? []).map((location) => ({
      at: [location.lon, location.lat],
      raw: location,
    })),
  };
}

/** Reads a /route response in Valhalla's or OSRM's format; throws on anything else. */
export function parseResponse(data: unknown): Response {
  if (!isObject(data)) throw new Error("A response is a JSON object.");
  if (typeof data.error === "string")
    throw new Error(
      `That is an error response: ${JSON.stringify(data.error_code)}: ${data.error}`,
    );
  if (isObject(data.trip) && Array.isArray(data.trip.legs))
    return fromValhalla(
      data.trip as Trip,
      Array.isArray(data.alternates) ? data.alternates : [],
    );
  if (Array.isArray(data.routes) && data.routes.length)
    return fromOsrm(data as RouteResponse);
  if (typeof data.message === "string")
    throw new Error(`That is an error response: ${data.message}`);
  throw new Error(
    "That is not a /route response in Valhalla's or OSRM's format.",
  );
}
