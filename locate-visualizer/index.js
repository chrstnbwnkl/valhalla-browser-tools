const STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
// the servers added by hand, shared by the tools like the saved views
const SERVERS_KEY = 'valhalla-browser-tools:servers';
// which server this tool uses; before the added servers were shared, it held this tool's own as well
const SELECTED_SERVER_KEY = 'locate-visualizer:servers';
const LEGACY_SERVER_KEYS = ['locate-visualizer:servers', 'route-debugger:servers'];
// shared by the tools, so a view saved in one of them is there in the others
const VIEWS_KEY = 'valhalla-browser-tools:views';
// where the tools kept their views before
const LEGACY_VIEWS_KEYS = ['locate-visualizer:views', 'route-debugger:views'];
const PRESET_SERVERS = ['https://valhalla1.openstreetmap.de', 'http://localhost:8002'];
// the request travels in this URL parameter, the same one Valhalla itself accepts on GET requests
const URL_PARAM = 'json';
const SOURCES = ['radius', 'circles', 'snaps', 'edges', 'points'];
// one per location, in request order
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const INVALID_REQUEST = 'The request is not valid JSON; fix it before using the map or the inputs.';

const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service_other'];
const BOOLEAN = ['true', 'false'];
// The per-location options that get an input. `values` makes it a select, anything else is a number;
// a dotted path is a key inside a nested object. `hint` is the server default.
const OPTIONS = [
  { path: 'radius', hint: '0 m' },
  { path: 'search_cutoff', hint: '35000 m' },
  { path: 'minimum_reachability', hint: '50 edges' },
  { path: 'node_snap_tolerance', hint: '5 m' },
  { path: 'heading', hint: '0–360°' },
  { path: 'heading_tolerance', hint: '60°' },
  { path: 'street_side_tolerance', hint: '5 m' },
  { path: 'street_side_max_distance', hint: '1000 m' },
  { path: 'street_side_cutoff', values: ROAD_CLASSES },
  { path: 'preferred_side', values: ['either', 'same', 'opposite'] },
  { path: 'rank_candidates', values: BOOLEAN },
  { path: 'preferred_layer', hint: 'none' },
  { path: 'search_filter.min_road_class', values: ROAD_CLASSES },
  { path: 'search_filter.max_road_class', values: ROAD_CLASSES },
  { path: 'search_filter.exclude_tunnel', values: BOOLEAN },
  { path: 'search_filter.exclude_bridge', values: BOOLEAN },
  { path: 'search_filter.exclude_toll', values: BOOLEAN },
  { path: 'search_filter.exclude_ramp', values: BOOLEAN },
  { path: 'search_filter.exclude_ferry', values: BOOLEAN },
  { path: 'search_filter.exclude_closures', values: BOOLEAN },
  { path: 'search_filter.level', hint: 'none' },
];

const $ = (id) => document.getElementById(id);
const serverEl = $('server');
const removeServerEl = $('remove-server');
const addServerEl = $('add-server');
const serverUrlEl = $('server-url');
const input = $('input');
const sendEl = $('send');
const clearEl = $('clear');
const costingEl = $('costing');
const verboseEl = $('verbose');
const errorEl = $('error');
const statusEl = $('status');
const fieldsEl = $('fields');
const resultsEl = $('results');
const circlesEl = $('circles');
const copyEl = $('copy');
const viewsEl = $('views');
const saveViewEl = $('save-view');
const viewNameEl = $('view-name');

// right-drag would rotate the map, but right-click adds points here
const map = new maplibregl.Map({ container: 'map', style: STYLE, center: [10, 50], zoom: 3, dragRotate: false });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl());
map.getCanvas().style.cursor = 'crosshair';

