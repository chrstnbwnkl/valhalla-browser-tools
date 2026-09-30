const STORAGE_KEY = 'attributes-controller-builder:state';

// Every key of Valhalla's AttributesController::kDefaultAttributes (src/baldr/attributes_controller.cc),
// split by whether it is on or off when no filter is given.
const GROUPS = [
  {
    name: 'edge',
    on: [
      'edge.names', 'edge.length', 'edge.speed', 'edge.speed_type', 'edge.speeds_faded', 'edge.speeds_non_faded',
      'edge.road_class', 'edge.begin_heading', 'edge.end_heading', 'edge.begin_shape_index', 'edge.end_shape_index',
      'edge.traversability', 'edge.use', 'edge.toll', 'edge.unpaved', 'edge.tunnel', 'edge.bridge', 'edge.roundabout',
      'edge.internal_intersection', 'edge.drive_on_right', 'edge.surface',
      'edge.sign.exit_number', 'edge.sign.exit_branch', 'edge.sign.exit_toward', 'edge.sign.exit_name',
      'edge.sign.guide_branch', 'edge.sign.guide_toward', 'edge.sign.junction_name',
      'edge.sign.guidance_view_junction', 'edge.sign.guidance_view_signboard',
      'edge.travel_mode', 'edge.vehicle_type', 'edge.pedestrian_type', 'edge.bicycle_type', 'edge.transit_type',
      'edge.transit_route_info.onestop_id', 'edge.transit_route_info.block_id', 'edge.transit_route_info.trip_id',
      'edge.transit_route_info.short_name', 'edge.transit_route_info.long_name', 'edge.transit_route_info.headsign',
      'edge.transit_route_info.color', 'edge.transit_route_info.text_color', 'edge.transit_route_info.description',
      'edge.transit_route_info.operator_onestop_id', 'edge.transit_route_info.operator_name', 'edge.transit_route_info.operator_url',
      'edge.id', 'edge.way_id', 'edge.begin_osm_node_id', 'edge.end_osm_node_id',
      'edge.weighted_grade', 'edge.max_upward_grade', 'edge.max_downward_grade', 'edge.mean_elevation',
      'edge.lane_count', 'edge.lane_connectivity', 'edge.cycle_lane', 'edge.bicycle_network', 'edge.sac_scale',
      'edge.shoulder', 'edge.sidewalk', 'edge.density', 'edge.speed_limit', 'edge.conditional_speed_limits',
      'edge.truck_speed', 'edge.truck_route', 'edge.default_speed', 'edge.destination_only', 'edge.tagged_values',
      'edge.indoor', 'edge.landmarks', 'edge.country_crossing', 'edge.forward', 'edge.levels', 'edge.traffic_signal',
    ],
    off: [
      'edge.elevation', 'edge.destination_only_hgv', 'edge.is_urban', 'edge.hov_type', 'edge.ramp', 'edge.dismount',
      'edge.use_sidepath', 'edge.sidewalk_left', 'edge.sidewalk_right', 'edge.bss_connection', 'edge.lit',
      'edge.not_thru', 'edge.part_of_complex_restriction', 'edge.layer', 'edge.is_shortcut', 'edge.leaves_tile',
      'edge.curvature',
      'edge.speed_forward', 'edge.deadend_forward', 'edge.lanecount_forward', 'edge.truck_speed_forward',
      'edge.traffic_signal_forward', 'edge.stop_sign_forward', 'edge.yield_sign_forward', 'edge.access_forward',
      'edge.live_speed_forward', 'edge.freeflow_speed_forward',
      'edge.speed_backward', 'edge.deadend_backward', 'edge.lanecount_backward', 'edge.truck_speed_backward',
      'edge.traffic_signal_backward', 'edge.stop_sign_backward', 'edge.yield_sign_backward', 'edge.access_backward',
      'edge.live_speed_backward', 'edge.freeflow_speed_backward',
    ],
  },
  {
    name: 'node',
    on: [
      'node.intersecting_edge.begin_heading', 'node.intersecting_edge.from_edge_name_consistency',
      'node.intersecting_edge.to_edge_name_consistency', 'node.intersecting_edge.driveability',
      'node.intersecting_edge.cyclability', 'node.intersecting_edge.walkability', 'node.intersecting_edge.use',
      'node.intersecting_edge.road_class', 'node.intersecting_edge.lane_count', 'node.intersecting_edge.sign_info',
      'node.elapsed_time', 'node.admin_index', 'node.type', 'node.traffic_signal', 'node.fork',
      'node.transit_platform_info.type', 'node.transit_platform_info.onestop_id', 'node.transit_platform_info.name',
      'node.transit_platform_info.station_onestop_id', 'node.transit_platform_info.station_name',
      'node.transit_platform_info.arrival_date_time', 'node.transit_platform_info.departure_date_time',
      'node.transit_platform_info.is_parent_stop', 'node.transit_platform_info.assumed_schedule',
      'node.transit_platform_info.lat_lon',
      'node.transit_station_info.onestop_id', 'node.transit_station_info.name', 'node.transit_station_info.lat_lon',
      'node.transit_egress_info.onestop_id', 'node.transit_egress_info.name', 'node.transit_egress_info.lat_lon',
      'node.time_zone', 'node.transition_time',
    ],
    off: [
      'node.stop_impact', 'node.drive_on_right', 'node.elevation', 'node.tagged_access', 'node.private_access',
      'node.cash_only_toll', 'node.mode_change_allowed', 'node.named_intersection', 'node.is_transit', 'node.access',
    ],
  },
  {
    name: 'top level',
    on: ['osm_changeset', 'shape', 'confidence_score', 'raw_score'],
    off: ['incidents'],
  },
  {
    name: 'admin',
    on: ['admin.country_code', 'admin.country_text', 'admin.state_code', 'admin.state_text'],
    off: [],
  },
  {
    name: 'matched',
    on: [
      'matched.point', 'matched.type', 'matched.edge_index', 'matched.begin_route_discontinuity',
      'matched.end_route_discontinuity', 'matched.distance_along_edge', 'matched.distance_from_trace_point',
    ],
    off: [],
  },
  {
    name: 'shape_attributes',
    on: [],
    off: [
      'shape_attributes.time', 'shape_attributes.length', 'shape_attributes.speed', 'shape_attributes.speed_limit',
      'shape_attributes.closure', 'shape_attributes.congestion',
    ],
  },
  {
    name: 'incident',
    on: [],
    off: [
      'incident.id', 'incident.type', 'incident.description', 'incident.sub_type', 'incident.sub_type_description',
      'incident.start_time', 'incident.end_time', 'incident.impact', 'incident.road_closed',
      'incident.congestion_value', 'incident.creation_time', 'incident.long_description', 'incident.clear_lanes',
      'incident.num_lanes_blocked', 'incident.length', 'incident.iso_3166_1_alpha2', 'incident.iso_3166_1_alpha3',
    ],
  },
];
const KNOWN = new Set(GROUPS.flatMap((group) => [...group.on, ...group.off]));
const DEFAULT_OFF = new Set(GROUPS.flatMap((group) => group.off));

