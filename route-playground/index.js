const darkScheme = matchMedia("(prefers-color-scheme: dark)");
// the colours of the design system, read from its tokens, which change with the theme
const TOKENS = [
  "surface",
  "ink",
  "ink-muted",
  "ink-subtle",
  "line",
  "green",
  "green-soft",
  "green-ink",
  "magenta",
  "magenta-soft",
  "magenta-ink",
  "blue",
  "amber",
  "danger",
];
const theme = {};
function readTheme() {
  const style = getComputedStyle(document.documentElement);
  for (const name of TOKENS)
    theme[name] = style.getPropertyValue(`--${name}`).trim();
}
readTheme();

// OSM's tiles in high-contrast greyscale, inverted for the dark theme, so only what is drawn on top
// has colour; the switch on the map brings back their own colours, for every tool
const BASEMAP_KEY = "valhalla-browser-tools:basemap";
let colourBasemap = false;
try {
  colourBasemap = localStorage.getItem(BASEMAP_KEY) === "colour";
} catch {
  // storage unavailable
}
const basemapPaint = () =>
  colourBasemap
    ? {
        "raster-saturation": 0,
        "raster-brightness-min": 0,
        "raster-brightness-max": 1,
        "raster-contrast": 0,
      }
    : darkScheme.matches
      ? {
          "raster-saturation": -1,
          "raster-brightness-min": 0.9,
          "raster-brightness-max": 0.04,
          "raster-contrast": 0.1,
        }
      : {
          "raster-saturation": -1,
          "raster-brightness-min": 0.08,
          "raster-brightness-max": 1,
          "raster-contrast": 0.1,
        };
const applyBasemap = () => {
  for (const [property, value] of Object.entries(basemapPaint()))
    map.setPaintProperty("osm", property, value);
};
const STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: basemapPaint() }],
};
// the servers added by hand, shared by the tools like the saved views
const SERVERS_KEY = "valhalla-browser-tools:servers";
// which server this tool uses; before the added servers were shared, it held this tool's own as well
const SELECTED_SERVER_KEY = "route-debugger:servers";
const LEGACY_SERVER_KEYS = [
  "locate-visualizer:servers",
  "route-debugger:servers",
];
// shared by the tools, so a view saved in one of them is there in the others
const VIEWS_KEY = "valhalla-browser-tools:views";
// where the tools kept their views before
const LEGACY_VIEWS_KEYS = ["locate-visualizer:views", "route-debugger:views"];
const FILTERS_KEY = "route-debugger:filters";
const PRESET_SERVERS = [
  "https://valhalla1.openstreetmap.de",
  "http://localhost:8002",
];
// the request travels in this URL parameter, the same one Valhalla itself accepts on GET requests
const URL_PARAM = "json";
// weights and turn weights only come in this format, so every request is sent with it
const FORMAT = "osrm";
// what a response is drawn with, emptied when the route goes
const SOURCES = [
  "alternatives",
  "steps",
  "step-ends",
  "intersections",
  "waypoints",
  "edges",
  "nodes",
];
// what the request's exclude_polygons and linear_cost_factors are drawn with
const SHAPE_SOURCES = ["exclusions", "cost-lines"];
// cost lines by what their factor does: avoid (> 1), prefer (< 1) or neither
const FACTOR_TOKENS = { avoid: "danger", prefer: "blue", neutral: "ink-muted" };

// The edges view, which colors the edges and nodes of a trace_attributes response by an attribute.
// Without an attribute, edges are the route's green and nodes are plain. Categorical values get the
// data series of the design system in order of frequency; anything past the last one is "other".
// Numbers get one hue from soft to strong, a different one for edges and for nodes.
const CATEGORICAL = ["green", "magenta", "ink", "blue", "amber"];
const OTHER_TOKEN = "ink-subtle"; // "other" and `false`
const MISSING_TOKEN = "line"; // the attribute is absent
const EDGE_RAMP = ["green-soft", "green", "green-ink"];
const NODE_RAMP = ["magenta-soft", "magenta", "magenta-ink"];
// the edges view can't draw an edge without these attributes, so no filter gets to drop them
const DRAWN_ATTRIBUTES = [
  "shape",
  "edge.begin_shape_index",
  "edge.end_shape_index",
];
// not worth a theme of their own
const HIDDEN_KEYS = new Set(["begin_shape_index", "end_shape_index"]);
// numeric, but identifiers rather than quantities
const ID_KEY = /(^|_)id$/;
const INVALID_REQUEST =
  "The request is not valid JSON; fix it before using the map or the inputs.";

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
// The per-location options that get an input. `values` makes it a select, anything else is a number;
// a dotted path is a key inside a nested object. `hint` is the server default.
const OPTIONS = [
  { path: "type", values: ["break", "through", "via", "break_through"] },
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
  { path: "waiting", hint: "0 s" },
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

const $ = (id) => document.getElementById(id);
const serverEl = $("server");
const removeServerEl = $("remove-server");
const addServerEl = $("add-server");
const serverUrlEl = $("server-url");
const input = $("input");
const sendEl = $("send");
const clearEl = $("clear");
const costingEl = $("costing");
const errorEl = $("error");
const statusEl = $("status");
const fieldsEl = $("fields");
const costingNoteEl = $("costing-note");
const costingFieldsEl = $("costing-fields");
const resultEl = $("result");
const routesEl = $("routes");
const summaryEl = $("summary");
const copyEl = $("copy");
const copyTraceEl = $("copy-trace");
const copyTraceResponseEl = $("copy-trace-response");
const viewEls = [...document.querySelectorAll('input[name="view"]')];
const themesEl = $("themes");
const edgeVisibleEl = $("edge-visible");
const nodeVisibleEl = $("node-visible");
const edgeLabelsEl = $("edge-labels");
const nodeLabelsEl = $("node-labels");
const edgeThemeEl = $("edge-theme");
const nodeThemeEl = $("node-theme");
const edgeLegendEl = $("edge-legend");
const nodeLegendEl = $("node-legend");
const stepsEl = $("steps");
const edgesEl = $("edges");
const filtersOpenEl = $("filters-open");
const filtersDialogEl = $("filters-dialog");
const filtersInputEl = $("filters-input");
const filtersErrorEl = $("filters-error");
const filtersClearEl = $("filters-clear");
const filtersCancelEl = $("filters-cancel");
const viewsEl = $("views");
const saveViewEl = $("save-view");
const viewNameEl = $("view-name");

// right-drag would rotate the map, but right-click opens the waypoint menus here
const map = new maplibregl.Map({
  container: "map",
  style: STYLE,
  center: [10, 50],
  zoom: 3,
  dragRotate: false,
});
map.addControl(
  new maplibregl.NavigationControl({ showCompass: false }),
  "top-right",
);
map.addControl(new maplibregl.ScaleControl());
map
  .getContainer()
  .querySelector(".maplibregl-ctrl-attrib-inner")
  ?.classList.add("wp-attribution");
map.getCanvas().style.cursor = "crosshair";

// the switch between the greyscale and the colour basemap, top centre on the map
const basemapToggleEl = el("input", {
  type: "checkbox",
  checked: colourBasemap,
});
map
  .getContainer()
  .append(
    el(
      "label",
      { className: "basemap-toggle wp-toggle wp-card wp-card--float" },
      basemapToggleEl,
      el("span", { className: "wp-toggle-track" }),
      "Color map",
    ),
  );

let servers = { custom: [], selected: PRESET_SERVERS[0] };
let request = { locations: [], costing: "auto", format: FORMAT }; // what the text box holds; null while that doesn't parse
let unseen = false; // the request was typed, pasted or came with the URL, so the map may not show its points yet
let pending = null; // AbortController of the request in flight
// the response on show: { data, sent, routes, routeIdx, status, traces }, where `traces` holds, for every
// route that was looked at in the edges view, the trace_attributes result of each leg: { path, snapped }
let state = null;
let view = "steps"; // how the selected route is shown: 'steps' with their weights, or 'edges' with their attributes
let pendingTrace = null; // AbortController of the trace_attributes request in flight
let steps = []; // flattened steps of the selected route
let edges = []; // edges of the selected route, in the edges view
// edgeTheme / nodeTheme: the attribute to color by, '' for the default theme
const themes = {
  edgeTheme: "",
  nodeTheme: "",
  showEdges: true,
  showNodes: true,
  labelEdges: false,
  labelNodes: false,
};
let labelMarkers = [];
let filters = null; // the attribute filter of the trace_attributes requests: { attributes, action }, null for all attributes
let views = []; // saved map views: { name, center: [lon, lat], zoom }
let markers = [];
let turnMarkers = [];
let popup = null;
let menu = null;
let terra = null; // terra-draw, for drawing exclude polygons and cost lines
let drawMode = null; // what a click on the map draws: 'polygon', 'linestring', or null for adding waypoints
let factorPopup = null; // where the factor of a cost line is edited
let factorMarkers = [];
let costingFields = []; // the inputs of the costing options, which depend on the costing
let shownCosting = null; // the costing those inputs are for

const fc = (features) => ({ type: "FeatureCollection", features });
const line = (coordinates, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "LineString", coordinates },
});
const point = (coordinates, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates },
});
const fmt = (n, unit = "") =>
  typeof n === "number" ? `${+n.toFixed(3)}${unit}` : "–";
const fmtValue = (value) =>
  typeof value === "number"
    ? fmt(value)
    : value === undefined
      ? "–"
      : String(value);
