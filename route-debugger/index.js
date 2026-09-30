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
const STORAGE_KEY = 'route-debugger:servers';
const VIEWS_KEY = 'route-debugger:views';
const PRESET_SERVERS = ['https://valhalla1.openstreetmap.de', 'http://localhost:8002'];
// the request travels in this URL parameter, the same one Valhalla itself accepts on GET requests
const URL_PARAM = 'json';
// weights and turn weights only come in this format, so every request is sent with it
const FORMAT = 'osrm';
const SOURCES = ['alternatives', 'steps', 'step-ends', 'intersections', 'waypoints'];
const STEP_COLORS = ['#2563eb', '#ea580c'];
const INVALID_REQUEST = 'The request is not valid JSON; fix it before using the map or the inputs.';

const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service_other'];
const BOOLEAN = ['true', 'false'];
// The per-location options that get an input. `values` makes it a select, anything else is a number;
// a dotted path is a key inside a nested object. `hint` is the server default.
const OPTIONS = [
  { path: 'type', values: ['break', 'through', 'via', 'break_through'] },
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
  { path: 'waiting', hint: '0 s' },
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
const errorEl = $('error');
const statusEl = $('status');
const fieldsEl = $('fields');
const costingNoteEl = $('costing-note');
const costingFieldsEl = $('costing-fields');
const resultEl = $('result');
const routesEl = $('routes');
const summaryEl = $('summary');
const copyEl = $('copy');
const copyTraceEl = $('copy-trace');
const stepsEl = $('steps');
const viewsEl = $('views');
const saveViewEl = $('save-view');
const viewNameEl = $('view-name');

// right-drag would rotate the map, but right-click opens the waypoint menus here
const map = new maplibregl.Map({ container: 'map', style: STYLE, center: [10, 50], zoom: 3, dragRotate: false });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl());
map.getCanvas().style.cursor = 'crosshair';

let servers = { custom: [], selected: PRESET_SERVERS[0] };
let request = { locations: [], costing: 'auto', format: FORMAT }; // what the text box holds; null while that doesn't parse
let unseen = false; // the request was typed, pasted or came with the URL, so the map may not show its points yet
let pending = null; // AbortController of the request in flight
let state = null; // the response on show: { data, sent, routes, routeIdx }
let steps = []; // flattened steps of the selected route
let views = []; // saved map views: { name, center: [lon, lat], zoom }
let markers = [];
let turnMarkers = [];
let popup = null;
let menu = null;
let costingFields = []; // the inputs of the costing options, which depend on the costing
let shownCosting = null; // the costing those inputs are for

const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const point = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const fmt = (n, unit = '') => (typeof n === 'number' ? `${+n.toFixed(3)}${unit}` : '–');
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

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

function encodePolyline(coords, precision) {
  const factor = 10 ** precision;
  let str = '';
  let previous = [0, 0];
  for (const [lon, lat] of coords) {
    const current = [Math.round(lat * factor), Math.round(lon * factor)];
    current.forEach((value, i) => {
      const delta = value - previous[i];
      let rest = delta < 0 ? ~(delta << 1) : delta << 1;
      for (; rest >= 0x20; rest >>= 5) str += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
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
  if (typeof geometry !== 'string') return geometry.coordinates ?? [];
  const p5 = decodePolyline(geometry, 5);
  const p6 = decodePolyline(geometry, 6);
  if (!p6.length) return [];
  if (!hint) return Math.abs(p5[0][1]) > 90 || Math.abs(p5[0][0]) > 180 ? p6 : p5;
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
        color: STEP_COLORS[idx % STEP_COLORS.length],
        coords: toCoords(step.geometry, step.maneuver?.location),
      });
    });
  });
  return flat;
}

function routeCoords(route) {
  if (route.geometry) return toCoords(route.geometry, state.data.waypoints?.[0]?.location);
  return flattenSteps(route).flatMap((s) => s.coords);
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
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.custom)) servers.custom = saved.custom.filter((url) => typeof url === 'string' && !PRESET_SERVERS.includes(url));
    if (allServers().includes(saved?.selected)) servers.selected = saved.selected;
  } catch {
    // storage unavailable or corrupt
  }
}

function selectServer(url) {
  servers.selected = url;
  updateServers();
  route();
}

function updateServers() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  } catch {
    // storage unavailable
  }
  serverEl.replaceChildren(...allServers().map((url) => el('option', { value: url, textContent: url })));
  serverEl.value = servers.selected;
  removeServerEl.disabled = PRESET_SERVERS.includes(servers.selected);
}

