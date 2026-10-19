export type Json = Record<string, unknown>;
/** Any JSON object: the user may type anything Valhalla accepts. */
export type LocateRequest = Json;
export type Location = Json;

export const INVALID_REQUEST =
  "The request is not valid JSON; fix it before using the map or the inputs.";

export const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function parseRequest(
  text: string,
): { request: LocateRequest; error: null } | { request: null; error: string } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed))
      return { request: null, error: "The request must be a JSON object." };
    return { request: parsed, error: null };
  } catch (error) {
    return { request: null, error: (error as Error).message };
  }
}

export const locationsOf = (request: LocateRequest | null): Location[] =>
  Array.isArray(request?.locations) ? request.locations.filter(isObject) : [];

export function positionOf({ lat, lon }: Location): [number, number] | null {
  return typeof lat === "number" && typeof lon === "number" ? [lon, lat] : null;
}

export const newLocation = (
  { lng, lat }: { lng: number; lat: number },
  options: Location,
): Location => ({ lat: +lat.toFixed(6), lon: +lng.toFixed(6), ...options });

const ROAD_CLASSES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "service_other",
];
const BOOLEAN = ["true", "false"];

/**
 * A per-location option with an input: a select with `values`, a number
 * otherwise. `hint` is the server default; a dotted path is nested.
 */
export type Option = { path: string; values?: string[]; hint?: string };

export const OPTIONS: Option[] = [
  { path: "radius", hint: "0 m" },
  { path: "search_cutoff", hint: "35000 m" },
  { path: "minimum_reachability", hint: "50 edges" },
  { path: "node_snap_tolerance", hint: "5 m" },
  { path: "heading", hint: "0–360°" },
  { path: "heading_tolerance", hint: "60°" },
  { path: "street_side_tolerance", hint: "5 m" },
  { path: "street_side_max_distance", hint: "1000 m" },
  { path: "street_side_cutoff", values: ROAD_CLASSES },
  { path: "preferred_side", values: ["either", "same", "opposite"] },
  { path: "rank_candidates", values: BOOLEAN },
  { path: "preferred_layer", hint: "none" },
  { path: "search_filter.min_road_class", values: ROAD_CLASSES },
  { path: "search_filter.max_road_class", values: ROAD_CLASSES },
  { path: "search_filter.exclude_tunnel", values: BOOLEAN },
  { path: "search_filter.exclude_bridge", values: BOOLEAN },
  { path: "search_filter.exclude_toll", values: BOOLEAN },
  { path: "search_filter.exclude_ramp", values: BOOLEAN },
  { path: "search_filter.exclude_ferry", values: BOOLEAN },
  { path: "search_filter.exclude_closures", values: BOOLEAN },
  { path: "search_filter.level", hint: "none" },
];

export function getOption(location: Location, path: string): unknown {
  const [key = "", sub] = path.split(".");
  const value = location[key];
  if (!sub) return value;
  return isObject(value) ? value[sub] : undefined;
}

/** A copy with the option set; `undefined` removes it, and a group it empties. */
export function withOption(
  location: Location,
  path: string,
  value: unknown,
): Location {
  const [key = "", sub] = path.split(".");
  const next = { ...location };
  if (sub) {
    const group = isObject(next[key]) ? { ...next[key] } : {};
    if (value === undefined) delete group[sub];
    else group[sub] = value;
    value = Object.keys(group).length ? group : undefined;
  }
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** The value an input's text stands for; `undefined` when empty. */
export function optionValue(option: Option, raw: string): unknown {
  if (raw === "") return undefined;
  if (!option.values) return Number(raw);
  return raw === "true" ? true : raw === "false" ? false : raw;
}

/** What an option's input shows: the value all locations share, or mixed. */
export function optionState(locations: Location[], path: string) {
  const seen = new Set(
    locations.map((location) => JSON.stringify(getOption(location, path))),
  );
  if (seen.size > 1) return { value: "", mixed: true };
  const value = locations[0] && getOption(locations[0], path);
  return {
    value:
      value === undefined
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value),
    mixed: false,
  };
}
