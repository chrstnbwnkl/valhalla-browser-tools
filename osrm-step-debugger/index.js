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
const STEP_COLORS = ['#2563eb', '#ea580c'];
const APP_TITLE = document.title;
// one localStorage key per saved route, so tabs editing different routes never overwrite each other
const STORAGE_PREFIX = 'osrm-format-debugger:route:';
const LEGACY_KEY = 'osrm-format-debugger:input';
// a URL hash starting with this carries a whole route instead of the id of a saved one
const SHARE_PREFIX = 'share=';
const SOURCES = ['alternatives', 'steps', 'step-ends', 'intersections', 'waypoints'];

const $ = (id) => document.getElementById(id);
const pickerEl = $('picker');
const shareEl = $('share');
const newEl = $('new');
const deleteEl = $('delete');
const titleEl = $('title');
const descriptionEl = $('description');
const input = $('input');
const storageErrorEl = $('storage-error');
const errorEl = $('error');
const routesEl = $('routes');
const summaryEl = $('summary');
const stepsEl = $('steps');

const map = new maplibregl.Map({ container: 'map', style: STYLE, center: [10, 50], zoom: 3 });
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl());

const blankEntry = () => ({ id: null, title: '', description: '', input: '', routeIdx: 0 });

let current = blankEntry(); // the saved route shown in this tab; its id is mirrored in the URL hash
let state = null; // { data, routes, routeIdx }
let steps = []; // flattened steps of the selected route
let turnMarkers = [];
let popup = null;

const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const point = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const fmt = (n, unit = '') => (typeof n === 'number' ? `${+n.toFixed(3)}${unit}` : '–');

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
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

// --- rendering --------------------------------------------------------------

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
  map.addLayer({ id: 'waypoints', type: 'circle', source: 'waypoints', paint: { 'circle-radius': 7, 'circle-color': '#111827', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });

  map.on('mousemove', 'steps', (e) => highlight(e.features[0].properties.idx));
  map.on('mouseleave', 'steps', () => highlight(null));
  for (const layer of ['steps', 'intersections', 'waypoints']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  map.on('click', onMapClick);
});

function draw() {
  clear();
  const { data, routes, routeIdx } = state;
  const route = routes[routeIdx];
  steps = flattenSteps(route);

  const allCoords = steps.length ? steps.flatMap((s) => s.coords) : routeCoords(route);
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
  map.getSource('waypoints').setData(fc((data.waypoints ?? data.tracepoints ?? [])
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

  drawPanel(route);

  if (allCoords.length) {
    const bounds = allCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds());
    map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 0 });
  }
}

function drawPanel(route) {
  const tile = (label, value) => el('div', {}, el('small', { textContent: label }), el('b', { textContent: value }));
  summaryEl.replaceChildren(
    tile(`weight (${route.weight_name ?? '?'})`, fmt(route.weight)),
    tile('duration', fmt(route.duration, ' s')),
    tile('distance', fmt(route.distance, ' m')),
  );

  stepsEl.replaceChildren();
  let cumulative = 0;
  (route.legs ?? []).forEach((leg, legIdx) => {
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

function onMapClick(e) {
  const [feature] = map.queryRenderedFeatures(e.point, { layers: ['waypoints', 'intersections', 'steps'] });
  if (!feature) return;
  const { idx, i } = feature.properties;
  if (feature.layer.id === 'steps') {
    steps[idx]?.item.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const isWaypoint = feature.layer.id === 'waypoints';
  const object = isWaypoint ? (state.data.waypoints ?? state.data.tracepoints)[i] : steps[idx].step.intersections[i];
  const title = isWaypoint ? `waypoint ${i}` : `step ${idx} · intersection ${i}`;
  showPopup(title, object, feature.geometry.coordinates);
}

function showPopup(title, object, lngLat) {
  const body = Object.entries(object).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
  popup?.remove();
  popup = new maplibregl.Popup({ maxWidth: '360px' })
    .setLngLat(lngLat)
    .setDOMContent(el('pre', { textContent: `${title}\n${body}` }))
    .addTo(map);
}

function clear() {
  popup?.remove();
  for (const s of steps) s.marker?.remove();
  for (const marker of turnMarkers) marker.remove();
  turnMarkers = [];
  steps = [];
  for (const id of SOURCES) map.getSource(id).setData(fc([]));
  summaryEl.replaceChildren();
  stepsEl.replaceChildren();
}

// --- input ------------------------------------------------------------------

function fail(message) {
  errorEl.textContent = message;
  state = null;
  routesEl.hidden = true;
  ready.then(clear);
}

function load() {
  const text = input.value.trim();
  if (!text) return fail('');

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return fail(`Invalid JSON: ${e.message}`);
  }
  const routes = data.routes ?? data.matchings ?? data.trips;
  if (!Array.isArray(routes) || !routes.length) {
    return fail(data.message ? `${data.code ?? 'Error'}: ${data.message}` : 'No routes found in the response.');
  }

  errorEl.textContent = '';
  state = { data, routes, routeIdx: current.routeIdx < routes.length ? current.routeIdx : 0 };
  routesEl.replaceChildren(...routes.map((r, i) => el('option', { value: i, textContent: `Route ${i} · weight ${fmt(r.weight)}` })));
  routesEl.value = state.routeIdx;
  routesEl.hidden = routes.length < 2;
  ready.then(draw);
}

// --- saved routes -----------------------------------------------------------

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const displayTitle = (entry) => entry.title.trim() || 'Untitled';

function readEntry(id) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + id));
  } catch {
    return null;
  }
}

function listEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      const entry = readEntry(key.slice(STORAGE_PREFIX.length));
      if (entry) entries.push(entry);
    }
  } catch {
    // storage unavailable
  }
  return entries.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)) || a.id.localeCompare(b.id));
}