// --- saved views ------------------------------------------------------------

function restoreViews() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEWS_KEY));
    if (Array.isArray(saved)) views = saved.filter((view) => typeof view?.name === 'string' && Array.isArray(view.center) && Number.isFinite(view.zoom));
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

const isPoint = (location) => Number.isFinite(location?.lat) && Number.isFinite(location.lon);
const locations = () => (Array.isArray(request?.locations) ? request.locations.filter(isObject) : []);

// An input of a location or costing option: a select when the option has `values`, else a number.
function addField(parent, label, field, title, onChange) {
  field.control = field.values
    ? el('select', {}, el('option', { value: '', textContent: 'default' }), ...field.values.map((value) => el('option', { value, textContent: value })))
    : el('input', { type: 'number', step: 'any', placeholder: field.hint });
  field.control.addEventListener('change', onChange);
  parent.append(el('label', { title }, label, field.control));
}

// `undefined` when the input is empty, which leaves the option out of the request
function fieldValue({ control, values }) {
  const raw = control.value;
  if (raw === '') return undefined;
  if (!values) return Number(raw);
  return raw === 'true' ? true : raw === 'false' ? false : raw;
}

// A location option the locations disagree on shows as "mixed"; it stays untouched until the user sets it.
function showField(field, value, mixed = false) {
  const { control, values, hint } = field;
  control.value = mixed || value === undefined ? '' : String(value);
  if (values) control.options[0].textContent = mixed ? 'mixed' : 'default';
  else control.placeholder = mixed ? 'mixed' : hint;
}

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
  costingNoteEl.textContent = costing ? `— of ${costing}` : '— set a costing first';
  if (!costing) return;

  const { costings, schemas } = COSTING_OPTIONS;
  const own = schemas[costings[costing]] ?? [];
  const shared = schemas.Base.filter((spec) => !own.some((other) => other.name === spec.name));
  for (const [group, specs] of [[costing, own], ['all costings', shared]]) {
    if (!specs.length) continue;
    costingFieldsEl.append(el('div', { className: 'group', textContent: group }));
    for (const spec of specs) {
      const field = { name: spec.name, values: spec.enum ?? (spec.type === 'boolean' ? BOOLEAN : undefined), hint: spec.default === undefined ? '' : String(spec.default) };
      const range = 'minimum' in spec || 'maximum' in spec ? ` (${spec.minimum ?? ''}–${spec.maximum ?? ''})` : '';
      const preset = field.values && spec.default !== undefined ? ` Default: ${spec.default}.` : '';
      addField(costingFieldsEl, spec.name, field, `${spec.description}${range}${preset}`, () => applyCostingOption(field));
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
  const costing = typeof request.costing === 'string' ? request.costing : '';
  costingEl.value = costing;
  if (costing !== shownCosting) buildCostingFields(costing);
  for (const field of costingFields) showField(field, request.costing_options?.[costing]?.[field.name]);

  const all = locations();
  if (!all.length) return; // keep what the inputs hold for the first point
  for (const option of OPTIONS) {
    const seen = new Set(all.map((location) => JSON.stringify(getOption(location, option.path))));
    showField(option, getOption(all[0], option.path), seen.size > 1);
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

// --- context menus ----------------------------------------------------------

function closeMenu() {
  menu?.remove();
  menu = null;
}

// `items` are { label, action, danger }
function openMenu({ clientX, clientY }, title, items) {
  closeMenu();
  const list = el('div', { className: 'menu' }, el('b', { textContent: title }));
  for (const { label, action, danger } of items) {
    const button = el('button', { type: 'button', textContent: label, className: danger ? 'danger' : '' });
    button.addEventListener('click', () => {
      closeMenu();
      action();
    });
    list.append(button);
  }
  // the backdrop takes the click that dismisses the menu, so that it doesn't add a waypoint
  menu = el('div', { className: 'menu-backdrop' }, list);
  menu.addEventListener('click', (e) => e.target === menu && closeMenu());
  menu.addEventListener('contextmenu', (e) => {
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
    const label = !count ? 'Add as the first waypoint' : i === 0 ? 'Insert as the start' : i === count ? 'Append as the end' : `Insert between ${i} and ${i + 1}`;
    items.push({ label, action: () => insertLocation(e.lngLat, i) });
  }
  openMenu(e.originalEvent, 'New waypoint', items);
}

function openMarkerMenu(e, i) {
  const count = request.locations.length;
  const items = [{ label: 'Delete', danger: true, action: () => setLocations(request.locations.filter((_, other) => other !== i)) }];
  for (let to = 0; to < count; to++) {
    if (to === i) continue;
    const where = to === 0 ? ' (start)' : to === count - 1 ? ' (end)' : '';
    items.push({ label: `Move to position ${to + 1}${where}`, action: () => moveLocation(i, to) });
  }
  openMenu(e, `Waypoint ${i + 1}`, items);
}

// --- map --------------------------------------------------------------------

const ready = new Promise((resolve) => map.on('load', resolve)).then(() => {
  for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: fc([]) });

  const round = { 'line-cap': 'round', 'line-join': 'round' };
  map.addLayer({ id: 'alternatives', type: 'line', source: 'alternatives', layout: round, paint: { 'line-color': '#9ca3af', 'line-width': 4 } });
  map.addLayer({ id: 'steps-casing', type: 'line', source: 'steps', layout: round, paint: { 'line-color': '#fff', 'line-width': 8 } });
  map.addLayer({ id: 'steps', type: 'line', source: 'steps', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
  map.addLayer({ id: 'steps-active', type: 'line', source: 'steps', layout: round, filter: ['==', ['get', 'idx'], -1], paint: { 'line-color': '#facc15', 'line-width': 9, 'line-opacity': 0.7 } });
  map.addLayer({ id: 'step-ends', type: 'circle', source: 'step-ends', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': ['get', 'color'] } });
  // red = intersection carries a turn_weight
  map.addLayer({ id: 'intersections', type: 'circle', source: 'intersections', paint: { 'circle-radius': 3, 'circle-color': ['case', ['>', ['get', 'turnWeight'], 0], '#dc2626', '#6b7280'] } });
  // where the server snapped the waypoints to
  map.addLayer({ id: 'waypoints', type: 'circle', source: 'waypoints', paint: { 'circle-radius': 5, 'circle-color': '#111827', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });

  map.on('mousemove', 'steps', (e) => {
    const { idx } = e.features[0].properties;
    highlight(idx);
    steps[idx]?.item.scrollIntoView({ block: 'nearest' });
  });
  map.on('mouseleave', 'steps', () => highlight(null));
  for (const layer of ['intersections', 'waypoints']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = 'crosshair'));
  }
});

// The numbered waypoints, straight from the request.
function drawInputs() {
  for (const marker of markers) marker.remove();
  markers = [];
  (Array.isArray(request?.locations) ? request.locations : []).forEach((location, i) => {
    if (!isPoint(location)) return;
    const element = el('div', { className: 'input-marker', textContent: i + 1, title: 'Drag to move, right-click to delete or reorder' });
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation(); // or the map opens its own menu
      openMarkerMenu(e, i);
    });
    const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat([location.lon, location.lat]).addTo(map);
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat();
      Object.assign(location, { lat: +lat.toFixed(6), lon: +lng.toFixed(6) });
      writeRequest();
      route();
    });
    markers.push(marker);
  });
}

function draw() {
  clearRoute();
  const { data, routes, routeIdx } = state;
  const selected = routes[routeIdx];
  steps = flattenSteps(selected);

  const allCoords = steps.length ? steps.flatMap((s) => s.coords) : routeCoords(selected);
  const labelled = steps.filter((s) => s.coords.length && s.step.maneuver?.type !== 'arrive');

  map.getSource('alternatives').setData(fc(routes.filter((_, i) => i !== routeIdx).map((r) => line(routeCoords(r)))));
  map.getSource('steps').setData(fc(
    steps.length
      ? steps.filter((s) => s.coords.length > 1).map((s) => line(s.coords, { idx: s.idx, color: s.color }))
      : [line(allCoords, { idx: -2, color: STEP_COLORS[0] })],
  ));
  map.getSource('step-ends').setData(fc(labelled.map((s) => point(s.coords.at(-1), { color: s.color }))));
  map.getSource('intersections').setData(fc(steps.flatMap((s) =>
    (s.step.intersections ?? [])
      .map((intersection, i) => point(intersection.location, { idx: s.idx, i, turnWeight: intersection.turn_weight ?? 0 }))
      .filter((f) => f.geometry.coordinates))));
  map.getSource('waypoints').setData(fc((data.waypoints ?? [])
    .map((w, i) => w?.location && point(w.location, { i }))
    .filter(Boolean)));

  // the weight of every step, shown where the step ends
  for (const s of labelled) {
    const label = el('div', { className: 'step-label', textContent: fmt(s.step.weight), title: `step ${s.idx} weight` });
    label.style.borderColor = s.color;
    label.addEventListener('mouseenter', () => highlight(s.idx));
    label.addEventListener('mouseleave', () => highlight(null));
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      s.item.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    s.label = label;
    s.marker = new maplibregl.Marker({ element: label, anchor: 'left', offset: [10, 0] }).setLngLat(s.coords.at(-1)).addTo(map);
  }

  // turn weights, shown on the opposite side of the intersection from the step weights
  for (const s of steps) {
    (s.step.intersections ?? []).forEach((intersection, i) => {
      if (!intersection.turn_weight || !intersection.location) return;
      const label = el('div', { className: 'turn-label', textContent: `t ${fmt(intersection.turn_weight)}`, title: `step ${s.idx} · intersection ${i} turn_weight` });
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup(`step ${s.idx} · intersection ${i}`, intersection, intersection.location);
      });
      turnMarkers.push(new maplibregl.Marker({ element: label, anchor: 'right', offset: [-10, 0] }).setLngLat(intersection.location).addTo(map));
    });
  }

  drawPanel(selected);
}