const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// A link to the way on openstreetmap.org.
const wayLink = (id) =>
  el("a", {
    className: "wp-link",
    href: `https://www.openstreetmap.org/way/${id}`,
    target: "_blank",
    rel: "noopener",
    textContent: id,
  });

// Text with every way id in it ("way_id": 123, way_id: 123, way 123) as a link to the way.
function withWayLinks(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/(way_id"?:\s*|\bway )(\d+)/g)) {
    const at = match.index + match[1].length;
    nodes.push(text.slice(last, at), wayLink(match[2]));
    last = at + match[2].length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

function fail(message) {
  errorEl.textContent = message;
}

// --- geometry ---------------------------------------------------------------

function decodePolyline(str, precision) {
  const factor = 10 ** precision;
  const coords = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < str.length) {
    for (const isLon of [false, true]) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (isLon) lon += delta;
      else lat += delta;
    }
    coords.push([lon / factor, lat / factor]);
  }
  return coords;
}

function encodePolyline(coords, precision) {
  const factor = 10 ** precision;
  let str = "";
  let previous = [0, 0];
  for (const [lon, lat] of coords) {
    const current = [Math.round(lat * factor), Math.round(lon * factor)];
    current.forEach((value, i) => {
      const delta = value - previous[i];
      let rest = delta < 0 ? ~(delta << 1) : delta << 1;
      for (; rest >= 0x20; rest >>= 5)
        str += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
      str += String.fromCharCode(rest + 63);
    });
    previous = current;
  }
  return str;
}

// Accepts GeoJSON or an encoded polyline. For encoded strings the precision (5 or 6) is
// guessed by checking which decoding starts closer to `hint`, a known [lon, lat].
function toCoords(geometry, hint) {
  if (!geometry) return [];
  if (typeof geometry !== "string") return geometry.coordinates ?? [];
  const p5 = decodePolyline(geometry, 5);
  const p6 = decodePolyline(geometry, 6);
  if (!p6.length) return [];
  if (!hint)
    return Math.abs(p5[0][1]) > 90 || Math.abs(p5[0][0]) > 180 ? p6 : p5;
  const dist = (c) => Math.hypot(c[0] - hint[0], c[1] - hint[1]);
  return dist(p6[0]) < dist(p5[0]) ? p6 : p5;
}

function flattenSteps(route) {
  const flat = [];
  (route.legs ?? []).forEach((leg, legIdx) => {
    (leg.steps ?? []).forEach((step) => {
      const idx = flat.length;
      flat.push({
        idx,
        legIdx,
        step,
        // one colour for the whole route, the step ends mark where steps meet
        color: theme.green,
        coords: toCoords(step.geometry, step.maneuver?.location),
      });
    });
  });
  return flat;
}

function routeCoords(route) {
  if (route.geometry)
    return toCoords(route.geometry, state.data.waypoints?.[0]?.location);
  return flattenSteps(route).flatMap((s) => s.coords);
}

// The end_node with its admin_index swapped for the admin it points at.
// The shape of every leg, put together from its steps. A route without steps is one shape.
function legShapes(selected) {
  const shapes = (selected.legs ?? []).map((leg) =>
    (leg.steps ?? [])
      .flatMap((step) => toCoords(step.geometry, step.maneuver?.location))
      // a step starts on the point the one before it ended on
      .filter(
        (c, i, all) => !i || c[0] !== all[i - 1][0] || c[1] !== all[i - 1][1],
      ),
  );
  return shapes.length && shapes.every((shape) => shape.length > 1)
    ? shapes
    : [routeCoords(selected)];
}

function resolveNode(path, node) {
  const admin = path.admins?.[node?.admin_index];
  if (!admin) return node;
  const { admin_index, ...rest } = node;
  return { ...rest, admin };
}

function pathEdges(path) {
  const shape = decodePolyline(path.shape ?? "", 6);
  return path.edges.map((edge, idx) => ({
    idx,
    edge,
    node: resolveNode(path, edge.end_node),
    coords: shape.slice(edge.begin_shape_index, edge.end_shape_index + 1),
  }));
}

// The point halfway along a line, for placing its label.
function midpoint(coords) {
  const lengths = coords
    .slice(1)
    .map((c, i) => Math.hypot(c[0] - coords[i][0], c[1] - coords[i][1]));
  let rest = lengths.reduce((acc, length) => acc + length, 0) / 2;
  for (const [i, length] of lengths.entries()) {
    if (rest <= length) {
      const t = length ? rest / length : 0;
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
      ];
    }
    rest -= length;
  }
  return coords[0];
}

// --- themes -----------------------------------------------------------------

// The value an attribute is themed by: lists of primitives (names) and flat objects (admin) are
// joined, lists of objects (intersecting_edges) are counted, and deeper objects can't be themed.
function scalar(value) {
  const flat = (values) => values.every((v) => typeof v !== "object");
  if (Array.isArray(value))
    return flat(value) ? value.join(" / ") : value.length;
  if (value === null || typeof value !== "object") return value ?? undefined;
  return flat(Object.values(value))
    ? Object.values(value).join(" / ")
    : undefined;
}

function themeKeys(objects) {
  const keys = new Set();
  for (const object of objects) {
    for (const [key, value] of Object.entries(object ?? {})) {
      if (!HIDDEN_KEYS.has(key) && scalar(value) !== undefined) keys.add(key);
    }
  }
  return [...keys].sort();
}