let servers = { custom: [], selected: PRESET_SERVERS[0] };
let request = { locations: [], costing: 'auto', verbose: true }; // what the text box holds; null while that doesn't parse
// Once the request has been sent, changing an option or dragging a point sends it again.
// Adding or removing points turns that off until the next Send.
let live = false;
let unseen = false; // the request was typed, pasted or came with the URL, so the map may not show its points yet
let pending = null; // AbortController of the request in flight
let response = null; // what the server answered to the results on show
let views = []; // saved map views: { name, center: [lon, lat], zoom }
let markers = [];
let rows = []; // panel entry of every correlated edge and node, across all locations

const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const point = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const fmt = (n, unit = '') => (typeof n === 'number' ? `${+n.toFixed(1)}${unit}` : '–');
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const colorOf = (i) => COLORS[i % COLORS.length];

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
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

// a polygon approximating a circle of `radius` meters
function circle([lon, lat], radius, properties) {
  const dLat = radius / 111320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const ring = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } };
}

// an arrowhead pointing right, which is where a symbol placed along a line faces the line's direction
function arrowImage(size) {
  const canvas = el('canvas', { width: size, height: size });
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(size * 0.3, size * 0.2);
  ctx.lineTo(size * 0.72, size * 0.5);
  ctx.lineTo(size * 0.3, size * 0.8);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size * 0.26;
  ctx.stroke();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = size * 0.13;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

// --- servers ----------------------------------------------------------------

const allServers = () => [...PRESET_SERVERS, ...servers.custom];

// Turns what the user typed into a base URL, or null. Without a scheme, local hosts get http.
function normalizeServer(text) {
  let value = text.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = (/^(localhost|\[|\d+\.\d+\.\d+\.\d+)/i.test(value) ? 'http://' : 'https://') + value;
  try {
    const url = new URL(value);
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function restoreServers() {
  const custom = (list) => (Array.isArray(list) ? list.filter((url) => typeof url === 'string' && !PRESET_SERVERS.includes(url)) : []);
  try {
    const shared = localStorage.getItem(SERVERS_KEY);
    // nothing shared yet: start from the servers the tools added on their own
    servers.custom = shared !== null
      ? custom(JSON.parse(shared))
      : [...new Set(LEGACY_SERVER_KEYS.flatMap((key) => custom(JSON.parse(localStorage.getItem(key))?.custom)))];
    const { selected } = JSON.parse(localStorage.getItem(SELECTED_SERVER_KEY)) ?? {};
    if (allServers().includes(selected)) servers.selected = selected;
  } catch {
    // storage unavailable or corrupt
  }
  // the server in use was removed, in another tab
  if (!allServers().includes(servers.selected)) servers.selected = PRESET_SERVERS[0];
}

function selectServer(url) {
  servers.selected = url;
  updateServers();
  if (live) send();
}

function updateServers() {
  try {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers.custom));
    localStorage.setItem(SELECTED_SERVER_KEY, JSON.stringify({ selected: servers.selected }));
  } catch {
    // storage unavailable
  }
  serverEl.replaceChildren(...allServers().map((url) => el('option', { value: url, textContent: url })));
  serverEl.value = servers.selected;
  removeServerEl.disabled = PRESET_SERVERS.includes(servers.selected);
}

// --- saved views ------------------------------------------------------------

function restoreViews() {
  const read = (key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved.filter((view) => typeof view?.name === 'string' && Array.isArray(view.center) && Number.isFinite(view.zoom)) : [];
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
      const go = el('button', { type: 'button', textContent: view.name, title: 'Show this view' });
      go.addEventListener('click', () => map.jumpTo({ center: view.center, zoom: view.zoom }));
      const remove = el('button', { type: 'button', textContent: '×', title: `Remove "${view.name}"` });
      remove.addEventListener('click', () => {
        views = views.filter((other) => other !== view);
        updateViews();
      });
      return el('span', { className: 'view' }, go, remove);
    }),
  );
}

// Saving under a name that exists replaces that view.
function saveView(name) {
  const { lng, lat } = map.getCenter();
  const view = { name, center: [+lng.toFixed(6), +lat.toFixed(6)], zoom: +map.getZoom().toFixed(2) };
  const existing = views.findIndex((other) => other.name === name);
  if (existing < 0) views.push(view);
  else views[existing] = view;
  updateViews();
}

