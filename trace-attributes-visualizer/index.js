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
const APP_TITLE = document.title;
// one localStorage key per saved trace, so tabs editing different traces never overwrite each other
const STORAGE_PREFIX = 'trace-attributes-visualizer:trace:';
// a URL hash starting with this carries a whole trace instead of the id of a saved one
const SHARE_PREFIX = 'share=';
const SOURCES = ['edges', 'nodes', 'points'];

const EDGE_COLORS = ['#2563eb', '#ea580c']; // default theme: alternate so edge boundaries show
const NODE_COLOR = '#ffffff'; // default theme: all nodes alike
// categorical values get these in order of frequency; anything past the last one is folded into "other"
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const OTHER_COLOR = '#898781'; // "other" and `false`
const MISSING_COLOR = '#d1d5db'; // the attribute is absent
// numeric values: one hue, light = low, dark = high. Edges and nodes get different hues.
const EDGE_RAMP = ['#b7d3f6', '#6da7ec', '#2a78d6', '#184f95', '#0d366b'];
const NODE_RAMP = ['#fbe0d3', '#f4a27e', '#eb6834', '#b0451a', '#6e2a0e'];
const POINT_COLORS = { matched: '#111827', interpolated: '#898781', unmatched: '#d03b3b' };
// not worth a theme of their own
const HIDDEN_KEYS = new Set(['begin_shape_index', 'end_shape_index']);
// numeric, but identifiers rather than quantities
const ID_KEY = /(^|_)id$/;

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
const pathsEl = $('paths');
const summaryEl = $('summary');
const themesEl = $('themes');
const edgeVisibleEl = $('edge-visible');
const nodeVisibleEl = $('node-visible');
const edgeLabelsEl = $('edge-labels');
const nodeLabelsEl = $('node-labels');
const edgeThemeEl = $('edge-theme');
const nodeThemeEl = $('node-theme');
const edgeLegendEl = $('edge-legend');
const nodeLegendEl = $('node-legend');
const edgesEl = $('edges');

const map = new maplibregl.Map({ container: 'map', style: STYLE, center: [10, 50], zoom: 3 });
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl());

// edgeTheme / nodeTheme: the attribute to color by, '' for the default theme
const blankEntry = () => ({ id: null, title: '', description: '', input: '', pathIdx: 0, edgeTheme: '', nodeTheme: '', showEdges: true, showNodes: true, labelEdges: false, labelNodes: false });

let current = blankEntry(); // the saved trace shown in this tab; its id is mirrored in the URL hash
let state = null; // { data, paths, pathIdx }
let edges = []; // edges of the selected path
let labelMarkers = [];
let popup = null;

const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const point = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const fmt = (n, unit = '') => (typeof n === 'number' ? `${+n.toFixed(3)}${unit}` : '–');
const fmtValue = (value) => (typeof value === 'number' ? fmt(value) : value === undefined ? '–' : String(value));

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
// Without a hint it is taken to be 6, Valhalla's default.
function toCoords(geometry, hint) {
  if (!geometry) return [];
  if (typeof geometry !== 'string') return geometry.coordinates ?? [];
  const p5 = decodePolyline(geometry, 5);
  const p6 = decodePolyline(geometry, 6);
  if (!p6.length) return [];
  if (!hint) return p6;
  const dist = (c) => Math.hypot(c[0] - hint[0], c[1] - hint[1]);
  return dist(p6[0]) < dist(p5[0]) ? p6 : p5;
}

// The end_node with its admin_index swapped for the admin it points at.
function resolveNode(path, node) {
  const admin = (path.admins ?? state.data.admins)?.[node?.admin_index];
  if (!admin) return node;
  const { admin_index, ...rest } = node;
  return { ...rest, admin };
}

function pathEdges(path) {
  const first = path.matched_points?.[0];
  const shape = toCoords(path.shape, first && [first.lon, first.lat]);
  return path.edges.map((edge, idx) => ({
    idx,
    edge,
    node: resolveNode(path, edge.end_node),
    coords: shape.slice(edge.begin_shape_index, edge.end_shape_index + 1),
  }));
}