function rampColor(ramp, t) {
  const pos = Math.min(Math.max(t, 0), 1) * (ramp.length - 1);
  const i = Math.min(Math.floor(pos), ramp.length - 2);
  const [a, b] = [ramp[i], ramp[i + 1]].map((hex) =>
    [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)),
  );
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * (pos - i))).join(", ")})`;
}

// Maps the values of one attribute to colors: numbers onto `ramp`, everything else onto the
// categorical palette. Returns the color function and what the legend needs to explain it.
function makeScale(key, values, rampTokens) {
  const ramp = rampTokens.map((name) => theme[name]);
  const categorical = CATEGORICAL.map((name) => theme[name]);
  const otherColor = theme[OTHER_TOKEN];
  const missingColor = theme[MISSING_TOKEN];
  const present = values.filter((v) => v !== undefined);
  const missing = values.length - present.length;

  if (
    present.length &&
    present.every((v) => typeof v === "number") &&
    !ID_KEY.test(key)
  ) {
    const min = present.reduce((a, b) => Math.min(a, b));
    const max = present.reduce((a, b) => Math.max(a, b));
    return {
      color: (v) =>
        v === undefined
          ? missingColor
          : rampColor(ramp, max > min ? (v - min) / (max - min) : 1),
      ramp,
      min,
      max,
      missing,
    };
  }

  const counts = new Map();
  for (const v of present)
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const booleans = present.every((v) => typeof v === "boolean");
  const pick = (label, i) =>
    booleans
      ? label === "true"
        ? categorical[0]
        : otherColor
      : categorical[i];
  const rows = ranked
    .slice(0, categorical.length)
    .map(([label, count], i) => ({ label, count, color: pick(label, i) }));
  const colors = new Map(rows.map((row) => [row.label, row.color]));
  const rest = ranked.slice(categorical.length);
  if (rest.length) {
    rows.push({
      label: `other (${rest.length} values)`,
      count: rest.reduce((acc, [, count]) => acc + count, 0),
      color: otherColor,
    });
  }
  return {
    color: (v) =>
      v === undefined ? missingColor : (colors.get(String(v)) ?? otherColor),
    rows,
    missing,
  };
}

// `wayIds` makes the values links to their ways.
function drawLegend(target, scale, wayIds = false) {
  if (!scale) return target.replaceChildren();
  const row = ({ label, count, color }) => {
    const swatch = el("i");
    swatch.style.background = color;
    return el(
      "div",
      { className: "row" },
      swatch,
      el(
        "span",
        { title: label },
        wayIds && /^\d+$/.test(label) ? wayLink(label) : label,
      ),
      el("small", { textContent: count }),
    );
  };
  const children = [];
  if (scale.ramp) {
    const bar = el("div", { className: "ramp" });
    bar.style.background = `linear-gradient(to right, ${scale.ramp.join(", ")})`;
    children.push(
      bar,
      el(
        "div",
        { className: "ends" },
        el("span", { textContent: fmt(scale.min) }),
        el("span", { textContent: fmt(scale.max) }),
      ),
    );
  } else {
    children.push(...scale.rows.map(row));
  }
  if (scale.missing)
    children.push(
      row({
        label: "no value",
        count: scale.missing,
        color: theme[MISSING_TOKEN],
      }),
    );
  target.replaceChildren(...children);
}

// Fills a theme <select> with the attributes of the current path and returns the theme in
// effect. A chosen theme the path doesn't have falls back to the default without being forgotten.
function fillThemes(select, defaultLabel, keys, wanted) {
  select.replaceChildren(
    el("option", { value: "", textContent: defaultLabel }),
    ...keys.map((key) => el("option", { value: key, textContent: key })),
  );
  select.value = keys.includes(wanted) ? wanted : "";
  return select.value;
}

// --- servers ----------------------------------------------------------------

const allServers = () => [...PRESET_SERVERS, ...servers.custom];

// Turns what the user typed into a base URL, or null. Without a scheme, local hosts get http.
function normalizeServer(text) {
  let value = text.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value))
    value =
      (/^(localhost|\[|\d+\.\d+\.\d+\.\d+)/i.test(value)
        ? "http://"
        : "https://") + value;
  try {
    const url = new URL(value);
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function restoreServers() {
  const custom = (list) =>
    Array.isArray(list)
      ? list.filter(
          (url) => typeof url === "string" && !PRESET_SERVERS.includes(url),
        )
      : [];
  try {
    const shared = localStorage.getItem(SERVERS_KEY);
    // nothing shared yet: start from the servers the tools added on their own
    servers.custom =
      shared !== null
        ? custom(JSON.parse(shared))
        : [
            ...new Set(
              LEGACY_SERVER_KEYS.flatMap((key) =>
                custom(JSON.parse(localStorage.getItem(key))?.custom),
              ),
            ),
          ];
    const { selected } =
      JSON.parse(localStorage.getItem(SELECTED_SERVER_KEY)) ?? {};
    if (allServers().includes(selected)) servers.selected = selected;
  } catch {
    // storage unavailable or corrupt
  }
  // the server in use was removed, in another tab
  if (!allServers().includes(servers.selected))
    servers.selected = PRESET_SERVERS[0];
}

function selectServer(url) {
  servers.selected = url;
  updateServers();
  route();
}

function updateServers() {
  try {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers.custom));
    localStorage.setItem(
      SELECTED_SERVER_KEY,
      JSON.stringify({ selected: servers.selected }),
    );
  } catch {
    // storage unavailable
  }
  serverEl.replaceChildren(
    ...allServers().map((url) =>
      el("option", { value: url, textContent: url }),
    ),
  );
  serverEl.value = servers.selected;
  removeServerEl.disabled = PRESET_SERVERS.includes(servers.selected);
}

// --- saved views ------------------------------------------------------------

function restoreViews() {
  const read = (key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved)
      ? saved.filter(
          (view) =>
            typeof view?.name === "string" &&
            Array.isArray(view.center) &&
            Number.isFinite(view.zoom),
        )
      : [];
  };
  try {
    if (localStorage.getItem(VIEWS_KEY) !== null) {
      views = read(VIEWS_KEY);
      return;
    }
    // nothing shared yet: start from what the tools saved on their own, the first of a name wins
    views = [];
    for (const key of LEGACY_VIEWS_KEYS) {
      for (const view of read(key)) {
        if (!views.some((other) => other.name === view.name)) views.push(view);
      }
    }
  } catch {
    // storage unavailable or corrupt
  }
}

function updateViews() {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // storage unavailable
  }
  viewsEl.replaceChildren(
    ...views.map((view) => {
      const go = el("button", {
        type: "button",
        className: "wp-btn wp-btn--sm",
        textContent: view.name,
        title: "Show this view",
      });
      go.addEventListener("click", () =>
        map.jumpTo({ center: view.center, zoom: view.zoom }),
      );
      const remove = el("button", {
        type: "button",
        className: "wp-btn wp-btn--ghost wp-btn--sm",
        textContent: "×",
        title: `Remove "${view.name}"`,
      });
      remove.addEventListener("click", () => {
        views = views.filter((other) => other !== view);
        updateViews();
      });
      return el("span", { className: "view" }, go, remove);
    }),
  );
}

// Saving under a name that exists replaces that view.
function saveView(name) {
  const { lng, lat } = map.getCenter();
  const view = {
    name,
    center: [+lng.toFixed(6), +lat.toFixed(6)],
    zoom: +map.getZoom().toFixed(2),
  };
  const existing = views.findIndex((other) => other.name === name);
  if (existing < 0) views.push(view);
  else views[existing] = view;
  updateViews();
}

// --- request ----------------------------------------------------------------

const isPoint = (location) =>
  Number.isFinite(location?.lat) && Number.isFinite(location.lon);
const locations = () =>
  Array.isArray(request?.locations) ? request.locations.filter(isObject) : [];

// An input of a location or costing option: a select when the option has `values`, else a number.
function addField(parent, label, field, title, onChange) {
  field.control = field.values
    ? el(
        "select",
        { className: "wp-input" },
        el("option", { value: "", textContent: "default" }),
        ...field.values.map((value) =>
          el("option", { value, textContent: value }),
        ),
      )
    : el("input", {
        className: "wp-input wp-input--mono",
        type: "number",
        step: "any",
        placeholder: field.hint,
      });
  field.control.addEventListener("change", onChange);
  parent.append(
    el(
      "label",
      { className: "wp-field", title },
      el("span", { className: "code", textContent: label }),
      field.control,
    ),
  );
}

// `undefined` when the input is empty, which leaves the option out of the request
function fieldValue({ control, values }) {
  const raw = control.value;
  if (raw === "") return undefined;
  if (!values) return Number(raw);
  return raw === "true" ? true : raw === "false" ? false : raw;
}

// A location option the locations disagree on shows as "mixed"; it stays untouched until the user sets it.
function showField(field, value, mixed = false) {
  const { control, values, hint } = field;
  control.value = mixed || value === undefined ? "" : String(value);
  if (values) control.options[0].textContent = mixed ? "mixed" : "default";
  else control.placeholder = mixed ? "mixed" : hint;
}

function getOption(location, path) {
  const [key, sub] = path.split(".");
  return sub ? location[key]?.[sub] : location[key];
}

// `undefined` removes the option
function setOption(location, path, value) {
  const [key, sub] = path.split(".");
  if (!sub) {
    if (value === undefined) delete location[key];
    else location[key] = value;
    return;
  }
  const group = isObject(location[key]) ? location[key] : {};
  if (value === undefined) delete group[sub];
  else group[sub] = value;
  if (Object.keys(group).length) location[key] = group;
  else delete location[key];
}

function newLocation(lngLat) {
  const location = { lat: +lngLat.lat.toFixed(6), lon: +lngLat.lng.toFixed(6) };
  for (const option of OPTIONS) {
    const value = fieldValue(option);
    if (value !== undefined) setOption(location, option.path, value);
  }
  return location;
}

function applyOption(option) {
  if (!request) return fail(INVALID_REQUEST);
  const value = fieldValue(option);
  showField(option, value);
  for (const location of locations()) setOption(location, option.path, value);
  writeRequest();
  route();
}

// The costing options on offer are those of the request's costing, followed by the ones every costing has.
function buildCostingFields(costing) {
  shownCosting = costing;
  costingFields = [];
  costingFieldsEl.replaceChildren();
  costingNoteEl.textContent = costing
    ? `— of ${costing}`
    : "— set a costing first";
  if (!costing) return;

  const { costings, schemas } = COSTING_OPTIONS;
  const own = schemas[costings[costing]] ?? [];
  const shared = schemas.Base.filter(
    (spec) => !own.some((other) => other.name === spec.name),
  );
  for (const [group, specs] of [
    [costing, own],
    ["all costings", shared],
  ]) {
    if (!specs.length) continue;
    costingFieldsEl.append(
      el("div", { className: "group code", textContent: group }),
    );
    for (const spec of specs) {
      const field = {
        name: spec.name,
        values: spec.enum ?? (spec.type === "boolean" ? BOOLEAN : undefined),
        hint: spec.default === undefined ? "" : String(spec.default),
      };
      const range =
        "minimum" in spec || "maximum" in spec
          ? ` (${spec.minimum ?? ""}–${spec.maximum ?? ""})`
          : "";
      const preset =
        field.values && spec.default !== undefined
          ? ` Default: ${spec.default}.`
          : "";
      addField(
        costingFieldsEl,
        spec.name,
        field,
        `${spec.description}${range}${preset}`,
        () => applyCostingOption(field),
      );
      costingFields.push(field);
    }
  }
}

function applyCostingOption(field) {
  if (!request) return fail(INVALID_REQUEST);
  const value = fieldValue(field);
  const all = isObject(request.costing_options) ? request.costing_options : {};
  const own = isObject(all[shownCosting]) ? all[shownCosting] : {};
  if (value === undefined) delete own[field.name];
  else own[field.name] = value;
  if (Object.keys(own).length) all[shownCosting] = own;
  else delete all[shownCosting];
  if (Object.keys(all).length) request.costing_options = all;
  else delete request.costing_options;
  writeRequest();
  route();
}

// Makes the inputs show what the request says, rather than changing it.
function syncControls() {
  const costing = typeof request.costing === "string" ? request.costing : "";
  costingEl.value = costing;
  if (costing !== shownCosting) buildCostingFields(costing);
  for (const field of costingFields)
    showField(field, request.costing_options?.[costing]?.[field.name]);

  const all = locations();
  if (!all.length) return; // keep what the inputs hold for the first point
  for (const option of OPTIONS) {
    const seen = new Set(
      all.map((location) => JSON.stringify(getOption(location, option.path))),
    );
    showField(option, getOption(all[0], option.path), seen.size > 1);
  }
}

function updateUrl() {
  try {
    history.replaceState(
      null,
      "",
      `?${new URLSearchParams({ [URL_PARAM]: JSON.stringify(request) })}`,
    );
  } catch {
    // some browsers refuse this for pages opened from disk
  }
}

// Call after the text box changed by hand and parsed.
function requestChanged() {
  updateUrl();
  drawInputs();
  drawShapes();
}

// Call after changing `request` in code.
function writeRequest() {
  input.value = JSON.stringify(request, null, 2);
  requestChanged();
}

function readRequest() {
  try {
    const parsed = JSON.parse(input.value);
    if (!isObject(parsed))
      throw new Error("The request must be a JSON object.");
    request = parsed;
  } catch (error) {
    request = null;
    fail(error.message);
    return;
  }
  fail("");
  unseen = true;
  syncControls();
  requestChanged();
}

function setLocations(next) {
  request.locations = next;
  writeRequest();
  route();
}

// `index` is where in the list of waypoints the new one goes
function insertLocation(lngLat, index) {
  const next = Array.isArray(request.locations) ? [...request.locations] : [];
  next.splice(index ?? next.length, 0, newLocation(lngLat));
  setLocations(next);
}

function moveLocation(from, to) {
  const next = [...request.locations];
  next.splice(to, 0, ...next.splice(from, 1));
  setLocations(next);
}

// --- exclude polygons and cost lines ---------------------------------------

const round6 = ([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)];

// The outer rings of exclude_polygons, which is a list of rings or a GeoJSON FeatureCollection.
// `i` is where the ring is in the request.
function exclusionRings() {
  const value = request?.exclude_polygons;
  const rings = Array.isArray(value)
    ? value
    : value?.type === "FeatureCollection"
      ? value.features?.map((feature) => feature?.geometry?.coordinates?.[0])
      : [];
  return (rings ?? [])
    .map((ring, i) => ({ i, ring }))
    .filter(({ ring }) => Array.isArray(ring) && ring.length > 2);
}

function addExclusion(ring) {
  const value = request.exclude_polygons;
  if (value?.type === "FeatureCollection" && Array.isArray(value.features)) {
    value.features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  } else {
    request.exclude_polygons = [...(Array.isArray(value) ? value : []), ring];
  }
  writeRequest();
  route();
}

// `i` is where the ring is in the request; without one, every polygon goes.
function deleteExclusions(i) {
  const value = request.exclude_polygons;
  const list = Array.isArray(value) ? value : value?.features;
  if (i !== undefined && Array.isArray(list)) list.splice(i, 1);
  if (i === undefined || !list?.length) delete request.exclude_polygons;
  writeRequest();
  route();
}

// The lines of linear_cost_factors, each an encoded shape with a factor or a GeoJSON feature with a factor property.
function costLines() {
  const entries = Array.isArray(request?.linear_cost_factors)
    ? request.linear_cost_factors
    : [];
  return entries
    .map((entry, i) => ({
      i,
      coords:
        typeof entry?.shape === "string"
          ? decodePolyline(entry.shape, 6)
          : entry?.geometry?.coordinates,
      factor: entry?.factor ?? entry?.properties?.factor,
    }))
    .filter(({ coords }) => Array.isArray(coords) && coords.length > 1);
}

function setFactor(i, factor) {
  const entry = request.linear_cost_factors[i];
  if (typeof entry.shape === "string" || !isObject(entry.properties))
    entry.factor = factor;
  else entry.properties.factor = factor;
  writeRequest();
  route();
}

function deleteCostLine(i) {
  request.linear_cost_factors.splice(i, 1);
  if (!request.linear_cost_factors.length) delete request.linear_cost_factors;
  writeRequest();
  route();
}

// Cost factors apply to the edges under a line, so a drawn line is first map matched onto the edges.
async function addCostLine(id, coords) {
  statusEl.textContent = "Map matching the drawn line…";
  const server = servers.selected;
  const body = {
    shape: coords.map(([lon, lat]) => ({ lon, lat })),
    shape_match: "map_snap",
    filters: { attributes: ["shape"], action: "include" },
  };
  for (const key of ["costing", "costing_options"]) {
    if (key in request) body[key] = request[key];
  }
  let data;
  try {
    const response = await fetch(`${server}/trace_attributes`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    data = await response.json();
  } catch (error) {
    data = { error: error.message };
  }
  terra.removeFeatures([id]);
  statusEl.textContent = state?.status ?? "";
  if (typeof data?.shape !== "string") {
    return fail(
      `Could not map match the line: ${data?.error_code ? `error ${data.error_code}: ` : ""}${data?.error ?? "no shape in the response"}`,
    );
  }
  if (!request) return fail(INVALID_REQUEST);
  request.linear_cost_factors = [
    ...(Array.isArray(request.linear_cost_factors)
      ? request.linear_cost_factors
      : []),
    { shape: data.shape, factor: 1 },
  ];
  writeRequest();
  route();
}

const factorEffect = (factor) =>
  typeof factor !== "number" || factor === 1
    ? "neutral"
    : factor > 1
      ? "avoid"
      : "prefer";

// Draws the exclude polygons and cost lines of the request.
function drawShapes() {
  const rings = exclusionRings();
  deletePolygonsEl.hidden = !rings.length;
  const lines = costLines();
  for (const marker of factorMarkers) marker.remove();
  factorMarkers = lines.map(({ i, coords, factor }) => {
    const label = el("div", {
      className: "factor-label wp-tag",
      textContent: `× ${factor ?? "?"}`,
      title: "Click to change the factor or delete the line",
    });
    label.style.borderColor = theme[FACTOR_TOKENS[factorEffect(factor)]];
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      openFactorPopup(i, midpoint(coords));
    });
    return new maplibregl.Marker({ element: label })
      .setLngLat(midpoint(coords))
      .addTo(map);
  });
  ready.then(() => {
    map.getSource("exclusions").setData(
      fc(
        rings.map(({ i, ring }) => ({
          type: "Feature",
          properties: { i },
          geometry: { type: "Polygon", coordinates: [ring] },
        })),
      ),
    );
    map.getSource("cost-lines").setData(
      fc(
        lines.map(({ i, coords, factor }) =>
          line(coords, {
            i,
            color: theme[FACTOR_TOKENS[factorEffect(factor)]],
          }),
        ),
      ),
    );
  });
}

function openFactorPopup(i, lngLat) {
  const entry = request?.linear_cost_factors?.[i];
  if (!entry) return;
  const factorEl = el("input", {
    className: "wp-input wp-input--mono",
    type: "number",
    step: "any",
    min: 0,
    value: entry.factor ?? entry.properties?.factor ?? "",
  });
  factorEl.addEventListener("change", () => {
    if (factorEl.value !== "") setFactor(i, Number(factorEl.value));
  });
  const deleteEl = el("button", {
    type: "button",
    textContent: "Delete",
    className: "wp-btn wp-btn--danger",
  });
  deleteEl.addEventListener("click", () => {
    factorPopup.remove();
    deleteCostLine(i);
  });
  factorPopup?.remove();
  factorPopup = new maplibregl.Popup({ maxWidth: "240px" })
    .setLngLat(lngLat)
    .setDOMContent(
      el(
        "div",
        { className: "factor-popup" },
        el(
          "label",
          { className: "wp-field" },
          el("span", { className: "code", textContent: "factor" }),
          factorEl,
        ),
        deleteEl,
      ),
    )
    .addTo(map);
  factorEl.focus();
  factorEl.select();
}

// `mode` is a terra-draw mode, or null to go back to adding waypoints. Choosing the active mode again ends it.
function setDrawMode(mode) {
  drawMode = mode === drawMode ? null : mode;
  terra?.setMode(drawMode ?? "static");
  drawPolygonEl.classList.toggle("wp-btn--ink", drawMode === "polygon");
  drawLineEl.classList.toggle("wp-btn--ink", drawMode === "linestring");
  map.getCanvas().style.cursor = drawMode ? "" : "crosshair";
}

// the buttons that switch between adding waypoints and drawing, on the map
const drawPolygonEl = el("button", {
  type: "button",
  className: "wp-btn wp-btn--sm",
  textContent: "Exclude polygon",
  title: "Draw polygons that routes avoid; click the first point to finish one",
});
const drawLineEl = el("button", {
  type: "button",
  className: "wp-btn wp-btn--sm",
  textContent: "Cost line",
  title:
    "Draw lines whose edges get a cost factor; click the last point again to finish one",
});
const deletePolygonsEl = el("button", {
  type: "button",
  textContent: "Delete all polygons",
  className: "wp-btn wp-btn--sm wp-btn--danger",
  hidden: true,
});
// a card over the map rather than a MapLibre control, whose button styles would win over the design system's
map.addControl(
  {
    onAdd: () =>
      el(
        "div",
        { className: "draw-tools wp-card wp-card--float" },
        drawPolygonEl,
        drawLineEl,
        deletePolygonsEl,
      ),
    onRemove() {},
  },
  "top-left",
);

// --- context menus ----------------------------------------------------------

function closeMenu() {
  menu?.remove();
  menu = null;
}

// `items` are { label, action, danger }
function openMenu({ clientX, clientY }, title, items) {
  closeMenu();
  const list = el(
    "div",
    { className: "menu wp-card wp-card--float" },
    el("b", { className: "caption", textContent: title }),
  );
  for (const { label, action, danger } of items) {
    const button = el("button", {
      type: "button",
      textContent: label,
      className: `wp-btn wp-btn--sm ${danger ? "wp-btn--danger" : "wp-btn--ghost"}`,
    });
    button.addEventListener("click", () => {
      closeMenu();
      action();
    });
    list.append(button);
  }
  // the backdrop takes the click that dismisses the menu, so that it doesn't add a waypoint
  menu = el("div", { className: "menu-backdrop" }, list);
  menu.addEventListener("click", (e) => e.target === menu && closeMenu());
  menu.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (e.target === menu) closeMenu();
  });
  document.body.append(menu);
  list.style.left = `${Math.max(0, Math.min(clientX, innerWidth - list.offsetWidth - 4))}px`;
  list.style.top = `${Math.max(0, Math.min(clientY, innerHeight - list.offsetHeight - 4))}px`;
}

function openMapMenu(e) {
  const count = Array.isArray(request.locations) ? request.locations.length : 0;
  const items = [];
  for (let i = 0; i <= count; i++) {
    const label = !count
      ? "Add as the first waypoint"
      : i === 0
        ? "Insert as the start"
        : i === count
          ? "Append as the end"
          : `Insert between ${i} and ${i + 1}`;
    items.push({ label, action: () => insertLocation(e.lngLat, i) });
  }
  const { lng, lat } = e.lngLat.wrap();
  const lonLat = `${lng.toFixed(6)},${lat.toFixed(6)}`;
  items.push({ label: `Copy ${lonLat}`, action: () => copyText(lonLat) });
  openMenu(e.originalEvent, "New waypoint", items);
}

function openMarkerMenu(e, i) {
  const count = request.locations.length;
  const items = [
    {
      label: "Delete",
      danger: true,
      action: () =>
        setLocations(request.locations.filter((_, other) => other !== i)),
    },
  ];
  for (let to = 0; to < count; to++) {
    if (to === i) continue;
    const where = to === 0 ? " (start)" : to === count - 1 ? " (end)" : "";
    items.push({
      label: `Move to position ${to + 1}${where}`,
      action: () => moveLocation(i, to),
    });
  }
  openMenu(e, `Waypoint ${i + 1}`, items);
}

// --- map --------------------------------------------------------------------

const ready = new Promise((resolve) => map.on("load", resolve)).then(() => {
  for (const id of [...SHAPE_SOURCES, ...SOURCES])
    map.addSource(id, { type: "geojson", data: fc([]) });

  const round = { "line-cap": "round", "line-join": "round" };
  // colours that come from the tokens rather than the data are set by paintLayers()
  map.addLayer({
    id: "exclusions-fill",
    type: "fill",
    source: "exclusions",
    paint: { "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "exclusions",
    type: "line",
    source: "exclusions",
    paint: { "line-width": 2, "line-dasharray": [3, 2] },
  });
  map.addLayer({
    id: "cost-lines",
    type: "line",
    source: "cost-lines",
    layout: round,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 12,
      "line-opacity": 0.4,
    },
  });
  map.addLayer({
    id: "alternatives",
    type: "line",
    source: "alternatives",
    layout: round,
    paint: { "line-width": 5, "line-opacity": 0.4 },
  });
  map.addLayer({
    id: "steps-casing",
    type: "line",
    source: "steps",
    layout: round,
    paint: { "line-width": 9 },
  });
  map.addLayer({
    id: "steps",
    type: "line",
    source: "steps",
    layout: round,
    paint: { "line-color": ["get", "color"], "line-width": 5 },
  });
  map.addLayer({
    id: "steps-active",
    type: "line",
    source: "steps",
    layout: round,
    filter: ["==", ["get", "idx"], -1],
    paint: { "line-width": 9, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "step-ends",
    type: "circle",
    source: "step-ends",
    paint: {
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": ["get", "color"],
    },
  });
  // amber = intersection carries a turn_weight
  map.addLayer({
    id: "intersections",
    type: "circle",
    source: "intersections",
    paint: { "circle-radius": 3 },
  });
  // where the server snapped the waypoints to
  map.addLayer({
    id: "waypoints",
    type: "circle",
    source: "waypoints",
    paint: { "circle-radius": 5, "circle-stroke-width": 2 },
  });

  // the edges view; a dark casing, so the soft end of a ramp still reads on the basemap
  map.addLayer({
    id: "edges-casing",
    type: "line",
    source: "edges",
    layout: round,
    paint: { "line-width": 8 },
  });
  map.addLayer({
    id: "edges",
    type: "line",
    source: "edges",
    layout: round,
    paint: { "line-color": ["get", "color"], "line-width": 5 },
  });
  map.addLayer({
    id: "edges-active",
    type: "line",
    source: "edges",
    layout: round,
    filter: ["==", ["get", "idx"], -1],
    paint: { "line-width": 11, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "nodes",
    type: "circle",
    source: "nodes",
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "color"],
      "circle-stroke-width": 2,
    },
  });
  paintLayers();

  map.on("mousemove", "steps", (e) => {
    const { idx } = e.features[0].properties;
    highlightStep(idx);
    steps[idx]?.item.scrollIntoView({ block: "nearest" });
  });
  map.on("mouseleave", "steps", () => highlightStep(null));
  map.on("mousemove", "edges", (e) => {
    const { idx } = e.features[0].properties;
    highlightEdge(idx);
    edges[idx]?.item.scrollIntoView({ block: "nearest" });
  });
  map.on("mouseleave", "edges", () => highlightEdge(null));
  for (const layer of [
    "intersections",
    "waypoints",
    "edges",
    "nodes",
    "cost-lines",
  ]) {
    map.on(
      "mouseenter",
      layer,
      () => !drawMode && (map.getCanvas().style.cursor = "pointer"),
    );
    map.on(
      "mouseleave",
      layer,
      () => !drawMode && (map.getCanvas().style.cursor = "crosshair"),
    );
  }

  // terra-draw only takes the drawing; a finished shape goes into the request, which is what gets drawn
  terra = new terraDraw.TerraDraw({
    adapter: new terraDrawMaplibreGlAdapter.TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new terraDraw.TerraDrawPolygonMode({ styles: polygonStyles() }),
      new terraDraw.TerraDrawLineStringMode({ styles: lineStyles() }),
    ],
  });
  terra.start();
  terra.setMode(drawMode ?? "static");
  terra.on("finish", (id, { mode }) => {
    const feature = terra.getSnapshotFeature(id);
    if (!request) {
      terra.removeFeatures([id]);
      return fail(INVALID_REQUEST);
    }
    if (mode === "polygon") {
      terra.removeFeatures([id]);
      addExclusion(feature.geometry.coordinates[0].map(round6));
    } else if (mode === "linestring") {
      addCostLine(id, feature.geometry.coordinates);
    }
  });
});

// the paint properties that take a token rather than a colour from the data
const THEMED_PAINT = [
  ["exclusions-fill", "fill-color", () => theme.danger],
  ["exclusions", "line-color", () => theme.danger],
  ["alternatives", "line-color", () => theme.ink],
  ["steps-casing", "line-color", () => theme.surface],
  ["steps-active", "line-color", () => theme.magenta],
  ["step-ends", "circle-color", () => theme.surface],
  [
    "intersections",
    "circle-color",
    () => [
      "case",
      [">", ["get", "turnWeight"], 0],
      theme.amber,
      theme["ink-subtle"],
    ],
  ],
  ["waypoints", "circle-color", () => theme.ink],
  ["waypoints", "circle-stroke-color", () => theme.surface],
  ["edges-casing", "line-color", () => theme["ink-muted"]],
  ["edges-active", "line-color", () => theme.magenta],
  ["nodes", "circle-stroke-color", () => theme.ink],
];

function paintLayers() {
  for (const [layer, property, value] of THEMED_PAINT)
    map.setPaintProperty(layer, property, value());
}

// what is being drawn: exclude polygons in the danger colour, cost lines in ink
const polygonStyles = () => ({
  fillColor: theme.danger,
  fillOpacity: 0.15,
  outlineColor: theme.danger,
  outlineWidth: 2,
  closingPointColor: theme.danger,
  closingPointOutlineColor: theme.surface,
});
const lineStyles = () => ({
  lineStringColor: theme.ink,
  lineStringWidth: 3,
  closingPointColor: theme.ink,
  closingPointOutlineColor: theme.surface,
});

// Everything drawn takes its colours from the tokens, so a theme change draws it all again.
function applyTheme() {
  readTheme();
  applyBasemap();
  paintLayers();
  terra?.setModeStyles("polygon", polygonStyles());
  terra?.setModeStyles("linestring", lineStyles());
  drawInputs();
  drawShapes();
  if (state) draw();
}

// The numbered waypoints, straight from the request: the start, the stops and the destination.
function drawInputs() {
  for (const marker of markers) marker.remove();
  markers = [];
  (Array.isArray(request?.locations) ? request.locations : []).forEach(
    (location, i) => {
      if (!isPoint(location)) return;
      const role =
        i === 0
          ? "start"
          : i === request.locations.length - 1
            ? "destination"
            : "stop";
      const element = el("div", {
        className: `input-marker ${role}`,
        textContent: i + 1,
        title: "Drag to move, right-click to delete or reorder",
      });
      // MapLibre starts a drag on any button, and a right-click's release lands on the menu, not the map,
      // so the drag would never end and the next click on the map would move this waypoint there
      element.addEventListener(
        "mousedown",
        (e) => e.button !== 0 && e.stopPropagation(),
      );
      element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation(); // or the map opens its own menu
        openMarkerMenu(e, i);
      });
      const marker = new maplibregl.Marker({ element, draggable: true })
        .setLngLat([location.lon, location.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        Object.assign(location, { lat: +lat.toFixed(6), lon: +lng.toFixed(6) });
        writeRequest();
        route();
      });
      markers.push(marker);
    },
  );
}

// Shows the selected route in the chosen view.
function draw() {
  clearRoute();
  fail("");
  for (const radio of viewEls) radio.checked = radio.value === view;
  stepsEl.hidden = view !== "steps";
  edgesEl.hidden = view !== "edges";
  statusEl.textContent = state.status;
  if (view === "edges") showEdges();
  else drawSteps();
}

function drawSteps() {
  const { data, routes, routeIdx } = state;
  const selected = routes[routeIdx];
  steps = flattenSteps(selected);

  const allCoords = steps.length
    ? steps.flatMap((s) => s.coords)
    : routeCoords(selected);
  const labelled = steps.filter(
    (s) => s.coords.length && s.step.maneuver?.type !== "arrive",
  );

  map
    .getSource("alternatives")
    .setData(
      fc(
        routes
          .filter((_, i) => i !== routeIdx)
          .map((r) => line(routeCoords(r))),
      ),
    );
  map
    .getSource("steps")
    .setData(
      fc(
        steps.length
          ? steps
              .filter((s) => s.coords.length > 1)
              .map((s) => line(s.coords, { idx: s.idx, color: s.color }))
          : [line(allCoords, { idx: -2, color: theme.green })],
      ),
    );
  map
    .getSource("step-ends")
    .setData(
      fc(labelled.map((s) => point(s.coords.at(-1), { color: s.color }))),
    );
  map.getSource("intersections").setData(
    fc(
      steps.flatMap((s) =>
        (s.step.intersections ?? [])
          .map((intersection, i) =>
            point(intersection.location, {
              idx: s.idx,
              i,
              turnWeight: intersection.turn_weight ?? 0,
            }),
          )
          .filter((f) => f.geometry.coordinates),
      ),
    ),
  );
  map
    .getSource("waypoints")
    .setData(
      fc(
        (data.waypoints ?? [])
          .map((w, i) => w?.location && point(w.location, { i }))
          .filter(Boolean),
      ),
    );

  // the weight of every step, shown where the step ends
  for (const s of labelled) {
    const label = el("div", {
      className: "step-label wp-tag",
      textContent: fmt(s.step.weight),
      title: `step ${s.idx} weight`,
    });
    label.style.borderColor = s.color;
    label.addEventListener("mouseenter", () => highlightStep(s.idx));
    label.addEventListener("mouseleave", () => highlightStep(null));
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      s.item.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    s.label = label;
    s.marker = new maplibregl.Marker({
      element: label,
      anchor: "left",
      offset: [10, 0],
    })
      .setLngLat(s.coords.at(-1))
      .addTo(map);
  }

  // turn weights, shown on the opposite side of the intersection from the step weights
  for (const s of steps) {
    (s.step.intersections ?? []).forEach((intersection, i) => {
      if (!intersection.turn_weight || !intersection.location) return;
      const label = el("div", {
        className: "turn-label wp-tag",
        textContent: `t ${fmt(intersection.turn_weight)}`,
        title: `step ${s.idx} · intersection ${i} turn_weight`,
      });
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        showPopup(
          `step ${s.idx} · intersection ${i}`,
          intersection,
          intersection.location,
        );
      });
      turnMarkers.push(
        new maplibregl.Marker({
          element: label,
          anchor: "right",
          offset: [-10, 0],
        })
          .setLngLat(intersection.location)
          .addTo(map),
      );
    });
  }

  drawStepsPanel(selected);
}

// a figure of the summary above the steps or edges
function tile(label, value, unit) {
  return el(
    "div",
    { className: "wp-stat" },
    el("span", { className: "wp-stat-label", textContent: label }),
    el(
      "b",
      { className: "code" },
      value,
      unit && value !== "–" ? el("small", { textContent: ` ${unit}` }) : "",
    ),
  );
}

function drawStepsPanel(selected) {
  summaryEl.replaceChildren(
    tile(`weight (${selected.weight_name ?? "?"})`, fmt(selected.weight)),
    tile("duration", fmt(selected.duration), "s"),
    tile("distance", fmt(selected.distance), "m"),
  );

  stepsEl.replaceChildren();
  let cumulative = 0;
  (selected.legs ?? []).forEach((leg, legIdx) => {
    const legSteps = steps.filter((s) => s.legIdx === legIdx);
    const sum = legSteps.reduce((acc, s) => acc + (s.step.weight ?? 0), 0);
    const matches = Math.abs(sum - (leg.weight ?? 0)) < 0.01;
    stepsEl.append(
      el(
        "li",
        { className: "leg label" },
        `Leg ${legIdx} · weight ${fmt(leg.weight)} `,
        el("span", {
          className: `wp-badge ${matches ? "wp-badge--green" : "wp-badge--danger"}`,
          textContent: matches ? "= Σ steps" : `≠ Σ steps ${fmt(sum)}`,
        }),
      ),
    );

    for (const s of legSteps) {
      const { step } = s;
      cumulative += step.weight ?? 0;
      const turns = (step.intersections ?? []).reduce(
        (acc, intersection) => acc + (intersection.turn_weight ?? 0),
        0,
      );
      const maneuver = [step.maneuver?.type, step.maneuver?.modifier]
        .filter(Boolean)
        .join(" ");
      const swatch = el("span", { className: "swatch" });
      swatch.style.background = s.color;
      s.item = el(
        "li",
        { className: "step" },
        swatch,
        el(
          "div",
          { className: "instr" },
          step.maneuver?.instruction ?? step.name ?? "",
          el("small", {
            className: "caption",
            textContent: `#${s.idx} ${maneuver}${step.ref ? ` · ref ${step.ref}` : ""}`,
          }),
        ),
        el(
          "div",
          { className: "metrics" },
          el("b", { textContent: fmt(step.weight) }),
          el("small", { textContent: `Σ ${fmt(cumulative)}` }),
          el("small", {
            className: "turns",
            textContent: turns ? `turns ${fmt(turns)}` : "",
          }),
          el("small", {
            textContent: `${fmt(step.duration, " s")} · ${fmt(step.distance, " m")}`,
          }),
        ),
      );
      s.item.addEventListener("mouseenter", () => highlightStep(s.idx));
      s.item.addEventListener("mouseleave", () => highlightStep(null));
      s.item.addEventListener("click", () => {
        if (!s.coords.length) return;
        const bounds = s.coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(),
        );
        map.fitBounds(bounds, { padding: 120, maxZoom: 17 });
      });
      stepsEl.append(s.item);
    }
  });
}