function drawPanel(selected) {
  const tile = (label, value) => el('div', {}, el('small', { textContent: label }), el('b', { textContent: value }));
  summaryEl.replaceChildren(
    tile(`weight (${selected.weight_name ?? '?'})`, fmt(selected.weight)),
    tile('duration', fmt(selected.duration, ' s')),
    tile('distance', fmt(selected.distance, ' m')),
  );

  stepsEl.replaceChildren();
  let cumulative = 0;
  (selected.legs ?? []).forEach((leg, legIdx) => {
    const legSteps = steps.filter((s) => s.legIdx === legIdx);
    const sum = legSteps.reduce((acc, s) => acc + (s.step.weight ?? 0), 0);
    const matches = Math.abs(sum - (leg.weight ?? 0)) < 0.01;
    stepsEl.append(el('li', { className: 'leg' },
      `Leg ${legIdx} · weight ${fmt(leg.weight)} `,
      el('span', { className: matches ? 'ok' : 'bad', textContent: matches ? '= Σ steps' : `≠ Σ steps ${fmt(sum)}` }),
    ));

    for (const s of legSteps) {
      const { step } = s;
      cumulative += step.weight ?? 0;
      const turns = (step.intersections ?? []).reduce((acc, intersection) => acc + (intersection.turn_weight ?? 0), 0);
      const maneuver = [step.maneuver?.type, step.maneuver?.modifier].filter(Boolean).join(' ');
      const swatch = el('span', { className: 'swatch' });
      swatch.style.background = s.color;
      s.item = el('li', { className: 'step' },
        swatch,
        el('div', { className: 'instr' },
          step.maneuver?.instruction ?? step.name ?? '',
          el('small', { textContent: `#${s.idx} ${maneuver}${step.ref ? ` · ref ${step.ref}` : ''}` })),
        el('div', { className: 'metrics' },
          el('b', { textContent: fmt(step.weight) }),
          el('small', { textContent: `Σ ${fmt(cumulative)}` }),
          el('small', { className: 'turns', textContent: turns ? `turns ${fmt(turns)}` : '' }),
          el('small', { textContent: `${fmt(step.duration, ' s')} · ${fmt(step.distance, ' m')}` })),
      );
      s.item.addEventListener('mouseenter', () => highlight(s.idx));
      s.item.addEventListener('mouseleave', () => highlight(null));
      s.item.addEventListener('click', () => {
        if (!s.coords.length) return;
        const bounds = s.coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds());
        map.fitBounds(bounds, { padding: 120, maxZoom: 17 });
      });
      stepsEl.append(s.item);
    }
  });
}