// --- request ----------------------------------------------------------------

const locations = () => (Array.isArray(request?.locations) ? request.locations.filter(isObject) : []);

function getOption(location, path) {
  const [key, sub] = path.split('.');
  return sub ? location[key]?.[sub] : location[key];
}

// `undefined` removes the option
function setOption(location, path, value) {
  const [key, sub] = path.split('.');
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

function controlValue({ control, values }) {
  const raw = control.value;
  if (raw === '') return undefined;
  if (!values) return Number(raw);
  return raw === 'true' ? true : raw === 'false' ? false : raw;
}

// An option the locations disagree on shows as "mixed"; it stays untouched until the user sets it.
function showOption(option, value, mixed = false) {
  const { control, values, hint } = option;
  control.value = mixed || value === undefined ? '' : String(value);
  if (values) control.options[0].textContent = mixed ? 'mixed' : 'default';
  else control.placeholder = mixed ? 'mixed' : hint;
}

function newLocation(lngLat) {
  const location = { lat: +lngLat.lat.toFixed(6), lon: +lngLat.lng.toFixed(6) };
  for (const option of OPTIONS) {
    const value = controlValue(option);
    if (value !== undefined) setOption(location, option.path, value);
  }
  return location;
}

// Makes the inputs show what an edited or pasted request says, rather than changing it.
function syncControls() {
  costingEl.value = typeof request.costing === 'string' ? request.costing : '';
  verboseEl.checked = request.verbose === true;
  const all = locations();
  if (!all.length) return; // keep what the inputs hold for the first point
  for (const option of OPTIONS) {
    const seen = new Set(all.map((location) => JSON.stringify(getOption(location, option.path))));
    showOption(option, getOption(all[0], option.path), seen.size > 1);
  }
}

function updateUrl() {
  try {
    history.replaceState(null, '', `?${new URLSearchParams({ [URL_PARAM]: JSON.stringify(request) })}`);
  } catch {
    // some browsers refuse this for pages opened from disk
  }
}

// Call after the text box changed by hand and parsed.
function requestChanged() {
  updateUrl();
  drawInputs();
}

// Call after changing `request` in code.
function writeRequest() {
  input.value = JSON.stringify(request, null, 2);
  requestChanged();
}

function readRequest() {
  try {
    const parsed = JSON.parse(input.value);
    if (!isObject(parsed)) throw new Error('The request must be a JSON object.');
    request = parsed;
  } catch (error) {
    request = null;
    fail(error.message);
    return;
  }
  fail('');
  unseen = true;
  syncControls();
  requestChanged();
}

function setLocations(next) {
  request.locations = next;
  writeRequest();
}

function applyOption(option) {
  if (!request) return fail(INVALID_REQUEST);
  const value = controlValue(option);
  showOption(option, value);
  for (const location of locations()) setOption(location, option.path, value);
  writeRequest();
  if (live) send();
}

// --- map --------------------------------------------------------------------

const ready = new Promise((resolve) => map.on('load', resolve)).then(() => {
  for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: fc([]) });

  const round = { 'line-cap': 'round', 'line-join': 'round' };
  const color = ['get', 'color'];
  const none = ['==', ['get', 'idx'], -1];
  map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': color, 'fill-opacity': 0.08 } });
  map.addLayer({ id: 'radius', type: 'line', source: 'radius', paint: { 'line-color': color, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  // only ever the bounding circle of the highlighted edge
  map.addLayer({ id: 'circles-fill', type: 'fill', source: 'circles', filter: none, paint: { 'fill-color': '#facc15', 'fill-opacity': 0.15 } });
  map.addLayer({ id: 'circles', type: 'line', source: 'circles', filter: none, paint: { 'line-color': '#a16207', 'line-width': 1.5 } });
  map.addLayer({ id: 'edges-casing', type: 'line', source: 'edges', layout: round, paint: { 'line-color': '#fff', 'line-width': 8 } });
  map.addLayer({ id: 'edges', type: 'line', source: 'edges', layout: round, paint: { 'line-color': color, 'line-width': 5 } });
  map.addLayer({ id: 'edges-active', type: 'line', source: 'edges', layout: round, filter: none, paint: { 'line-color': '#facc15', 'line-width': 9, 'line-opacity': 0.7 } });
  // the travel direction of the highlighted edge: a reverse edge runs against its shape
  map.addImage('arrow', arrowImage(40), { pixelRatio: 2 });
  map.addLayer({ id: 'edges-arrows', type: 'symbol', source: 'edges', filter: none, layout: { 'symbol-placement': 'line', 'symbol-spacing': 40, 'icon-image': 'arrow', 'icon-rotate': ['case', ['get', 'reverse'], 180, 0], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  map.addLayer({ id: 'snaps', type: 'line', source: 'snaps', paint: { 'line-color': color, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'points-active', type: 'circle', source: 'points', filter: none, paint: { 'circle-radius': 11, 'circle-color': '#facc15', 'circle-opacity': 0.7 } });
  // correlated points on edges are hollow, nodes are filled
  map.addLayer({ id: 'points', type: 'circle', source: 'points', paint: { 'circle-radius': 5, 'circle-color': ['case', ['get', 'node'], color, '#fff'], 'circle-stroke-width': 2, 'circle-stroke-color': ['case', ['get', 'node'], '#fff', color] } });

  for (const layer of ['edges', 'points']) {
    map.on('mousemove', layer, (e) => {
      const { idx } = e.features[0].properties;
      highlight(idx);
      rows[idx]?.scrollIntoView({ block: 'nearest' });
    });
    map.on('mouseleave', layer, () => highlight(null));
  }
  applyCircles();
});

function applyCircles() {
  const visibility = circlesEl.checked ? 'visible' : 'none';
  for (const layer of ['circles', 'circles-fill']) map.setLayoutProperty(layer, 'visibility', visibility);
}

// The numbered input points and their search radii, straight from the request.
function drawInputs() {
  for (const marker of markers) marker.remove();
  markers = [];
  const radii = [];
  (Array.isArray(request?.locations) ? request.locations : []).forEach((location, i) => {
    if (!Number.isFinite(location?.lat) || !Number.isFinite(location.lon)) return;
    const at = [location.lon, location.lat];
    const color = colorOf(i);
    if (location.radius > 0) radii.push(circle(at, location.radius, { color }));

    const element = el('div', { className: 'input-marker', textContent: i + 1, title: 'Drag to move, right-click to remove' });
    element.style.borderColor = color;
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation(); // or the map adds a point here
      clearResults();
      setLocations(request.locations.filter((other) => other !== location));
    });
    const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(at).addTo(map);
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat();
      Object.assign(location, { lat: +lat.toFixed(6), lon: +lng.toFixed(6) });
      writeRequest();
      if (live) send();
    });
    markers.push(marker);
  });
  ready.then(() => map.getSource('radius').setData(fc(radii)));
}

function edgeRow(edge) {
  const info = edge.edge_info;
  const wayId = edge.way_id ?? info?.way_id;
  const parts = [`way ${wayId ?? '–'}`, edge.side_of_street, `${fmt(edge.percent_along * 100)} % along`];
  // the rest is only there in verbose responses
  if (edge.edge) parts.push(edge.edge.forward ? 'forward' : 'reverse');
  if (edge.edge?.classification?.classification) parts.push(edge.edge.classification.classification);
  if (typeof edge.distance === 'number') parts.push(`${fmt(edge.distance, ' m')} away`);
  if (typeof edge.outbound_reach === 'number') parts.push(`reach ${edge.outbound_reach} out / ${edge.inbound_reach} in`);
  return { title: info ? info.names?.join(' / ') || 'unnamed' : `way ${wayId}`, detail: info ? parts.join(' · ') : parts.slice(1).join(' · ') };
}

function nodeRow(node) {
  const parts = [node.type, typeof node.edge_count === 'number' ? `${node.edge_count} edges` : null, node.intersection_type];
  return { title: 'node', detail: parts.filter(Boolean).join(' · ') || `${node.lat}, ${node.lon}` };
}

function addRow({ title, detail }, object, color) {
  const idx = rows.length;
  const pre = el('pre');
  const row = el('details', { className: 'row' }, el('summary', {}, title, el('small', { textContent: detail })), pre);
  row.style.borderLeftColor = color;
  // verbose edges are large, so only render the JSON of those that get opened
  row.addEventListener('toggle', () => (pre.textContent ||= JSON.stringify(object, null, 2)));
  row.addEventListener('mouseenter', () => highlight(idx));
  row.addEventListener('mouseleave', () => highlight(null));
  rows.push(row);
  resultsEl.append(el('li', {}, row));
  return idx;
}

async function draw(data) {
  await ready;
  const edges = [];
  const circles = [];
  const snaps = [];
  const points = [];
  rows = [];
  resultsEl.replaceChildren();
  data.forEach((result, i) => {
    const color = colorOf(i);
    const from = [result.input_lon, result.input_lat];
    const found = [...(result.edges ?? []), ...(result.nodes ?? [])].length;
    const count = `${result.edges?.length ?? 0} edges, ${result.nodes?.length ?? 0} nodes`;
    const dot = el('span', { className: 'dot' });
    dot.style.background = color;
    resultsEl.append(el('li', { className: 'location' }, dot, `Location ${i + 1}`, el('small', { textContent: found ? count : 'nothing found' })));

    for (const edge of result.edges ?? []) {
      const idx = addRow(edgeRow(edge), edge, color);
      const at = [edge.correlated_lon, edge.correlated_lat];
      if (edge.edge_info?.shape) edges.push(line(decodePolyline(edge.edge_info.shape, 6), { idx, color, reverse: edge.edge?.forward === false }));
      const bounds = edge.bounding_circle;
      if (bounds) circles.push(circle([bounds.lon, bounds.lat], bounds.radius, { idx }));
      snaps.push(line([from, at], { color }));
      points.push(point(at, { idx, color, node: false }));
    }
    for (const node of result.nodes ?? []) {
      const idx = addRow(nodeRow(node), node, color);
      const at = [node.lon, node.lat];
      snaps.push(line([from, at], { color }));
      points.push(point(at, { idx, color, node: true }));
    }
  });
  map.getSource('edges').setData(fc(edges));
  map.getSource('circles').setData(fc(circles));
  map.getSource('snaps').setData(fc(snaps));
  map.getSource('points').setData(fc(points));
  highlight(null);
}

function highlight(idx) {
  const filter = ['==', ['get', 'idx'], idx ?? -1];
  for (const layer of ['edges-active', 'edges-arrows', 'points-active', 'circles', 'circles-fill']) map.setFilter(layer, filter);
  rows.forEach((row, i) => row.classList.toggle('active', i === idx));
}

function clearResults() {
  pending?.abort();
  response = null;
  copyEl.disabled = true;
  rows = [];
  resultsEl.replaceChildren();
  statusEl.textContent = '';
  ready.then(() => {
    for (const id of ['circles', 'snaps', 'edges', 'points']) map.getSource(id).setData(fc([]));
  });
}

// Moves the map to the points of a request that didn't come from clicking it, or that are out of view.
function showInputs() {
  const coords = markers.map((marker) => marker.getLngLat());
  if (!coords.length || (!unseen && coords.every((c) => map.getBounds().contains(c)))) return;
  unseen = false;
  const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds());
  map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 0 });
}