function highlightStep(idx) {
  map.setFilter("steps-active", ["==", ["get", "idx"], idx ?? -1]);
  for (const s of steps) {
    s.item?.classList.toggle("active", s.idx === idx);
    s.label?.classList.toggle("active", s.idx === idx);
  }
}

// --- edges view -------------------------------------------------------------

// Gets the edges of the selected route from trace_attributes, once per route, and draws them.
// Every leg is traced on its own: edge_walk can't follow a shape across a waypoint that breaks the route.
async function showEdges() {
  const shown = state;
  const { routes, routeIdx, traces } = state;
  if (!traces[routeIdx]) {
    const controller = new AbortController();
    pendingTrace = controller;
    statusEl.textContent = `${state.status} · requesting trace_attributes…`;
    const server = servers.selected;
    // edge_walk gives exactly the edges of the route, but also fails at via and through waypoints;
    // map_snap then finds the edges by map matching, which may stray from the route
    const trace = async (coords) => {
      let data;
      for (const shapeMatch of ["edge_walk", "map_snap"]) {
        const response = await fetch(`${server}/trace_attributes`, {
          method: "POST",
          body: JSON.stringify(traceRequest(coords, shapeMatch)),
          signal: controller.signal,
        });
        data = await response.json();
        if (Array.isArray(data?.edges) && data.edges.length)
          return { path: data, snapped: shapeMatch === "map_snap" };
      }
      throw new Error(
        data?.error
          ? `error ${data.error_code}: ${data.error}`
          : "no edges in the response",
      );
    };
    let legs;
    try {
      legs = await Promise.all(legShapes(routes[routeIdx]).map(trace));
    } catch (error) {
      if (controller.signal.aborted) return;
      statusEl.textContent = state.status;
      return fail(`trace_attributes on ${server} failed: ${error.message}`);
    }
    // the route or the view changed in the meantime
    if (controller.signal.aborted || state !== shown) return;
    traces[routeIdx] = legs;
  }
  const snapped = traces[routeIdx].flatMap((leg, i) =>
    leg.snapped ? [i] : [],
  );
  statusEl.textContent = snapped.length
    ? `${state.status} · edge_walk failed for leg ${snapped.join(", ")}: its edges are map-matched`
    : state.status;
  copyTraceResponseEl.hidden = false;
  drawEdges();
}