function highlight(idx) {
  map.setFilter('steps-active', ['==', ['get', 'idx'], idx ?? -1]);
  for (const s of steps) {
    s.item?.classList.toggle('active', s.idx === idx);
    s.label?.classList.toggle('active', s.idx === idx);
  }
}

function showPopup(title, object, lngLat) {
  const body = Object.entries(object).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
  popup?.remove();
  popup = new maplibregl.Popup({ maxWidth: '360px' })
    .setLngLat(lngLat)
    .setDOMContent(el('pre', { textContent: `${title}\n${body}` }))
    .addTo(map);
}

// Takes the selected route off the map and the panel.
function clearRoute() {
  popup?.remove();
  for (const s of steps) s.marker?.remove();
  for (const marker of turnMarkers) marker.remove();
  turnMarkers = [];
  steps = [];
  for (const id of SOURCES) map.getSource(id).setData(fc([]));
  summaryEl.replaceChildren();
  stepsEl.replaceChildren();
}

function clearResults() {
  pending?.abort();
  state = null;
  resultEl.hidden = true;
  statusEl.textContent = '';
  ready.then(clearRoute);
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
  fail('');
  statusEl.textContent = 'Requesting…';
  showInputs();

  const server = servers.selected;
  const sent = { ...request, format: FORMAT };
  const started = performance.now();
  let data;
  try {
    // a string body is sent as text/plain, which spares the CORS preflight; Valhalla parses it as JSON anyway
    const response = await fetch(`${server}/route`, { method: 'POST', body: JSON.stringify(sent), signal: controller.signal });
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
    const message = data?.error ? `Error ${data.error_code}: ${data.error}` : data?.message ? `${data.code ?? 'Error'}: ${data.message}` : 'No routes in the response.';
    return fail(message);
  }

  await ready;
  state = { data, sent, routes, routeIdx: 0 };
  routesEl.replaceChildren(...routes.map((r, i) => el('option', { value: i, textContent: `Route ${i} · weight ${fmt(r.weight)}` })));
  routesEl.hidden = routes.length < 2;
  resultEl.hidden = false;
  draw();
  statusEl.textContent = `${routes.length} ${routes.length > 1 ? 'routes' : 'route'} · ${Math.round(performance.now() - started)} ms`;
}