async function send() {
  if (!request) return fail(INVALID_REQUEST);
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  live = true;
  fail('');
  statusEl.textContent = 'Requesting…';
  showInputs();

  const server = servers.selected;
  const started = performance.now();
  let data;
  try {
    // a string body is sent as text/plain, which spares the CORS preflight; Valhalla parses it as JSON anyway
    const response = await fetch(`${server}/locate`, { method: 'POST', body: JSON.stringify(request), signal: controller.signal });
    data = await response.json();
  } catch (error) {
    if (controller.signal.aborted) return;
    clearResults();
    return fail(`Request to ${server} failed: ${error.message}`);
  }
  if (controller.signal.aborted) return;
  if (!Array.isArray(data)) {
    clearResults();
    return fail(data?.error ? `Error ${data.error_code}: ${data.error}` : 'Unexpected response, see the network tab.');
  }
  await draw(data);
  response = data;
  copyEl.disabled = false;
  const count = (key) => data.reduce((sum, result) => sum + (result[key]?.length ?? 0), 0);
  statusEl.textContent = `${count('edges')} edges · ${count('nodes')} nodes · ${Math.round(performance.now() - started)} ms`;
}

// --- wiring -----------------------------------------------------------------

let group = null;
for (const option of OPTIONS) {
  const [key, sub] = option.path.split('.');
  if (sub && key !== group) fieldsEl.append(el('div', { className: 'group', textContent: key }));
  group = sub ? key : null;
  option.control = option.values
    ? el('select', {}, el('option', { value: '', textContent: 'default' }), ...option.values.map((value) => el('option', { value, textContent: value })))
    : el('input', { type: 'number', step: 'any', placeholder: option.hint });
  option.control.addEventListener('change', () => applyOption(option));
  fieldsEl.append(el('label', {}, sub ?? key, option.control));
}