// The point halfway along a line, for placing its label.
function midpoint(coords) {
  const lengths = coords.slice(1).map((c, i) => Math.hypot(c[0] - coords[i][0], c[1] - coords[i][1]));
  let rest = lengths.reduce((acc, length) => acc + length, 0) / 2;
  for (const [i, length] of lengths.entries()) {
    if (rest <= length) {
      const t = length ? rest / length : 0;
      return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
    }
    rest -= length;
  }
  return coords[0];
}

// --- themes -----------------------------------------------------------------

// The value an attribute is themed by: lists of primitives (names) and flat objects (admin) are
// joined, lists of objects (intersecting_edges) are counted, and deeper objects can't be themed.
function scalar(value) {
  const flat = (values) => values.every((v) => typeof v !== 'object');
  if (Array.isArray(value)) return flat(value) ? value.join(' / ') : value.length;
  if (value === null || typeof value !== 'object') return value ?? undefined;
  return flat(Object.values(value)) ? Object.values(value).join(' / ') : undefined;
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
  const [a, b] = [ramp[i], ramp[i + 1]].map((hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)));
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * (pos - i))).join(', ')})`;
}

// Maps the values of one attribute to colors: numbers onto `ramp`, everything else onto the
// categorical palette. Returns the color function and what the legend needs to explain it.
function makeScale(key, values, ramp) {
  const present = values.filter((v) => v !== undefined);
  const missing = values.length - present.length;

  if (present.length && present.every((v) => typeof v === 'number') && !ID_KEY.test(key)) {
    const min = present.reduce((a, b) => Math.min(a, b));
    const max = present.reduce((a, b) => Math.max(a, b));
    return {
      color: (v) => (v === undefined ? MISSING_COLOR : rampColor(ramp, max > min ? (v - min) / (max - min) : 1)),
      ramp,
      min,
      max,
      missing,
    };
  }

  const counts = new Map();
  for (const v of present) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const booleans = present.every((v) => typeof v === 'boolean');
  const pick = (label, i) => (booleans ? (label === 'true' ? CATEGORICAL[0] : OTHER_COLOR) : CATEGORICAL[i]);
  const rows = ranked.slice(0, CATEGORICAL.length).map(([label, count], i) => ({ label, count, color: pick(label, i) }));
  const colors = new Map(rows.map((row) => [row.label, row.color]));
  const rest = ranked.slice(CATEGORICAL.length);
  if (rest.length) {
    rows.push({ label: `other (${rest.length} values)`, count: rest.reduce((acc, [, count]) => acc + count, 0), color: OTHER_COLOR });
  }
  return {
    color: (v) => (v === undefined ? MISSING_COLOR : colors.get(String(v)) ?? OTHER_COLOR),
    rows,
    missing,
  };
}

function drawLegend(target, scale) {
  if (!scale) return target.replaceChildren();
  const row = ({ label, count, color }) => {
    const swatch = el('i');
    swatch.style.background = color;
    return el('div', { className: 'row' }, swatch, el('span', { textContent: label, title: label }), el('small', { textContent: count }));
  };
  const children = [];
  if (scale.ramp) {
    const bar = el('div', { className: 'ramp' });
    bar.style.background = `linear-gradient(to right, ${scale.ramp.join(', ')})`;
    children.push(bar, el('div', { className: 'ends' }, el('span', { textContent: fmt(scale.min) }), el('span', { textContent: fmt(scale.max) })));
  } else {
    children.push(...scale.rows.map(row));
  }
  if (scale.missing) children.push(row({ label: 'no value', count: scale.missing, color: MISSING_COLOR }));
  target.replaceChildren(...children);
}

// Fills a theme <select> with the attributes of the current path and returns the theme in
// effect. A saved theme the path doesn't have falls back to the default without being forgotten.
function fillThemes(select, defaultLabel, keys, wanted) {
  select.replaceChildren(
    el('option', { value: '', textContent: defaultLabel }),
    ...keys.map((key) => el('option', { value: key, textContent: key })),
  );
  select.value = keys.includes(wanted) ? wanted : '';
  return select.value;
}

// --- rendering --------------------------------------------------------------

const ready = new Promise((resolve) => map.on('load', resolve)).then(() => {
  for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: fc([]) });

  const round = { 'line-cap': 'round', 'line-join': 'round' };
  // dark casing, so the light end of a ramp still reads on the basemap
  map.addLayer({ id: 'edges-casing', type: 'line', source: 'edges', layout: round, paint: { 'line-color': '#1f2937', 'line-width': 8 } });
  map.addLayer({ id: 'edges', type: 'line', source: 'edges', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
  map.addLayer({ id: 'edges-active', type: 'line', source: 'edges', layout: round, filter: ['==', ['get', 'idx'], -1], paint: { 'line-color': '#facc15', 'line-width': 11, 'line-opacity': 0.7 } });
  map.addLayer({ id: 'points', type: 'circle', source: 'points', paint: { 'circle-radius': 3, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } });
  map.addLayer({ id: 'nodes', type: 'circle', source: 'nodes', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#1f2937' } });

  map.on('mousemove', 'edges', (e) => highlight(e.features[0].properties.idx));
  map.on('mouseleave', 'edges', () => highlight(null));
  for (const layer of ['edges', 'nodes', 'points']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  map.on('click', onMapClick);
});

function applyVisibility() {
  edgeVisibleEl.checked = current.showEdges;
  nodeVisibleEl.checked = current.showNodes;
  const show = (layers, visible) => layers.forEach((id) => map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'));
  show(['edges-casing', 'edges', 'edges-active'], current.showEdges);
  show(['nodes'], current.showNodes);
}

// Puts the themed value (or the index, for the default themes) on every visible edge and node.
function drawLabels() {
  edgeLabelsEl.checked = current.labelEdges;
  nodeLabelsEl.checked = current.labelNodes;
  for (const marker of labelMarkers) marker.remove();
  labelMarkers = [];
  const add = (className, text, color, lngLat, options) => {
    const label = el('div', { className, textContent: text });
    label.style.borderColor = color;
    labelMarkers.push(new maplibregl.Marker({ element: label, ...options }).setLngLat(lngLat).addTo(map));
  };
  for (const e of edges) {
    if (current.showEdges && current.labelEdges && e.label && e.coords.length > 1) {
      add('edge-label', e.label, e.color, midpoint(e.coords));
    }
    if (current.showNodes && current.labelNodes && e.nodeLabel && e.node && e.coords.length) {
      add('node-label', e.nodeLabel, e.nodeColor, e.coords.at(-1), { anchor: 'left', offset: [10, 0] });
    }
  }
}

// Redraws the selected path. `fit` is off when only the theme changed, so the view stays put.
function draw(fit = true) {
  clear();
  applyVisibility();
  const path = state.paths[state.pathIdx];
  edges = pathEdges(path);
  const nodes = edges.filter((e) => e.node);

  const edgeTheme = fillThemes(edgeThemeEl, 'Edge index (alternating)', themeKeys(edges.map((e) => e.edge)), current.edgeTheme);
  const nodeTheme = fillThemes(nodeThemeEl, 'Uniform', themeKeys(nodes.map((e) => e.node)), current.nodeTheme);
  for (const e of edges) {
    e.value = scalar(e.edge[edgeTheme]);
    e.nodeValue = scalar(e.node?.[nodeTheme]);
    e.label = edgeTheme ? (e.value === undefined ? '' : fmtValue(e.value)) : `#${e.idx}`;
    e.nodeLabel = nodeTheme ? (e.nodeValue === undefined ? '' : fmtValue(e.nodeValue)) : `#${e.idx}`;
  }
  const edgeScale = edgeTheme ? makeScale(edgeTheme, edges.map((e) => e.value), EDGE_RAMP) : null;
  const nodeScale = nodeTheme ? makeScale(nodeTheme, nodes.map((e) => e.nodeValue), NODE_RAMP) : null;
  for (const e of edges) {
    e.color = edgeScale ? edgeScale.color(e.value) : EDGE_COLORS[e.idx % EDGE_COLORS.length];
    e.nodeColor = nodeScale ? nodeScale.color(e.nodeValue) : NODE_COLOR;
  }
  drawLegend(edgeLegendEl, edgeScale);
  drawLegend(nodeLegendEl, nodeScale);
  themesEl.hidden = false;

  map.getSource('edges').setData(fc(edges.filter((e) => e.coords.length > 1).map((e) => line(e.coords, { idx: e.idx, color: e.color }))));
  map.getSource('nodes').setData(fc(nodes.filter((e) => e.coords.length).map((e) => point(e.coords.at(-1), { idx: e.idx, color: e.nodeColor }))));
  map.getSource('points').setData(fc((path.matched_points ?? [])
    .map((p, i) => typeof p?.lon === 'number' && point([p.lon, p.lat], { i, color: POINT_COLORS[p.type] ?? POINT_COLORS.interpolated }))
    .filter(Boolean)));

  drawPanel(path, edgeTheme, nodeTheme);
  drawLabels();

  const allCoords = edges.flatMap((e) => e.coords);
  if (!allCoords.length) {
    errorEl.textContent = 'Nothing to draw: the response needs shape, edge.begin_shape_index and edge.end_shape_index.';
  } else if (fit) {
    const bounds = allCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds());
    map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 0 });
  }
}