// Sends the request after it changed through the map or the inputs, once it has enough waypoints.
function route() {
  if (!request) return;
  if (locations().filter(isPoint).length >= 2) send();
  else clearResults();
}

// What trace_attributes needs to walk the edges of the route on show, with the costing it was made with.
function traceRequest() {
  const { sent, routes, routeIdx } = state;
  const trace = { encoded_polyline: encodePolyline(routeCoords(routes[routeIdx]), 6), shape_match: 'edge_walk' };
  for (const key of ['costing', 'costing_options', 'date_time']) {
    if (key in sent) trace[key] = sent[key];
  }
  return trace;
}

async function copy(button, value) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  } catch {
    return fail('The browser refused access to the clipboard.');
  }
  const label = button.textContent;
  button.textContent = 'Copied';
  button.disabled = true;
  setTimeout(() => {
    button.textContent = label;
    button.disabled = false;
  }, 1200);
}

// --- wiring -----------------------------------------------------------------

let group = null;
for (const option of OPTIONS) {
  const [key, sub] = option.path.split('.');
  if (sub && key !== group) fieldsEl.append(el('div', { className: 'group', textContent: key }));
  group = sub ? key : null;
  addField(fieldsEl, sub ?? key, option, '', () => applyOption(option));
}
$('costings').replaceChildren(...COSTING_OPTIONS.types.map((value) => el('option', { value })));

map.on('click', (e) => {
  if (e.originalEvent.target.closest?.('.input-marker')) return;
  // this click only dismisses the popup
  if (popup?.isOpen()) return popup.remove();
  const [feature] = map.queryRenderedFeatures(e.point, { layers: ['waypoints', 'intersections'] });
  if (feature) {
    const { idx, i } = feature.properties;
    const isWaypoint = feature.layer.id === 'waypoints';
    const object = isWaypoint ? state.data.waypoints[i] : steps[idx].step.intersections[i];
    return showPopup(isWaypoint ? `waypoint ${i}` : `step ${idx} · intersection ${i}`, object, feature.geometry.coordinates);
  }
  if (!request) return fail(INVALID_REQUEST);
  insertLocation(e.lngLat);
});
map.on('contextmenu', (e) => {
  e.originalEvent.preventDefault();
  if (!request) return fail(INVALID_REQUEST);
  openMapMenu(e);
});
map.on('movestart', closeMenu);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

input.addEventListener('input', readRequest);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
});
sendEl.addEventListener('click', send);
clearEl.addEventListener('click', () => {
  if (!request) return fail(INVALID_REQUEST);
  setLocations([]);
});
costingEl.addEventListener('change', () => {
  if (!request) return fail(INVALID_REQUEST);
  if (costingEl.value.trim()) request.costing = costingEl.value.trim();
  else delete request.costing;
  syncControls();
  writeRequest();
  route();
});
routesEl.addEventListener('change', () => {
  state.routeIdx = +routesEl.value;
  draw();
});
copyEl.addEventListener('click', () => copy(copyEl, state.data));
copyTraceEl.addEventListener('click', () => copy(copyTraceEl, traceRequest()));

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

saveViewEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = viewNameEl.value.trim();
  if (!name) return;
  viewNameEl.value = '';
  saveView(name);
});

restoreServers();
updateServers();
restoreViews();
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
