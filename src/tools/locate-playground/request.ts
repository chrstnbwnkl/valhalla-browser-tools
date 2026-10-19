// The /locate request, as edited in the text box, by the map and by the inputs.

export type Json = Record<string, unknown>;
/** A request: any JSON object, since the user may type anything Valhalla accepts. */
export type LocateRequest = Json;
export type Location = Json;

export const INVALID_REQUEST =
  "The request is not valid JSON; fix it before using the map or the inputs.";

export const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const pretty = (value: unknown) => JSON.stringify(value, null, 2);

/** The request in `text`, or why there is none. */
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

/** The request's locations array as it is, objects or not. */
export const rawLocations = (request: LocateRequest | null): unknown[] =>
  Array.isArray(request?.locations) ? request.locations : [];

/** The locations that are objects, the only ones options apply to. */
export const locationsOf = (request: LocateRequest | null) =>
  rawLocations(request).filter(isObject);

/** Where a location is, if it says so properly. */
export function positionOf(
  location: unknown,
): [lon: number, lat: number] | null {
  if (
    !isObject(location) ||
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lon)
  )
    return null;
  return [location.lon as number, location.lat as number];
}

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
 * A per-location option that gets an input. `values` makes it a select, anything else is a number; a dotted path
 * is a key inside a nested object. `hint` is the server default.
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
  if (!sub) return location[key];
  const group = location[key];
  return isObject(group) ? group[sub] : undefined;
}

/** A copy of `location` with the option set; `undefined` removes it, and a group it leaves empty. */
export function withOption(
  location: Location,
  path: string,
  value: unknown,
): Location {
  const [key = "", sub] = path.split(".");
  const next = { ...location };
  if (!sub) {
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  }
  const current = next[key];
  const group: Json = isObject(current) ? { ...current } : {};
  if (value === undefined) delete group[sub];
  else group[sub] = value;
  if (Object.keys(group).length) next[key] = group;
  else delete next[key];
  return next;
}

/** The value an input's text stands for; `undefined` when empty. */
export function optionValue(option: Option, raw: string): unknown {
  if (raw === "") return undefined;
  if (!option.values) return Number(raw);
  return raw === "true" ? true : raw === "false" ? false : raw;
}

/** A location at `lngLat` with the options the inputs hold. */
export function newLocation(
  lngLat: { lng: number; lat: number },
  fields: Fields,
): Location {
  let location: Location = {
    lat: +lngLat.lat.toFixed(6),
    lon: +lngLat.lng.toFixed(6),
  };
  for (const option of OPTIONS) {
    const value = optionValue(option, fields.values[option.path] ?? "");
    if (value !== undefined)
      location = withOption(location, option.path, value);
  }
  return location;
}

/**
 * What the option inputs show: the text of each, by path, and the options the locations disagree on. A mixed
 * option shows empty and stays untouched until the user sets it.
 */
export type Fields = {
  values: Record<string, string>;
  mixed: ReadonlySet<string>;
};

export const NO_FIELDS: Fields = { values: {}, mixed: new Set() };

/** The inputs showing what the request says. Without locations, they keep what they hold, for the first point. */
export function fieldsFor(request: LocateRequest, current: Fields): Fields {
  const all = locationsOf(request);
  const [first] = all;
  if (!first) return current;
  const values: Record<string, string> = {};
  const mixed = new Set<string>();
  for (const { path } of OPTIONS) {
    const seen = new Set(
      all.map((location) => JSON.stringify(getOption(location, path))),
    );
    const value = getOption(first, path);
    if (seen.size > 1) mixed.add(path);
    else if (value !== undefined)
      values[path] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return { values, mixed };
}