function refreshPicker() {
  const options = listEntries().map((entry) => el('option', { value: entry.id, textContent: displayTitle(entry), title: entry.description }));
  if (!current.id) options.unshift(el('option', { value: '', textContent: 'New route (not saved yet)' }));
  pickerEl.replaceChildren(...options);
  pickerEl.value = current.id ?? '';
  deleteEl.disabled = !current.id;
  shareEl.disabled = !input.value.trim();
  document.title = current.id ? `${displayTitle(current)} – ${APP_TITLE}` : APP_TITLE;
}

// Writes the form into storage. A new route only gets an id once it has some content.
function save() {
  current.title = titleEl.value;
  current.description = descriptionEl.value;
  current.input = input.value;
  if (!current.id) {
    if (!current.title && !current.description && !current.input) return;
    current.id = newId();
    history.replaceState(null, '', `#${current.id}`);
  }
  current.updated = Date.now();
  try {
    localStorage.setItem(STORAGE_PREFIX + current.id, JSON.stringify(current));
    storageErrorEl.textContent = '';
  } catch (e) {
    storageErrorEl.textContent = `Not saved: ${e.message}`;
  }
  refreshPicker();
}

function display(entry) {
  current = entry;
  titleEl.value = current.title;
  descriptionEl.value = current.description;
  input.value = current.input;
  storageErrorEl.textContent = '';
  refreshPicker();
  load();
}

function show(id) {
  const entry = (id && readEntry(id)) || blankEntry();
  // the hash points at a route that no longer exists
  if (id && !entry.id) history.replaceState(null, '', location.pathname + location.search);
  display(entry);
}

function showBlank() {
  history.pushState(null, '', location.pathname + location.search);
  show(null);
}

// --- sharing ----------------------------------------------------------------

// A route travels in the URL hash as deflated, base64url-encoded JSON, so it never reaches a server.
async function encodeShare(entry) {
  const stream = new Blob([JSON.stringify(entry)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function decodeShare(text) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

// A shared route becomes a saved route of whoever opens the link, independent of the sender's copy.
async function showShared(text) {
  let entry;
  try {
    const shared = await decodeShare(text);
    if (typeof shared?.input !== 'string') throw new Error('it does not contain a route');
    entry = { ...blankEntry(), ...shared, title: String(shared.title ?? ''), description: String(shared.description ?? ''), id: newId(), updated: Date.now() };
  } catch (e) {
    history.replaceState(null, '', location.pathname + location.search);
    show(null);
    storageErrorEl.textContent = `Could not open the shared link: ${e.message}`;
    return;
  }
  let storageError = '';
  try {
    localStorage.setItem(STORAGE_PREFIX + entry.id, JSON.stringify(entry));
  } catch (e) {
    storageError = `Not saved: ${e.message}`;
    entry.id = null;
  }
  history.replaceState(null, '', entry.id ? `#${entry.id}` : location.pathname + location.search);
  display(entry);
  storageErrorEl.textContent = storageError;
}

// Shows what the URL hash points at: a saved route, or one shared through a link.
function showHash() {
  const hash = location.hash.slice(1);
  if (hash.startsWith(SHARE_PREFIX)) showShared(hash.slice(SHARE_PREFIX.length));
  else show(hash);
}

async function share() {
  const { id, updated, ...shared } = current;
  let url;
  try {
    url = `${location.href.split('#')[0]}#${SHARE_PREFIX}${await encodeShare(shared)}`;
  } catch (e) {
    storageErrorEl.textContent = `Could not create the link: ${e.message}`;
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // no clipboard access
    prompt('Copy this link:', url);
  }
  // the length matters: chat and mail tools cut off long links
  shareEl.textContent = `Copied · ${Math.ceil(url.length / 1000)} kB`;
  setTimeout(() => (shareEl.textContent = 'Share'), 2500);
}

// the response used to be stored on its own, keep it as a saved route
function migrateLegacy() {
  try {
    const text = localStorage.getItem(LEGACY_KEY);
    if (text === null) return null;
    localStorage.removeItem(LEGACY_KEY);
    if (!text) return null;
    const entry = { ...blankEntry(), id: newId(), input: text, updated: Date.now() };
    localStorage.setItem(STORAGE_PREFIX + entry.id, JSON.stringify(entry));
    return entry.id;
  } catch {
    return null;
  }
}

titleEl.addEventListener('input', save);
descriptionEl.addEventListener('input', save);
input.addEventListener('input', () => {
  current.routeIdx = 0;
  save();
  load();
});
routesEl.addEventListener('change', () => {
  state.routeIdx = current.routeIdx = +routesEl.value;
  save();
  draw();
});
pickerEl.addEventListener('change', () => (location.hash = pickerEl.value));
shareEl.addEventListener('click', share);
newEl.addEventListener('click', showBlank);
deleteEl.addEventListener('click', () => {
  if (!confirm(`Delete "${displayTitle(current)}"?`)) return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + current.id);
  } catch {
    // storage unavailable
  }
  showBlank();
});
window.addEventListener('hashchange', showHash);
// keep up with other tabs: refresh the list, and reload this route if it was edited elsewhere
window.addEventListener('storage', (e) => {
  if (!e.key?.startsWith(STORAGE_PREFIX)) return;
  if (current.id && e.key === STORAGE_PREFIX + current.id && e.newValue) show(current.id);
  else refreshPicker();
});
// pasting anywhere outside a text field replaces the current response
document.addEventListener('paste', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const text = e.clipboardData?.getData('text');
  if (!text) return;
  e.preventDefault();
  input.value = text;
  current.routeIdx = 0;
  save();
  load();
});

const migrated = migrateLegacy();
if (!location.hash && migrated) history.replaceState(null, '', `#${migrated}`);
showHash();
