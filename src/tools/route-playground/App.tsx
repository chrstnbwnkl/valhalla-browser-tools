import type { Position } from "geojson";
import type {
  LngLat,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
} from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import { copyText } from "../../shared/clipboard";
import { useStoredState } from "../../shared/hooks/useStoredState";
import { readUrlParam, useUrlParam } from "../../shared/hooks/urlParam";
import { useMap } from "../../shared/map/context";
import { Controls } from "../../shared/map/Controls";
import { fitTo } from "../../shared/map/fit";
import { InspectPopup } from "../../shared/map/InspectPopup";
import { MapEvents } from "../../shared/map/MapEvents";
import { MapView } from "../../shared/map/MapView";
import { useThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";
import { CommitInput, TextArea } from "../../shared/ui/Input";
import { Menu, type MenuItem } from "../../shared/ui/Menu";
import { OptionFields } from "../../shared/valhalla/OptionFields";
import {
  INVALID_REQUEST,
  locationsOf,
  newLocation,
  optionState,
  optionValue,
  parseRequest,
  positionOf,
  pretty,
  withOption,
  type Json,
  type LocateRequest as Request,
  type Location,
  type Option,
} from "../../shared/valhalla/request";
import { SavedViews } from "../../shared/valhalla/SavedViews";
import { ServerPicker } from "../../shared/valhalla/ServerPicker";
import { useServers } from "../../shared/valhalla/servers";
import {
  FORMAT,
  fetchRoute,
  mapMatch,
  toFilters,
  traceRequest,
  type RouteResult,
} from "./api";
import { COSTINGS, costingOptions } from "./costing";
import { DrawTools, type DrawMode } from "./DrawTools";
import { routeEdges } from "./edges";
import { EdgesLayers } from "./EdgesLayers";
import { InputLayers } from "./InputLayers";
import { FactorPopup, WaypointPopup } from "./Popups";
import { FilterDialog } from "./FilterDialog";
import {
  ROUTE_OPTIONS,
  costLines,
  costingOptionsOf,
  exclusionRings,
  inserted,
  moved,
  withCostLine,
  withCostingOption,
  withExclusion,
  withFactor,
  withoutCostLine,
  withoutExclusion,
} from "./request";
import { ResultPanel, type View } from "./ResultPanel";
import {
  flattenSteps,
  legShapes,
  routeCoords,
} from "../../shared/valhalla/osrm";
import { StepsLayers } from "./StepsLayers";
import { DEFAULT_THEMES, themeEdges } from "./themes";
import { useHoverCursor } from "./useHoverCursor";
import { useTraces } from "./useTraces";

// the parameter Valhalla itself accepts on GET requests
export const URL_PARAM = "json";
export const FILTERS_KEY = "valhalla-browser-tools:attribute-filter";
const DEFAULT_REQUEST = { locations: [], costing: "auto", format: FORMAT };
const INSPECTABLE = ["waypoints", "intersections", "nodes", "edges"];
const HOVERABLE = [...INSPECTABLE, "cost-lines"];

function parseFilters(raw: unknown) {
  try {
    return raw === null ? null : toFilters(raw);
  } catch {
    return null;
  }
}

function initialText() {
  const shared = readUrlParam(URL_PARAM);
  if (shared === null) return { text: pretty(DEFAULT_REQUEST), shared: false };
  try {
    return { text: pretty(JSON.parse(shared)), shared: true };
  } catch {
    return { text: shared, shared: true };
  }
}

const round6 = ([lon = 0, lat = 0]: Position) => [
  +lon.toFixed(6),
  +lat.toFixed(6),
];

type Popup =
  | { kind: "inspect"; title: string; object: Json; at: Position }
  | { kind: "factor"; i: number; at: Position }
  | { kind: "waypoint"; index: number };

type MenuState = {
  at: { x: number; y: number };
  title: string;
  items: MenuItem[];
};

function HoverCursor({ enabled }: { enabled: boolean }) {
  useHoverCursor(HOVERABLE, enabled);
  return null;
}

export function App() {
  const map = useMap();
  const colors = useThemeColors();
  const servers = useServers();

  const [initial] = useState(initialText);
  const [text, setText] = useState(initial.text);
  const { request, error: parseError } = useMemo(
    () => parseRequest(text),
    [text],
  );
  const locations = useMemo(() => locationsOf(request), [request]);
  const rings = useMemo(() => exclusionRings(request), [request]);
  const lines = useMemo(() => costLines(request), [request]);
  const costing = typeof request?.costing === "string" ? request.costing : "";
  // the options new waypoints get
  const [template, setTemplate] = useState<Location>({});

  const [error, setError] = useState<string | null>(null);
  // what is going on, in place of the status of the result
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [routeIdx, setRouteIdx] = useState(0);
  const [view, setView] = useState<View>("steps");
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [themes, setThemes] = useState(DEFAULT_THEMES);
  const [filters, setFilters] = useStoredState(FILTERS_KEY, parseFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  // the JSON was typed into since the last send
  const edited = useRef(false);
  const pending = useRef<AbortController | null>(null);

  useUrlParam(URL_PARAM, request && JSON.stringify(request));

  const route = result?.data.routes[routeIdx] ?? null;
  const start = result?.data.waypoints?.[0]?.location;
  const steps = useMemo(() => (route ? flattenSteps(route) : []), [route]);
  const coords = useMemo(
    () => (route ? routeCoords(route, start) : []),
    [route, start],
  );
  const alternatives = useMemo(
    () =>
      (result?.data.routes ?? [])
        .filter((_, i) => i !== routeIdx)
        .map((r) => routeCoords(r, start)),
    [result, routeIdx, start],
  );
  const traceKey = useMemo(
    () => result && { sent: result.sent, filters, routeIdx },
    [result, filters, routeIdx],
  );
  const traces = useTraces(
    servers.selected,
    traceKey,
    useMemo(() => (route ? legShapes(route, start) : []), [route, start]),
    view === "edges",
  );
  const edges = useMemo(
    () =>
      traces.legs && {
        legs: traces.legs,
        themed: themeEdges(routeEdges(traces.legs), themes, colors),
      },
    [traces.legs, themes, colors],
  );
  const traceRequestText = useMemo(
    () =>
      result
        ? pretty(traceRequest(coords, "edge_walk", result.sent, filters))
        : "",
    [result, coords, filters],
  );

  function status() {
    if (notice) return notice;
    if (!result) return "";
    if (view !== "edges") return result.status;
    if (traces.loading)
      return `${result.status} · requesting trace_attributes…`;
    const snapped = (traces.legs ?? []).flatMap((leg, i) =>
      leg.snapped ? [i] : [],
    );
    return snapped.length
      ? `${result.status} · edge_walk failed for leg ${snapped.join(", ")}: its edges are map-matched`
      : result.status;
  }

  const write = (next: Request) => setText(pretty(next));
  const closeInspect = () =>
    setPopup((p) => (p?.kind === "inspect" ? null : p));

  function clearResults() {
    pending.current?.abort();
    setResult(null);
    setNotice(null);
    setHighlighted(null);
    closeInspect();
  }

  function fitToPoints(req: Request, on: MapLibreMap | null, always = false) {
    const points = locationsOf(req)
      .map(positionOf)
      .filter((at) => at !== null);
    if (!on || !points.length) return;
    const bounds = on.getBounds();
    if (!always && points.every((at) => bounds.contains(at))) return;
    fitTo(on, points, { padding: 80, maxZoom: 16, duration: 0 });
  }

  function send(
    req: Request | null = request,
    server = servers.selected,
    on = map,
  ) {
    if (!req) return setError(INVALID_REQUEST);
    edited.current = false;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError(null);
    setNotice("Requesting…");
    fitToPoints(req, on);

    const sent = { ...req, format: FORMAT };
    const started = performance.now();
    fetchRoute(server, sent, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        const count = data.routes.length;
        const ms = Math.round(performance.now() - started);
        setResult({
          data,
          sent,
          status: `${count} ${count > 1 ? "routes" : "route"} · ${ms} ms`,
        });
        setNotice(null);
        setRouteIdx(0);
        setHighlighted(null);
        closeInspect();
      },
      (e: Error) => {
        if (controller.signal.aborted) return;
        clearResults();
        setError(e.message);
      },
    );
  }

  /** The request, or null after reporting that it doesn't parse. */
  function editable() {
    if (!request) setError(INVALID_REQUEST);
    return request;
  }

  /** Writes a request edited through the UI and routes it, once it has two waypoints. */
  function change(next: Request) {
    write(next);
    if (locationsOf(next).filter(positionOf).length >= 2) send(next);
    else clearResults();
  }

  function typed(value: string) {
    setText(value);
    setError(null);
    edited.current = true;
  }

  function setLocations(next: Location[]) {
    const req = editable();
    if (!req) return;
    // indices shift
    setPopup((p) => (p?.kind === "waypoint" ? null : p));
    change({ ...req, locations: next });
  }

  const addLocation = (lngLat: LngLat, at = locations.length) =>
    setLocations(inserted(locations, newLocation(lngLat, template), at));

  function moveLocation(index: number, { lng, lat }: LngLat) {
    const req = editable();
    if (!req) return;
    const to = { lat: +lat.toFixed(6), lon: +lng.toFixed(6) };
    change({
      ...req,
      locations: locations.map((l, i) => (i === index ? { ...l, ...to } : l)),
    });
  }

  function setOption(option: Option, raw: string) {
    const req = editable();
    if (!req) return;
    const value = optionValue(option, raw);
    setTemplate(withOption(template, option.path, value));
    change({
      ...req,
      locations: locations.map((l) => withOption(l, option.path, value)),
    });
  }

  function setWaypointOption(index: number, option: Option, raw: string) {
    const req = editable();
    if (!req) return;
    const value = optionValue(option, raw);
    change({
      ...req,
      locations: locations.map((l, i) =>
        i === index ? withOption(l, option.path, value) : l,
      ),
    });
  }

  function setCosting(value: string) {
    const req = editable();
    if (!req) return;
    const { costing: _, ...rest } = req;
    change(value.trim() ? { ...req, costing: value.trim() } : rest);
  }

  function setCostingOption(option: Option, raw: string) {
    const req = editable();
    if (req)
      change(
        withCostingOption(req, costing, option.path, optionValue(option, raw)),
      );
  }

  function edit(apply: (req: Request) => Request) {
    const req = editable();
    if (req) change(apply(req));
  }

  function drawn(mode: DrawMode, shape: Position[]) {
    if (mode === "polygon")
      return edit((req) => withExclusion(req, shape.map(round6)));
    const req = editable();
    if (!req) return;
    setNotice("Map matching the drawn line…");
    mapMatch(servers.selected, shape, req).then(
      (encoded) => {
        setNotice(null);
        change(withCostLine(req, encoded));
      },
      (e: Error) => {
        setNotice(null);
        setError(e.message);
      },
    );
  }

  function featureAt(e: MapMouseEvent): MapGeoJSONFeature | undefined {
    if (!map) return undefined;
    const query = (layers: string[]) => {
      const present = layers.filter((id) => map.getLayer(id));
      return present.length
        ? map.queryRenderedFeatures(e.point, { layers: present })
        : [];
    };
    // results that can be inspected come before the cost lines underneath
    return [...query(INSPECTABLE), ...query(["cost-lines"])][0];
  }

  function onMapClick(e: MapMouseEvent) {
    if (drawMode) return;
    if (
      (e.originalEvent.target as Element | null)?.closest?.(
        ".maplibregl-marker",
      )
    )
      return;
    // with a popup open, a click only closes it
    if (popup) return setPopup(null);
    const feature = featureAt(e);
    if (!feature) return editable() && addLocation(e.lngLat);

    const { idx = -1, i = -1 } = feature.properties as {
      idx?: number;
      i?: number;
    };
    const clicked: Position = [e.lngLat.lng, e.lngLat.lat];
    const at =
      feature.geometry.type === "Point"
        ? feature.geometry.coordinates
        : clicked;
    const inspect = (title: string, object: Json | undefined) =>
      object && setPopup({ kind: "inspect", title, object, at });
    switch (feature.layer.id) {
      case "cost-lines":
        return setPopup({ kind: "factor", i, at: clicked });
      case "waypoints":
        return inspect(`waypoint ${i}`, result?.data.waypoints?.[i]);
      case "intersections":
        return inspect(
          `step ${idx} · intersection ${i}`,
          steps[idx]?.step.intersections?.[i],
        );
      case "nodes":
        return inspect(
          `edge ${idx} · end_node`,
          edges?.themed.edges[idx]?.node,
        );
      case "edges": {
        const edge = edges?.themed.edges[idx]?.edge;
        if (!edge) return;
        const { end_node: _, ...attributes } = edge;
        return setPopup({
          kind: "inspect",
          title: `edge ${idx}`,
          object: attributes,
          at: clicked,
        });
      }
    }
  }

  function onMapContextMenu(e: MapMouseEvent) {
    e.originalEvent.preventDefault();
    if (!editable()) return;
    const at = { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
    const [polygon] = map?.getLayer("exclusions-fill")
      ? map.queryRenderedFeatures(e.point, { layers: ["exclusions-fill"] })
      : [];
    if (polygon) {
      const i = polygon.properties.i as number;
      return setMenu({
        at,
        title: "Exclude polygon",
        items: [
          {
            label: "Delete",
            danger: true,
            action: () => edit((req) => withoutExclusion(req, i)),
          },
        ],
      });
    }
    if (drawMode) return;

    const count = locations.length;
    const items: MenuItem[] = Array.from({ length: count + 1 }, (_, i) => ({
      label: !count
        ? "Add as the first waypoint"
        : i === 0
          ? "Insert as the start"
          : i === count
            ? "Append as the end"
            : `Insert between ${i} and ${i + 1}`,
      action: () => addLocation(e.lngLat, i),
    }));
    const wrapped = e.lngLat.wrap();
    const lonLat = `${wrapped.lng.toFixed(6)},${wrapped.lat.toFixed(6)}`;
    items.push(
      { label: `Copy ${lonLat}`, action: () => void copyText(lonLat) },
      {
        label: "Copy as Valhalla location",
        action: () => void copyText(pretty(newLocation(wrapped, template))),
      },
    );
    setMenu({ at, title: "New waypoint", items });
  }

  function openWaypointMenu(index: number, e: MouseEvent) {
    const count = locations.length;
    const items: MenuItem[] = [
      {
        label: "Delete",
        danger: true,
        action: () => setLocations(locations.filter((_, i) => i !== index)),
      },
    ];
    for (let to = 0; to < count; to++) {
      if (to === index) continue;
      const where = to === 0 ? " (start)" : to === count - 1 ? " (end)" : "";
      items.push({
        label: `Move to position ${to + 1}${where}`,
        action: () => setLocations(moved(locations, index, to)),
      });
    }
    setMenu({
      at: { x: e.clientX, y: e.clientY },
      title: `Waypoint ${index + 1}`,
      items,
    });
  }

  const waypoint =
    popup?.kind === "waypoint" ? locations[popup.index] : undefined;
  const waypointAt = waypoint && positionOf(waypoint);
  const factorLine =
    popup?.kind === "factor" ? lines.find((l) => l.i === popup.i) : undefined;
  const shownError = error ?? traces.error ?? parseError;
  const shownStatus = status();

  return (
    <div className="flex h-screen">
      <aside className="caption flex w-[420px] flex-none flex-col border-r border-line bg-surface">
        <ServerPicker
          servers={servers}
          onError={setError}
          onSelect={(server) =>
            locations.filter(positionOf).length >= 2 && send(request, server)
          }
        />

        <TextArea
          mono
          aria-label="Request"
          className="mx-3 mt-3 h-[150px] w-auto flex-none resize-y px-3 py-2"
          spellCheck={false}
          placeholder="The /route request JSON…"
          value={text}
          onChange={(e) => typed(e.target.value)}
          onBlur={() => edited.current && request && send()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <div className="mx-3 mt-3 flex flex-none items-center gap-2">
          <Button variant="primary" title="Ctrl+Enter" onClick={() => send()}>
            Send
          </Button>
          <Button onClick={() => setLocations([])}>Clear points</Button>
          <CommitInput
            mono
            className="min-w-0 flex-1"
            list="costings"
            aria-label="costing"
            placeholder="costing"
            title="costing"
            spellCheck={false}
            value={costing}
            onCommit={setCosting}
          />
          <datalist id="costings">
            {COSTINGS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>
        <p className="mx-3 mt-2 mb-0 text-ink-muted">
          Click the map to append a waypoint, right-click to insert one
          elsewhere. Drag a waypoint to move it, hold it to set its own options,
          right-click it to delete or reorder it.
        </p>
        {shownError && (
          <p role="alert" className="mx-3 mt-2 mb-0 text-danger">
            {shownError}
          </p>
        )}
        {shownStatus && (
          <p
            role="status"
            className="mx-3 mt-2 mb-0 font-mono text-ink-muted tabular-nums"
          >
            {shownStatus}
          </p>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-line">
          <details className="border-b border-line">
            <summary className="label cursor-pointer px-3 py-2">
              Location options{" "}
              <small className="font-medium text-ink-muted">
                — set on every location
              </small>
            </summary>
            <OptionFields
              options={ROUTE_OPTIONS}
              valueOf={(option) =>
                optionState(
                  locations.length ? locations : [template],
                  option.path,
                )
              }
              onChange={setOption}
            />
          </details>
          <details className="border-b border-line">
            <summary className="label cursor-pointer px-3 py-2">
              Costing options{" "}
              <small className="font-medium text-ink-muted">
                {costing ? `— of ${costing}` : "— set a costing first"}
              </small>
            </summary>
            {costing && (
              <OptionFields
                key={costing}
                options={costingOptions(costing)}
                valueOf={(option) =>
                  optionState([costingOptionsOf(request, costing)], option.path)
                }
                onChange={setCostingOption}
              />
            )}
          </details>
          {result && (
            <ResultPanel
              result={result}
              routeIdx={routeIdx}
              onRouteIdx={(idx) => {
                setRouteIdx(idx);
                setHighlighted(null);
                closeInspect();
              }}
              view={view}
              onView={(next) => {
                setView(next);
                setHighlighted(null);
                closeInspect();
              }}
              filters={filters}
              onOpenFilters={() => setFiltersOpen(true)}
              steps={steps}
              edges={edges}
              themes={themes}
              onThemes={setThemes}
              traceRequest={traceRequestText}
              highlighted={highlighted}
              onHover={setHighlighted}
              onFocus={(c) =>
                map && fitTo(map, c, { padding: 120, maxZoom: 17 })
              }
            />
          )}
        </div>

        <SavedViews />
      </aside>

      <MapView
        className="flex-1"
        options={{ center: [10, 50], zoom: 3, dragRotate: false }}
        onLoad={(loaded) => {
          if (!initial.shared || !request) return;
          fitToPoints(request, loaded, true);
          if (locations.filter(positionOf).length >= 2)
            send(request, servers.selected, loaded);
        }}
      >
        <Controls />
        <MapEvents
          onClick={onMapClick}
          onContextMenu={onMapContextMenu}
          onMoveStart={() => setMenu(null)}
        />
        <HoverCursor enabled={!drawMode} />
        <InputLayers
          locations={locations}
          rings={rings}
          lines={lines}
          colors={colors}
          onMoveLocation={moveLocation}
          onLocationMenu={openWaypointMenu}
          onEditLocation={(index) => setPopup({ kind: "waypoint", index })}
          onFactor={(i, at) => setPopup({ kind: "factor", i, at })}
        />
        {route && view === "steps" && (
          <StepsLayers
            alternatives={alternatives}
            steps={steps}
            coords={coords}
            waypoints={result?.data.waypoints}
            highlighted={highlighted}
            colors={colors}
            onHover={setHighlighted}
            onInspect={(title, object, at) =>
              setPopup({ kind: "inspect", title, object, at })
            }
          />
        )}
        {edges && view === "edges" && (
          <EdgesLayers
            edges={edges.themed.edges}
            settings={themes}
            highlighted={highlighted}
            colors={colors}
            onHover={setHighlighted}
          />
        )}
        <DrawTools
          mode={drawMode}
          onMode={setDrawMode}
          hasPolygons={rings.length > 0}
          onDeletePolygons={() => edit((req) => withoutExclusion(req))}
          colors={colors}
          onFinish={drawn}
        />
        {popup?.kind === "inspect" && (
          <InspectPopup
            title={popup.title}
            object={popup.object}
            position={popup.at}
            onClose={() => setPopup(null)}
          />
        )}
        {popup?.kind === "factor" && factorLine && (
          <FactorPopup
            factor={factorLine.factor}
            position={popup.at}
            onFactor={(factor) =>
              edit((req) => withFactor(req, popup.i, factor))
            }
            onDelete={() => {
              setPopup(null);
              edit((req) => withoutCostLine(req, popup.i));
            }}
            onClose={() => setPopup(null)}
          />
        )}
        {popup?.kind === "waypoint" && waypoint && waypointAt && (
          <WaypointPopup
            index={popup.index}
            location={waypoint}
            position={waypointAt}
            onOption={(option, raw) =>
              setWaypointOption(popup.index, option, raw)
            }
            onClose={() => setPopup(null)}
          />
        )}
      </MapView>

      {menu && (
        <Menu
          at={menu.at}
          title={menu.title}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      {filtersOpen && (
        <FilterDialog
          filters={filters}
          onApply={setFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}