function drawPanel(path, edgeTheme, nodeTheme) {
  const unit = { kilometers: ' km', miles: ' mi' }[path.units ?? state.data.units] ?? '';
  const tile = (label, value) => el('div', {}, el('small', { textContent: label }), el('b', { textContent: value }));
  const hasLength = edges.some((e) => typeof e.edge.length === 'number');
  summaryEl.replaceChildren(
    tile('edges', String(edges.length)),
    tile('length', hasLength ? fmt(edges.reduce((acc, e) => acc + (e.edge.length ?? 0), 0), unit) : '–'),
    tile('elapsed time', fmt(edges.findLast((e) => typeof e.edge.end_node?.elapsed_time === 'number')?.edge.end_node.elapsed_time, ' s')),
  );

  edgesEl.replaceChildren();
  for (const e of edges) {
    const { edge } = e;
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = e.color;
    const nodeLine = el('small');
    if (nodeTheme && e.node) {
      const dot = el('span', { className: 'dot' });
      dot.style.background = e.nodeColor;
      nodeLine.append(dot, fmtValue(e.nodeValue));
    }
    e.item = el('li', { className: 'edge' },
      swatch,
      el('div', { className: 'instr' },
        edge.names?.join(' / ') || 'Unnamed',
        el('small', { textContent: [`#${e.idx}`, edge.road_class, edge.use].filter(Boolean).join(' · ') })),
      el('div', { className: 'metrics' },
        el('b', { textContent: edgeTheme ? fmtValue(e.value) : fmt(edge.length, unit) }),
        el('small', { textContent: edgeTheme && typeof edge.length === 'number' ? fmt(edge.length, unit) : '' }),
        nodeLine),
    );
    e.item.addEventListener('mouseenter', () => highlight(e.idx));
    e.item.addEventListener('mouseleave', () => highlight(null));
    e.item.addEventListener('click', () => {
      if (!e.coords.length) return;
      const bounds = e.coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds());
      map.fitBounds(bounds, { padding: 120, maxZoom: 17 });
    });
    edgesEl.append(e.item);
  }
}