function applyVisibility() {
  edgeVisibleEl.checked = themes.showEdges;
  nodeVisibleEl.checked = themes.showNodes;
  const show = (layers, visible) =>
    layers.forEach((id) =>
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"),
    );
  show(["edges-casing", "edges", "edges-active"], themes.showEdges);
  show(["nodes"], themes.showNodes);
}

// Puts the themed value (or the index, for the default themes) on every visible edge and node.
function drawLabels() {
  edgeLabelsEl.checked = themes.labelEdges;
  nodeLabelsEl.checked = themes.labelNodes;
  for (const marker of labelMarkers) marker.remove();
  labelMarkers = [];
  const add = (className, text, color, lngLat, options) => {
    const label = el("div", {
      className: `${className} wp-tag`,
      textContent: text,
    });
    label.style.borderColor = color;
    labelMarkers.push(
      new maplibregl.Marker({ element: label, ...options })
        .setLngLat(lngLat)
        .addTo(map),
    );
  };
  for (const e of edges) {
    if (
      themes.showEdges &&
      themes.labelEdges &&
      e.label &&
      e.coords.length > 1
    ) {
      add("edge-label", e.label, e.color, midpoint(e.coords));
    }
    if (
      themes.showNodes &&
      themes.labelNodes &&
      e.nodeLabel &&
      e.node &&
      e.coords.length
    ) {
      add("node-label", e.nodeLabel, e.nodeColor, e.coords.at(-1), {
        anchor: "left",
        offset: [10, 0],
      });
    }
  }
}

