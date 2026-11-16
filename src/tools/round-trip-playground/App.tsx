import type { LngLat, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import { copyText } from "../../shared/clipboard";
import { readUrlParam, useUrlParam } from "../../shared/hooks/urlParam";
import { useMap } from "../../shared/map/context";
import { Controls } from "../../shared/map/Controls";
import { fitTo } from "../../shared/map/fit";
import { InspectPopup } from "../../shared/map/InspectPopup";
import { MapEvents } from "../../shared/map/MapEvents";
import { MapView } from "../../shared/map/MapView";
import { OsmLink } from "../../shared/map/OsmLink";
import { useThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";
import { CommitInput, TextArea } from "../../shared/ui/Input";
import { Menu, type MenuItem } from "../../shared/ui/Menu";
import { Toggle } from "../../shared/ui/Toggle";
import { OptionFields } from "../../shared/valhalla/OptionFields";
import { flattenSteps, routeCoords } from "../../shared/valhalla/osrm";
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
import { FORMAT, fetchRoute, type RouteResult } from "../route-playground/api";
import { costingOptions } from "../route-playground/costing";
import {
  costingOptionsOf,
  withCostingOption,
} from "../route-playground/request";
import { StepsLayers } from "../route-playground/StepsLayers";
import {
  ROUND_TRIP_COSTINGS,
  ROUND_TRIP_FIELDS,
  START_OPTIONS,
  bearing,
  fieldOf,
  seedsOf,
  withField,
} from "./request";
import { ResultPanel } from "./ResultPanel";
import { RoundTripLayers, START_MARKER } from "./RoundTripLayers";
import { SeedLayers } from "./SeedMarkers";

// the parameter Valhalla itself accepts on GET requests
export const URL_PARAM = "json";
export const ENDPOINT = "round_trip";
const DEFAULT_REQUEST = {
  locations: [],
  costing: "bicycle",
  round_trip_options: { distance: 20000 },
  // only verbose responses have the turning points
  verbose: true,
  format: FORMAT,
};

function initialText() {
  const shared = readUrlParam(URL_PARAM);
  if (shared === null) return { text: pretty(DEFAULT_REQUEST), shared: false };
  try {
    return { text: pretty(JSON.parse(shared)), shared: true };
  } catch {
    return { text: shared, shared: true };
  }
}

type Inspected = { title: string; object: Json; at: [number, number] };
type MenuState = {
  at: { x: number; y: number };
  title: string;
  items: MenuItem[];
};

const startOf = (request: Request | null) => locationsOf(request)[0] ?? null;

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
  const start = useMemo(() => startOf(request), [request]);
  const startAt = start && positionOf(start);
  const costing = typeof request?.costing === "string" ? request.costing : "";
  // the options the start gets when it is placed anew
  const [template, setTemplate] = useState<Location>({});

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [routeIdx, setRouteIdx] = useState(0);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // the JSON was typed into since the last send
  const edited = useRef(false);
  const pending = useRef<AbortController | null>(null);

  useUrlParam(URL_PARAM, request && JSON.stringify(request));

  const route = result?.data.routes[routeIdx] ?? null;
  const first = result?.data.waypoints?.[0]?.location;
  const steps = useMemo(() => (route ? flattenSteps(route) : []), [route]);
  const seeds = useMemo(() => seedsOf(route), [route]);
  const coords = useMemo(
    () => (route ? routeCoords(route, first) : []),
    [route, first],
  );
  const alternatives = useMemo(
    () =>
      (result?.data.routes ?? [])
        .filter((_, i) => i !== routeIdx)
        .map((r) => routeCoords(r, first)),
    [result, routeIdx, first],
  );

  const write = (next: Request) => setText(pretty(next));

  function clearResults() {
    pending.current?.abort();
    setResult(null);
    setNotice(null);
    setHighlighted(null);
    setInspected(null);
  }

  function fitToStart(req: Request, on: MapLibreMap | null, always = false) {
    const at = positionOf(startOf(req) ?? {});
    if (!on || !at) return;
    if (!always && on.getBounds().contains(at)) return;
    on.jumpTo({ center: at, zoom: Math.max(on.getZoom(), 11) });
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
    fitToStart(req, on);

    const sent = { ...req, format: FORMAT };
    const started = performance.now();
    fetchRoute(server, sent, controller.signal, ENDPOINT).then(
      (data) => {
        if (controller.signal.aborted) return;
        const count = data.routes.length;
        const ms = Math.round(performance.now() - started);
        setResult({
          data,
          sent,
          status: `${count} ${count > 1 ? "round trips" : "round trip"} · ${ms} ms`,
        });
        setNotice(null);
        setRouteIdx(0);
        setHighlighted(null);
        setInspected(null);
        const all = data.routes.flatMap((r) =>
          routeCoords(r, data.waypoints?.[0]?.location),
        );
        if (on && all.length)
          fitTo(on, all, { padding: 80, maxZoom: 16, duration: 0 });
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

  /** Writes a request edited through the UI and sends it, once it has a start. */
  function change(next: Request) {
    write(next);
    if (positionOf(startOf(next) ?? {})) send(next);
    else clearResults();
  }

  function edit(apply: (req: Request) => Request) {
    const req = editable();
    if (req) change(apply(req));
  }

  function typed(value: string) {
    setText(value);
    setError(null);
    edited.current = true;
  }

  const setStart = (lngLat: LngLat) =>
    edit((req) => ({
      ...req,
      locations: [
        newLocation(lngLat, start ? withoutPosition(start) : template),
      ],
    }));

  function moveStart({ lng, lat }: LngLat) {
    edit((req) => ({
      ...req,
      locations: [{ ...start, lat: +lat.toFixed(6), lon: +lng.toFixed(6) }],
    }));
  }

  function clearStart() {
    setEditing(false);
    edit((req) => ({ ...req, locations: [] }));
  }

  function setStartOption(option: Option, raw: string) {
    const value = optionValue(option, raw);
    setTemplate(withOption(template, option.path, value));
    edit((req) =>
      start
        ? { ...req, locations: [withOption(start, option.path, value)] }
        : req,
    );
  }

  function setField(option: Option, raw: string) {
    edit((req) => withField(req, option.path, optionValue(option, raw)));
  }

  function setCosting(value: string) {
    edit((req) => {
      const { costing: _, ...rest } = req;
      return value.trim() ? { ...req, costing: value.trim() } : rest;
    });
  }

  function setVerbose(verbose: boolean) {
    edit((req) => ({ ...req, verbose }));
  }

  function setCostingOption(option: Option, raw: string) {
    edit((req) =>
      withCostingOption(req, costing, option.path, optionValue(option, raw)),
    );
  }

  function pointHeading(lngLat: LngLat) {
    if (!startAt) return;
    const heading = Math.round(bearing(startAt, [lngLat.lng, lngLat.lat]));
    edit((req) => withField(req, "round_trip_options.heading", heading));
  }

  function onMapClick(e: MapMouseEvent) {
    if (
      (e.originalEvent.target as Element | null)?.closest?.(
        `.${START_MARKER}, .maplibregl-marker`,
      )
    )
      return;
    // with a popup open, a click only closes it
    if (editing) return setEditing(false);
    if (inspected) return setInspected(null);
    const [waypoint] =
      map?.getLayer("waypoints") && map.queryRenderedFeatures
        ? map.queryRenderedFeatures(e.point, { layers: ["waypoints"] })
        : [];
    if (waypoint?.geometry.type === "Point") {
      const i = waypoint.properties.i as number;
      const object = result?.data.waypoints?.[i];
      if (object)
        return setInspected({
          title: `waypoint ${i}`,
          object,
          at: waypoint.geometry.coordinates as [number, number],
        });
    }
    if (editable()) setStart(e.lngLat);
  }

  function onMapContextMenu(e: MapMouseEvent) {
    e.originalEvent.preventDefault();
    if (!editable()) return;
    const wrapped = e.lngLat.wrap();
    const lonLat = `${wrapped.lng.toFixed(6)},${wrapped.lat.toFixed(6)}`;
    const items: MenuItem[] = [
      { label: "Start here", action: () => setStart(e.lngLat) },
    ];
    if (startAt)
      items.push({
        label: `Head this way (${Math.round(bearing(startAt, [e.lngLat.lng, e.lngLat.lat]))}°)`,
        action: () => pointHeading(e.lngLat),
      });
    items.push({
      label: `Copy ${lonLat}`,
      action: () => void copyText(lonLat),
    });
    setMenu({
      at: { x: e.originalEvent.clientX, y: e.originalEvent.clientY },
      title: "Round trip",
      items,
    });
  }

  const shownError = error ?? parseError;
  const shownStatus = notice ?? result?.status ?? "";

  return (
    <div className="flex h-screen">
      <aside className="caption flex w-[420px] flex-none flex-col border-r border-line bg-surface">
        <ServerPicker
          servers={servers}
          onError={setError}
          onSelect={(server) => startAt && send(request, server)}
        />

        <TextArea
          mono
          aria-label="Request"
          className="mx-3 mt-3 h-[170px] w-auto flex-none resize-y px-3 py-2"
          spellCheck={false}
          placeholder="The /round_trip request JSON…"
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
          <Button onClick={clearStart}>Clear start</Button>
          <CommitInput
            mono
            className="min-w-0 flex-1"
            list="round-trip-costings"
            aria-label="costing"
            placeholder="costing"
            title="costing; the multimodal costings have no round trips"
            spellCheck={false}
            value={costing}
            onCommit={setCosting}
          />
          <datalist id="round-trip-costings">
            {ROUND_TRIP_COSTINGS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <Toggle
            className="flex-none"
            title="Only verbose responses have the turning points the server considered"
            checked={request?.verbose === true}
            onChange={(e) => setVerbose(e.target.checked)}
          >
            verbose
          </Toggle>
        </div>
        <p className="mx-3 mt-2 mb-0 text-ink-muted">
          Click the map to set the start, right-click to point the heading
          somewhere. Drag the start to move it, click it to set its own options.
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
          <details open className="border-b border-line">
            <summary className="label cursor-pointer px-3 py-2">
              Round trip options{" "}
              <small className="font-medium text-ink-muted">
                — empty uses the server default
              </small>
            </summary>
            <OptionFields
              options={ROUND_TRIP_FIELDS}
              valueOf={(option) => {
                const value = fieldOf(request, option.path);
                return {
                  value: value === undefined ? "" : JSON.stringify(value),
                  mixed: false,
                };
              }}
              onChange={setField}
            />
          </details>
          <details className="border-b border-line">
            <summary className="label cursor-pointer px-3 py-2">
              Start options
            </summary>
            <OptionFields
              options={START_OPTIONS}
              valueOf={(option) =>
                optionState([start ?? template], option.path)
              }
              onChange={setStartOption}
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
              server={servers.selected}
              routeIdx={routeIdx}
              onRouteIdx={(idx) => {
                setRouteIdx(idx);
                setHighlighted(null);
                setInspected(null);
              }}
              steps={steps}
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
          fitToStart(request, loaded, true);
          if (startAt) send(request, servers.selected, loaded);
        }}
      >
        <Controls />
        <OsmLink />
        <MapEvents
          onClick={onMapClick}
          onContextMenu={onMapContextMenu}
          onMoveStart={() => setMenu(null)}
        />
        <RoundTripLayers
          start={start}
          at={startAt}
          colors={colors}
          editing={editing}
          onEdit={setEditing}
          onMove={moveStart}
          onOption={setStartOption}
        />
        {route && (
          <StepsLayers
            alternatives={alternatives}
            steps={steps}
            coords={coords}
            waypoints={result?.data.waypoints}
            highlighted={highlighted}
            colors={colors}
            costLabels={false}
            onHover={setHighlighted}
            onInspect={(title, object, at) =>
              setInspected({ title, object, at: at as [number, number] })
            }
          />
        )}
        {/* after the route, so the turning points are drawn over it */}
        {result && <SeedLayers seeds={seeds} colors={colors} />}
        {inspected && (
          <InspectPopup
            title={inspected.title}
            object={inspected.object}
            position={inspected.at}
            onClose={() => setInspected(null)}
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
    </div>
  );
}

/** The options of a location, without where it is. */
function withoutPosition({ lat: _, lon: __, ...options }: Location) {
  return options;
}