function highlight(idx) {
  map.setFilter('edges-active', ['==', ['get', 'idx'], idx ?? -1]);
  for (const e of edges) e.item?.classList.toggle('active', e.idx === idx);
}

function onMapClick(e) {
  const [feature] = map.queryRenderedFeatures(e.point, { layers: ['nodes', 'points', 'edges'] });
  if (!feature) return;
  const { idx, i } = feature.properties;
  if (feature.layer.id === 'points') {
    showPopup(`matched point ${i}`, state.paths[state.pathIdx].matched_points[i], feature.geometry.coordinates);
  } else if (feature.layer.id === 'nodes') {
    showPopup(`edge ${idx} · end_node`, edges[idx].node, feature.geometry.coordinates);
  } else {
    const { end_node, ...attributes } = edges[idx].edge;
    showPopup(`edge ${idx}`, attributes, e.lngLat);
    edges[idx].item.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

function clear() {
  popup?.remove();
  for (const marker of labelMarkers) marker.remove();
  labelMarkers = [];
  edges = [];
  for (const id of SOURCES) map.getSource(id).setData(fc([]));
  themesEl.hidden = true;
  summaryEl.replaceChildren();
  edgesEl.replaceChildren();
}

// --- input ------------------------------------------------------------------

function fail(message) {
  errorEl.textContent = message;
  state = null;
  pathsEl.hidden = true;
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
  // with best_paths > 1 the other candidates come along as alternate_paths
  const paths = [data, ...(data?.alternate_paths ?? [])].filter((path) => Array.isArray(path?.edges) && path.edges.length);
  if (!paths.length) {
    return fail(data?.error ? `${data.error_code ?? 'Error'}: ${data.error}` : 'No edges found in the response.');
  }

  errorEl.textContent = '';
  state = { data, paths, pathIdx: current.pathIdx < paths.length ? current.pathIdx : 0 };
  pathsEl.replaceChildren(...paths.map((path, i) => el('option', {
    value: i,
    textContent: `Path ${i}${typeof path.confidence_score === 'number' ? ` · confidence ${fmt(path.confidence_score)}` : ''}`,
  })));
  pathsEl.value = state.pathIdx;
  pathsEl.hidden = paths.length < 2;
  ready.then(() => draw());
}

// --- saved traces -----------------------------------------------------------

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
  if (!current.id) options.unshift(el('option', { value: '', textContent: 'New trace (not saved yet)' }));
  pickerEl.replaceChildren(...options);
  pickerEl.value = current.id ?? '';
  deleteEl.disabled = !current.id;
  shareEl.disabled = !input.value.trim();
  document.title = current.id ? `${displayTitle(current)} – ${APP_TITLE}` : APP_TITLE;
}

// Writes the form into storage. A new trace only gets an id once it has some content.
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
  const entry = { ...blankEntry(), ...(id && readEntry(id)) };
  // the hash points at a trace that no longer exists
  if (id && !entry.id) history.replaceState(null, '', location.pathname + location.search);
  display(entry);
}