function drawEdges() {
  applyVisibility();
  const legs = state.traces[state.routeIdx];
  edges = legs.flatMap(({ path }, leg) =>
    pathEdges(path).map((e) => ({ ...e, leg })),
  );
  edges.forEach((e, idx) => (e.idx = idx));
  const nodes = edges.filter((e) => e.node);

  const edgeTheme = fillThemes(
    edgeThemeEl,
    "Edge index",
    themeKeys(edges.map((e) => e.edge)),
    themes.edgeTheme,
  );
  const nodeTheme = fillThemes(
    nodeThemeEl,
    "Uniform",
    themeKeys(nodes.map((e) => e.node)),
    themes.nodeTheme,
  );
  for (const e of edges) {
    e.value = scalar(e.edge[edgeTheme]);
    e.nodeValue = scalar(e.node?.[nodeTheme]);
    e.label = edgeTheme
      ? e.value === undefined
        ? ""
        : fmtValue(e.value)
      : `#${e.idx}`;
    e.nodeLabel = nodeTheme
      ? e.nodeValue === undefined
        ? ""
        : fmtValue(e.nodeValue)
      : `#${e.idx}`;
  }
  const edgeScale = edgeTheme
    ? makeScale(
        edgeTheme,
        edges.map((e) => e.value),
        EDGE_RAMP,
      )
    : null;
  const nodeScale = nodeTheme
    ? makeScale(
        nodeTheme,
        nodes.map((e) => e.nodeValue),
        NODE_RAMP,
      )
    : null;
  for (const e of edges) {
    e.color = edgeScale ? edgeScale.color(e.value) : theme.green;
    e.nodeColor = nodeScale ? nodeScale.color(e.nodeValue) : theme.surface;
  }
  drawLegend(edgeLegendEl, edgeScale, edgeTheme === "way_id");
  drawLegend(nodeLegendEl, nodeScale);
  themesEl.hidden = false;

  map
    .getSource("edges")
    .setData(
      fc(
        edges
          .filter((e) => e.coords.length > 1)
          .map((e) => line(e.coords, { idx: e.idx, color: e.color })),
      ),
    );
  map
    .getSource("nodes")
    .setData(
      fc(
        nodes
          .filter((e) => e.coords.length)
          .map((e) =>
            point(e.coords.at(-1), { idx: e.idx, color: e.nodeColor }),
          ),
      ),
    );

  drawEdgesPanel(legs, edgeTheme, nodeTheme);
  drawLabels();
}