const $ = (id) => document.getElementById(id);
const filterEl = $('filter');
const availableEl = $('available');
const selectedEl = $('selected');
const countEl = $('count');
const outputEl = $('output');
const copyEl = $('copy');
const actionEls = [...document.querySelectorAll('input[name="action"]')];

let selected = new Set(); // attribute names; ones Valhalla doesn't know (yet) are kept as "custom"
let action = 'include';
// ctrl/shift+click marks attributes in a list so they can be moved together; `anchor` is where a shift range starts
const availableMarks = { marked: new Set(), anchor: null };
const selectedMarks = { marked: new Set(), anchor: null };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Lists the attributes `pick` accepts, under their group. Clicking one, or a group's button, hands it to `move`;
// clicking a marked one hands over everything marked.
function renderList(target, marks, pick, move, moveLabel) {
  const sections = [
    ...GROUPS.map((group) => [group.name, [...group.on, ...group.off]]),
    ['custom', [...selected].filter((name) => !KNOWN.has(name))],
  ];
  const shown = [];
  target.replaceChildren(...sections.flatMap(([groupName, names]) => {
    const picked = names.filter(pick);
    if (!picked.length) return [];
    shown.push(...picked);
    const button = el('button', { type: 'button', textContent: moveLabel });
    button.addEventListener('click', () => move(picked));
    return [
      el('li', { className: 'group' }, groupName, button),
      ...picked.map((name) => {
        const item = el('li', { className: 'attribute' }, name, DEFAULT_OFF.has(name) ? el('small', { textContent: 'off by default' }) : '');
        item.classList.toggle('marked', marks.marked.has(name));
        item.addEventListener('click', (e) => {
          if (e.shiftKey && shown.includes(marks.anchor)) {
            const [from, to] = [shown.indexOf(marks.anchor), shown.indexOf(name)].sort((a, b) => a - b);
            for (const between of shown.slice(from, to + 1)) marks.marked.add(between);
            render();
          } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
            if (!marks.marked.delete(name)) marks.marked.add(name);
            marks.anchor = name;
            render();
          } else {
            move(marks.marked.has(name) ? shown.filter((other) => marks.marked.has(other)) : [name]);
          }
        });
        return item;
      }),
    ];
  }));
  return shown;
}