map.on('click', (e) => {
  if (e.originalEvent.target.closest?.('.input-marker')) return;
  if (!request) return fail(INVALID_REQUEST);
  setLocations([newLocation(e.lngLat)]);
  send();
});
map.on('contextmenu', (e) => {
  e.originalEvent.preventDefault();
  if (!request) return fail(INVALID_REQUEST);
  live = false;
  clearResults();
  setLocations([...(Array.isArray(request.locations) ? request.locations : []), newLocation(e.lngLat)]);
});

input.addEventListener('input', readRequest);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
});
sendEl.addEventListener('click', send);
clearEl.addEventListener('click', () => {
  if (!request) return fail(INVALID_REQUEST);
  live = false;
  clearResults();
  setLocations([]);
});
costingEl.addEventListener('change', () => {
  if (!request) return fail(INVALID_REQUEST);
  if (costingEl.value.trim()) request.costing = costingEl.value.trim();
  else delete request.costing;
  writeRequest();
  if (live) send();
});
verboseEl.addEventListener('change', () => {
  if (!request) return fail(INVALID_REQUEST);
  request.verbose = verboseEl.checked;
  writeRequest();
  if (live) send();
});

serverEl.addEventListener('change', () => selectServer(serverEl.value));
removeServerEl.addEventListener('click', () => {
  servers.custom = servers.custom.filter((url) => url !== servers.selected);
  selectServer(PRESET_SERVERS[0]);
});
addServerEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = normalizeServer(serverUrlEl.value);
  if (!url) return fail('That is not a valid server address.');
  fail('');
  if (!allServers().includes(url)) servers.custom.push(url);
  serverUrlEl.value = '';
  selectServer(url);
});

copyEl.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(response, null, 2));
  } catch {
    return fail('The browser refused access to the clipboard.');
  }
  copyEl.textContent = 'Copied';
  setTimeout(() => (copyEl.textContent = 'Copy response'), 1200);
});
circlesEl.addEventListener('change', () => ready.then(applyCircles));

saveViewEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = viewNameEl.value.trim();
  if (!name) return;
  viewNameEl.value = '';
  saveView(name);
});

restoreServers();
updateServers();
// keep up with servers added or removed in other tabs, of this tool or another one
window.addEventListener('storage', (e) => {
  if (e.key !== SERVERS_KEY) return;
  restoreServers();
  updateServers();
});
restoreViews();
// keep up with views saved in other tabs, of this tool or another one
window.addEventListener('storage', (e) => {
  if (e.key !== VIEWS_KEY) return;
  restoreViews();
  updateViews();
});
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
  if (locations().length) send();
}