function drawEdgesPanel(legs, edgeTheme, nodeTheme) {
  const unit = { kilometers: " km", miles: " mi" }[legs[0].path.units] ?? "";
  // elapsed_time starts over in every leg
  const elapsed = legs.map(
    ({ path }) =>
      path.edges.findLast(
        (edge) => typeof edge.end_node?.elapsed_time === "number",
      )?.end_node.elapsed_time,
  );
  const hasLength = edges.some((e) => typeof e.edge.length === "number");
  summaryEl.replaceChildren(
    tile("edges", String(edges.length)),
    tile(
      "length",
      hasLength
        ? fmt(edges.reduce((acc, e) => acc + (e.edge.length ?? 0), 0))
        : "–",
      unit.trim(),
    ),
    tile(
      "elapsed time",
      fmt(
        elapsed.every((time) => typeof time === "number")
          ? elapsed.reduce((acc, time) => acc + time, 0)
          : undefined,
      ),
      "s",
    ),
  );

  edgesEl.replaceChildren();
  for (const e of edges) {
    const { edge } = e;
    if (legs.length > 1 && e.leg !== edges[e.idx - 1]?.leg) {
      edgesEl.append(
        el(
          "li",
          { className: "leg label" },
          `Leg ${e.leg} · ${legs[e.leg].path.edges.length} edges `,
          legs[e.leg].snapped
            ? el("span", {
                className: "wp-badge wp-badge--amber",
                textContent: "map-matched",
              })
            : "",
        ),
      );
    }
    const swatch = el("span", { className: "swatch" });
    swatch.style.background = e.color;
    const nodeLine = el("small");
    if (nodeTheme && e.node) {
      const dot = el("span", { className: "dot" });
      dot.style.background = e.nodeColor;
      nodeLine.append(dot, fmtValue(e.nodeValue));
    }
    e.item = el(
      "li",
      { className: "edge" },
      swatch,
      el(
        "div",
        { className: "instr" },
        edge.names?.join(" / ") || "Unnamed",
        el("small", {
          className: "caption",
          textContent: [`#${e.idx}`, edge.road_class, edge.use]
            .filter(Boolean)
            .join(" · "),
        }),
      ),
      el(
        "div",
        { className: "metrics" },
        el(
          "b",
          {},
          edgeTheme === "way_id" && e.value !== undefined
            ? wayLink(e.value)
            : edgeTheme
              ? fmtValue(e.value)
              : fmt(edge.length, unit),
        ),
        el("small", {
          textContent:
            edgeTheme && typeof edge.length === "number"
              ? fmt(edge.length, unit)
              : "",
        }),
        nodeLine,
      ),
    );
    e.item.addEventListener("mouseenter", () => highlightEdge(e.idx));
    e.item.addEventListener("mouseleave", () => highlightEdge(null));
    e.item.addEventListener("click", () => {
      if (!e.coords.length) return;
      const bounds = e.coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(),
      );
      map.fitBounds(bounds, { padding: 120, maxZoom: 17 });
    });
    edgesEl.append(e.item);
  }
}

function highlightEdge(idx) {
  map.setFilter("edges-active", ["==", ["get", "idx"], idx ?? -1]);
  for (const e of edges) e.item?.classList.toggle("active", e.idx === idx);
}

function showPopup(title, object, lngLat) {
  const body = Object.entries(object)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  popup?.remove();
  popup = new maplibregl.Popup({ maxWidth: "360px" })
    .setLngLat(lngLat)
    .setDOMContent(el("pre", {}, ...withWayLinks(`${title}\n${body}`)))
    .addTo(map);
}

// Takes the selected route off the map and the panel.
function clearRoute() {
  pendingTrace?.abort();
  popup?.remove();
  for (const s of steps) s.marker?.remove();
  for (const marker of [...turnMarkers, ...labelMarkers]) marker.remove();
  turnMarkers = [];
  labelMarkers = [];
  steps = [];
  edges = [];
  for (const id of SOURCES) map.getSource(id).setData(fc([]));
  themesEl.hidden = true;
  copyTraceResponseEl.hidden = true;
  summaryEl.replaceChildren();
  stepsEl.replaceChildren();
  edgesEl.replaceChildren();
}

function clearResults() {
  pending?.abort();
  state = null;
  resultEl.hidden = true;
  statusEl.textContent = "";
  ready.then(clearRoute);
}

// Moves the map to the points of a request that didn't come from clicking it, or that are out of view.
function showInputs() {
  const coords = markers.map((marker) => marker.getLngLat());
  if (
    !coords.length ||
    (!unseen && coords.every((c) => map.getBounds().contains(c)))
  )
    return;
  unseen = false;
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(),
  );
  map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 0 });
}

async function send() {
  if (!request) return fail(INVALID_REQUEST);
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  fail("");
  statusEl.textContent = "Requesting…";
  showInputs();

  const server = servers.selected;
  const sent = { ...request, format: FORMAT };
  const started = performance.now();
  let data;
  try {
    // a string body is sent as text/plain, which spares the CORS preflight; Valhalla parses it as JSON anyway
    const response = await fetch(`${server}/route`, {
      method: "POST",
      body: JSON.stringify(sent),
      signal: controller.signal,
    });
    data = await response.json();
  } catch (error) {
    if (controller.signal.aborted) return;
    clearResults();
    return fail(`Request to ${server} failed: ${error.message}`);
  }
  if (controller.signal.aborted) return;
  const routes = data?.routes;
  if (!Array.isArray(routes) || !routes.length) {
    clearResults();
    // errors come in Valhalla's own shape or in OSRM's
    const message = data?.error
      ? `Error ${data.error_code}: ${data.error}`
      : data?.message
        ? `${data.code ?? "Error"}: ${data.message}`
        : "No routes in the response.";
    return fail(message);
  }

  await ready;
  const status = `${routes.length} ${routes.length > 1 ? "routes" : "route"} · ${Math.round(performance.now() - started)} ms`;
  state = { data, sent, routes, routeIdx: 0, status, traces: [] };
  routesEl.replaceChildren(
    ...routes.map((r, i) =>
      el("option", {
        value: i,
        textContent: `Route ${i} · weight ${fmt(r.weight)}`,
      }),
    ),
  );
  routesEl.hidden = routes.length < 2;
  resultEl.hidden = false;
  draw();
}

// Sends the request after it changed through the map or the inputs, once it has enough waypoints.
function route() {
  if (!request) return;
  if (locations().filter(isPoint).length >= 2) send();
  else clearResults();
}