function showBlank() {
  history.pushState(null, '', location.pathname + location.search);
  show(null);
}

// --- sharing ----------------------------------------------------------------

// A trace travels in the URL hash as deflated, base64url-encoded JSON, so it never reaches a server.
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

// A shared trace becomes a saved trace of whoever opens the link, independent of the sender's copy.
async function showShared(text) {
  let entry;
  try {
    const shared = await decodeShare(text);
    if (typeof shared?.input !== 'string') throw new Error('it does not contain a trace');
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

// Shows what the URL hash points at: a saved trace, or one shared through a link.
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

titleEl.addEventListener('input', save);
descriptionEl.addEventListener('input', save);
input.addEventListener('input', () => {
  current.pathIdx = 0;
  save();
  load();
});
pathsEl.addEventListener('change', () => {
  state.pathIdx = current.pathIdx = +pathsEl.value;
  save();
  draw();
});
edgeVisibleEl.addEventListener('change', () => {
  current.showEdges = edgeVisibleEl.checked;
  save();
  applyVisibility();
  drawLabels();
});
nodeVisibleEl.addEventListener('change', () => {
  current.showNodes = nodeVisibleEl.checked;
  save();
  applyVisibility();
  drawLabels();
});
edgeLabelsEl.addEventListener('change', () => {
  current.labelEdges = edgeLabelsEl.checked;
  save();
  drawLabels();
});
nodeLabelsEl.addEventListener('change', () => {
  current.labelNodes = nodeLabelsEl.checked;
  save();
  drawLabels();
});
edgeThemeEl.addEventListener('change', () => {
  current.edgeTheme = edgeThemeEl.value;
  save();
  draw(false);
});
nodeThemeEl.addEventListener('change', () => {
  current.nodeTheme = nodeThemeEl.value;
  save();
  draw(false);
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
// keep up with other tabs: refresh the list, and reload this trace if it was edited elsewhere
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
  current.pathIdx = 0;
  save();
  load();
});

showHash();