function clearMarks(marks) {
  marks.marked.clear();
  marks.anchor = null;
}

function add(names) {
  for (const name of names) selected.add(name);
  clearMarks(availableMarks);
  update();
}

function remove(names) {
  for (const name of names) selected.delete(name);
  clearMarks(selectedMarks);
  update();
}

// in Valhalla's order, custom attributes last
const orderedSelection = () => [...[...KNOWN].filter((name) => selected.has(name)), ...[...selected].filter((name) => !KNOWN.has(name))];

let available = []; // what the left list currently shows

function render() {
  const filter = filterEl.value.trim().toLowerCase();
  available = renderList(availableEl, availableMarks, (name) => !selected.has(name) && name.includes(filter), add, 'add all');
  if (filter && !KNOWN.has(filter) && !selected.has(filter)) {
    const custom = el('li', { className: 'attribute' }, `Add "${filter}"`, el('small', { textContent: 'custom' }));
    custom.addEventListener('click', () => addCustom(filter));
    availableEl.prepend(custom);
  }
  renderList(selectedEl, selectedMarks, (name) => selected.has(name), remove, 'remove all');
  countEl.textContent = `${selected.size} of ${KNOWN.size}`;
  for (const radio of actionEls) radio.checked = radio.value === action;
  outputEl.value = JSON.stringify({ filters: { attributes: orderedSelection(), action } }, null, 2);
}

function update() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected: [...selected], action }));
  } catch {
    // storage unavailable
  }
  render();
}

function addCustom(name) {
  filterEl.value = '';
  add([name]);
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.selected)) selected = new Set(saved.selected.filter((name) => typeof name === 'string'));
    if (saved?.action === 'exclude') action = 'exclude';
  } catch {
    // storage unavailable or corrupt
  }
}

filterEl.addEventListener('input', render);
// Enter adds the only match, or the typed text as a custom attribute when nothing matches
filterEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const filter = filterEl.value.trim().toLowerCase();
  if (available.length === 1) addCustom(available[0]);
  else if (filter && !available.length && !selected.has(filter)) addCustom(filter);
});
for (const radio of actionEls) {
  radio.addEventListener('change', () => {
    action = radio.value;
    update();
  });
}
copyEl.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(outputEl.value);
  } catch {
    // no clipboard access (e.g. opened from disk): fall back to copying the selected text
    outputEl.select();
    document.execCommand('copy');
  }
  copyEl.textContent = 'Copied';
  setTimeout(() => (copyEl.textContent = 'Copy'), 1200);
});
// keep up with other tabs
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  restore();
  render();
});

restore();
render();