// What trace_attributes needs to find the edges under `coords`, by default the whole route on show,
// with the costing the route was made with.
function traceRequest(
  coords = routeCoords(state.routes[state.routeIdx]),
  shapeMatch = "edge_walk",
) {
  const { sent } = state;
  const trace = {
    encoded_polyline: encodePolyline(coords, 6),
    shape_match: shapeMatch,
  };
  for (const key of ["costing", "costing_options", "date_time"]) {
    if (key in sent) trace[key] = sent[key];
  }
  if (filters) {
    const others = filters.attributes.filter(
      (attribute) => !DRAWN_ATTRIBUTES.includes(attribute),
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

// --- attribute filter -------------------------------------------------------

// Takes the filter as the request has it, with or without the "filters" key around it. Throws on anything else.
function parseFilters(text) {
  const parsed = JSON.parse(text);
  const { attributes, action } = parsed?.filters ?? parsed ?? {};
  if (
    !Array.isArray(attributes) ||
    !attributes.every((attribute) => typeof attribute === "string")
  )
    throw new Error('"attributes" must be a list of attribute names.');
  if (action !== "include" && action !== "exclude")
    throw new Error('"action" must be "include" or "exclude".');
  return { attributes, action };
}

function restoreFilters() {
  try {
    filters = parseFilters(localStorage.getItem(FILTERS_KEY));
  } catch {
    // nothing saved, or storage unavailable or corrupt
  }
}

// The edges that were fetched with the old filter are dropped, and the edges view fetches them again.
function setFilters(next) {
  filters = next;
  try {
    if (filters) localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    else localStorage.removeItem(FILTERS_KEY);
  } catch {
    // storage unavailable
  }
  updateFilters();
  if (!state) return;
  state.traces = [];
  if (view === "edges") draw();
}

function updateFilters() {
  filtersOpenEl.textContent = filters
    ? `Attribute filter: ${filters.action} ${filters.attributes.length}…`
    : "Attribute filter…";
}

function openFilters() {
  filtersInputEl.value = filters ? JSON.stringify({ filters }, null, 2) : "";
  filtersErrorEl.textContent = "";
  filtersDialogEl.showModal();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    fail("The browser refused access to the clipboard.");
  }
}

async function copy(button, value) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  } catch {
    return fail("The browser refused access to the clipboard.");
  }
  const label = button.textContent;
  button.textContent = "Copied";
  button.disabled = true;
  setTimeout(() => {
    button.textContent = label;
    button.disabled = false;
  }, 1200);
}

// --- wiring -----------------------------------------------------------------

let group = null;
for (const option of OPTIONS) {
  const [key, sub] = option.path.split(".");
  if (sub && key !== group)
    fieldsEl.append(el("div", { className: "group code", textContent: key }));
  group = sub ? key : null;
  addField(fieldsEl, sub ?? key, option, "", () => applyOption(option));
}
$("costings").replaceChildren(
  ...COSTING_OPTIONS.types.map((value) => el("option", { value })),
);

map.on("click", (e) => {
  // terra-draw has this click
  if (drawMode) return;
  if (e.originalEvent.target.closest?.(".input-marker")) return;
  // this click only dismisses the popup
  if (popup?.isOpen()) return popup.remove();
  if (factorPopup?.isOpen()) return factorPopup.remove();
  // results that can be inspected take the click, then the cost lines underneath; anywhere else it adds a waypoint
  const [feature] = [
    ...map.queryRenderedFeatures(e.point, {
      layers: ["waypoints", "intersections", "nodes", "edges"],
    }),
    ...map.queryRenderedFeatures(e.point, { layers: ["cost-lines"] }),
  ];
  if (feature) {
    const { idx, i } = feature.properties;
    const at = feature.geometry.coordinates;
    if (feature.layer.id === "cost-lines") return openFactorPopup(i, e.lngLat);
    if (feature.layer.id === "waypoints")
      return showPopup(`waypoint ${i}`, state.data.waypoints[i], at);
    if (feature.layer.id === "intersections")
      return showPopup(
        `step ${idx} · intersection ${i}`,
        steps[idx].step.intersections[i],
        at,
      );
    if (feature.layer.id === "nodes")
      return showPopup(`edge ${idx} · end_node`, edges[idx].node, at);
    const { end_node, ...attributes } = edges[idx].edge;
    return showPopup(`edge ${idx}`, attributes, e.lngLat);
  }
  if (!request) return fail(INVALID_REQUEST);
  insertLocation(e.lngLat);
});
map.on("contextmenu", (e) => {
  e.originalEvent.preventDefault();
  if (!request) return fail(INVALID_REQUEST);
  const [polygon] = map.queryRenderedFeatures(e.point, {
    layers: ["exclusions-fill"],
  });
  if (polygon)
    return openMenu(e.originalEvent, "Exclude polygon", [
      {
        label: "Delete",
        danger: true,
        action: () => deleteExclusions(polygon.properties.i),
      },
    ]);
  if (!drawMode) openMapMenu(e);
});
drawPolygonEl.addEventListener("click", () => setDrawMode("polygon"));
drawLineEl.addEventListener("click", () => setDrawMode("linestring"));
deletePolygonsEl.addEventListener("click", () => {
  if (!request) return fail(INVALID_REQUEST);
  deleteExclusions();
});
map.on("movestart", closeMenu);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeMenu());

input.addEventListener("input", readRequest);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
});
sendEl.addEventListener("click", send);
clearEl.addEventListener("click", () => {
  if (!request) return fail(INVALID_REQUEST);
  setLocations([]);
});
costingEl.addEventListener("change", () => {
  if (!request) return fail(INVALID_REQUEST);
  if (costingEl.value.trim()) request.costing = costingEl.value.trim();
  else delete request.costing;
  syncControls();
  writeRequest();
  route();
});
routesEl.addEventListener("change", () => {
  state.routeIdx = +routesEl.value;
  draw();
});
copyEl.addEventListener("click", () => copy(copyEl, state.data));
copyTraceEl.addEventListener("click", () => copy(copyTraceEl, traceRequest()));
filtersOpenEl.addEventListener("click", openFilters);
filtersCancelEl.addEventListener("click", () => filtersDialogEl.close());
filtersClearEl.addEventListener("click", () => {
  filtersDialogEl.close();
  setFilters(null);
});
filtersDialogEl.addEventListener("submit", (e) => {
  // an empty box is no filter; anything that doesn't parse keeps the dialog open
  let next = null;
  try {
    if (filtersInputEl.value.trim()) next = parseFilters(filtersInputEl.value);
  } catch (error) {
    e.preventDefault();
    filtersErrorEl.textContent = error.message;
    return;
  }
  setFilters(next);
});
// one response per leg; a route of a single leg gives just that response
copyTraceResponseEl.addEventListener("click", () => {
  const paths = state.traces[state.routeIdx].map((leg) => leg.path);
  copy(copyTraceResponseEl, paths.length > 1 ? paths : paths[0]);
});
for (const radio of viewEls) {
  radio.addEventListener("change", () => {
    view = radio.value;
    draw();
  });
}
for (const [control, key] of [
  [edgeVisibleEl, "showEdges"],
  [nodeVisibleEl, "showNodes"],
  [edgeLabelsEl, "labelEdges"],
  [nodeLabelsEl, "labelNodes"],
]) {
  control.addEventListener("change", () => {
    themes[key] = control.checked;
    applyVisibility();
    drawLabels();
  });
}
for (const [control, key] of [
  [edgeThemeEl, "edgeTheme"],
  [nodeThemeEl, "nodeTheme"],
]) {
  control.addEventListener("change", () => {
    themes[key] = control.value;
    drawEdges();
  });
}

serverEl.addEventListener("change", () => selectServer(serverEl.value));
removeServerEl.addEventListener("click", () => {
  servers.custom = servers.custom.filter((url) => url !== servers.selected);
  selectServer(PRESET_SERVERS[0]);
});
addServerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = normalizeServer(serverUrlEl.value);
  if (!url) return fail("That is not a valid server address.");
  fail("");
  if (!allServers().includes(url)) servers.custom.push(url);
  serverUrlEl.value = "";
  selectServer(url);
});

saveViewEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = viewNameEl.value.trim();
  if (!name) return;
  viewNameEl.value = "";
  saveView(name);
});

darkScheme.addEventListener("change", () => ready.then(applyTheme));
basemapToggleEl.addEventListener("change", () => {
  colourBasemap = basemapToggleEl.checked;
  try {
    localStorage.setItem(BASEMAP_KEY, colourBasemap ? "colour" : "grey");
  } catch {
    // storage unavailable
  }
  ready.then(applyBasemap);
});

restoreServers();
updateServers();
// keep up with servers added or removed in other tabs, of this tool or another one
window.addEventListener("storage", (e) => {
  if (e.key !== SERVERS_KEY) return;
  restoreServers();
  updateServers();
});
restoreViews();
// keep up with views saved in other tabs, of this tool or another one
window.addEventListener("storage", (e) => {
  if (e.key !== VIEWS_KEY) return;
  restoreViews();
  updateViews();
});
restoreFilters();
updateFilters();
updateViews();

const shared = new URLSearchParams(location.search).get(URL_PARAM);
if (shared === null) {
  syncControls();
  writeRequest();
} else {
  try {
    input.value = JSON.stringify(JSON.parse(shared), null, 2);
  } catch {
    input.value = shared;
  }
  readRequest();
  route();
}
