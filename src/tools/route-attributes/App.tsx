import type { Position } from "geojson";
import type { MapMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "../../shared/format";
import { useStoredState } from "../../shared/hooks/useStoredState";
import { useLoadedMap, useMap } from "../../shared/map/context";
import { Controls } from "../../shared/map/Controls";
import { fitTo } from "../../shared/map/fit";
import { fc, line } from "../../shared/map/geo";
import { useGeoJSONSource, useLayer } from "../../shared/map/hooks";
import { InspectPopup } from "../../shared/map/InspectPopup";
import { MapEvents } from "../../shared/map/MapEvents";
import { MapView } from "../../shared/map/MapView";
import { useThemeColors, type ThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";
import { CopyButton } from "../../shared/ui/CopyButton";
import { Select, TextArea } from "../../shared/ui/Input";
import { Stats } from "../../shared/ui/Stats";
import { isObject, pretty, type Json } from "../../shared/valhalla/request";
import { ServerPicker } from "../../shared/valhalla/ServerPicker";
import { useServers } from "../../shared/valhalla/servers";
import { parseResponse, type Response } from "../route-comparison/response";
import {
  FILTERS_KEY,
  parseFilters,
  traceRequest,
} from "../route-playground/api";
import { EdgeList } from "../route-playground/EdgeList";
import { routeEdges } from "../route-playground/edges";
import { EdgesLayers } from "../route-playground/EdgesLayers";
import { FilterDialog } from "../route-playground/FilterDialog";
import { EdgeStats, unitOf } from "../route-playground/ResultPanel";
import { ThemeControls } from "../route-playground/ThemeControls";
import { DEFAULT_THEMES, themeEdges } from "../route-playground/themes";
import { useTraces } from "../route-playground/useTraces";
import { Histograms } from "./Histograms";

const DEFAULT_REQUEST = { costing: "auto" };
const INSPECTABLE = ["nodes", "edges"];
export const HISTOGRAMS_KEY = "valhalla-browser-tools:histograms";

/** The attributes to plot; density until something else is picked. */
function parseHistograms(raw: unknown) {
  return Array.isArray(raw) && raw.every((key) => typeof key === "string")
    ? raw
    : ["density"];
}

type View = "edges" | "histograms";

/** What is traced: a pasted response, with the request its trace takes from. */
type Traced = { response: Response; sent: Json };
type Inspected = { title: string; object: Json; at: Position };

/** The traced route, under its edges, to show where map matching strays. */
function RouteLayer({
  coords,
  colors,
}: {
  coords: Position[];
  colors: ThemeColors;
}) {
  useGeoJSONSource(
    "route",
    useMemo(() => fc(coords.length > 1 ? [line(coords)] : []), [coords]),
  );
  useLayer({
    id: "route",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": colors["ink-subtle"],
      "line-width": 3,
      "line-dasharray": [2, 2],
    },
  });
  return null;
}

/** The edges of the bin under the pointer, on top of the others. */
function BinLayer({ edges, colors }: { edges: number[]; colors: ThemeColors }) {
  useLayer({
    id: "bin-edges",
    type: "line",
    source: "edges",
    layout: { "line-cap": "round", "line-join": "round" },
    filter: ["in", ["get", "idx"], ["literal", edges]],
    paint: {
      "line-color": colors.magenta,
      "line-width": 9,
      "line-opacity": 0.8,
    },
  });
  return null;
}

function HoverCursor() {
  const map = useLoadedMap();
  useEffect(() => {
    const canvas = map.getCanvas();
    const subscriptions = INSPECTABLE.flatMap((layer) => [
      map.on("mouseenter", layer, () => (canvas.style.cursor = "pointer")),
      map.on("mouseleave", layer, () => (canvas.style.cursor = "")),
    ]);
    return () => subscriptions.forEach((s) => s.unsubscribe());
  }, [map]);
  return null;
}

export function App() {
  const map = useMap();
  const colors = useThemeColors();
  const servers = useServers();

  const [text, setText] = useState("");
  const [requestText, setRequestText] = useState(pretty(DEFAULT_REQUEST));
  const [error, setError] = useState<string | null>(null);
  const [traced, setTraced] = useState<Traced | null>(null);
  const [routeIdx, setRouteIdx] = useState(0);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [themes, setThemes] = useState(DEFAULT_THEMES);
  const [filters, setFilters] = useStoredState(FILTERS_KEY, parseFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [view, setView] = useState<View>("edges");
  const [plotted, setPlotted] = useStoredState(HISTOGRAMS_KEY, parseHistograms);
  const [binEdges, setBinEdges] = useState<number[] | null>(null);

  const routes = traced?.response.routes ?? [];
  const route = routes[routeIdx] ?? null;
  const traceKey = useMemo(
    () => traced && { sent: traced.sent, filters, routeIdx },
    [traced, filters, routeIdx],
  );
  const traces = useTraces(
    servers.selected,
    traceKey,
    useMemo(() => route?.legShapes ?? [], [route]),
    true,
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
      traced && route
        ? pretty(traceRequest(route.coords, "edge_walk", traced.sent, filters))
        : "",
    [traced, route, filters],
  );
  // one response per leg, or just that one
  const traceResponse = useMemo(() => {
    const paths = edges?.legs.map((leg) => leg.path) ?? [];
    return pretty(paths.length > 1 ? paths : paths[0]);
  }, [edges?.legs]);

  function status() {
    if (!traced) return "";
    if (traces.loading) return "Requesting trace_attributes…";
    if (!traces.legs) return "";
    const snapped = traces.legs.flatMap((leg, i) => (leg.snapped ? [i] : []));
    const count = traces.legs.length;
    const legs = `${count} ${count > 1 ? "legs" : "leg"} traced`;
    return snapped.length
      ? `${legs} · edge_walk failed for leg ${snapped.join(", ")}: its edges are map-matched`
      : legs;
  }

  /** Traces the pasted response; a new trace each time, e.g. on another server. */
  function trace() {
    let response: Response;
    let sent: unknown;
    try {
      response = parseResponse(JSON.parse(text));
    } catch (e) {
      return setError(
        e instanceof SyntaxError
          ? `The response is not valid JSON: ${e.message}`
          : (e as Error).message,
      );
    }
    try {
      sent = requestText.trim() ? JSON.parse(requestText) : {};
    } catch (e) {
      return setError(`The request is not valid JSON: ${(e as Error).message}`);
    }
    if (!isObject(sent)) return setError("The request is a JSON object.");
    setError(null);
    setTraced({ response, sent });
    setRouteIdx(0);
    setHighlighted(null);
    setInspected(null);
    if (map)
      fitTo(map, response.routes[0]!.coords, { padding: 80, duration: 0 });
  }

  function onMapClick(e: MapMouseEvent) {
    if (!map) return;
    if (inspected) return setInspected(null);
    const present = INSPECTABLE.filter((id) => map.getLayer(id));
    const [feature] = present.length
      ? map.queryRenderedFeatures(e.point, { layers: present })
      : [];
    if (!feature) return;
    const { idx = -1 } = feature.properties as { idx?: number };
    const edge = edges?.themed.edges[idx];
    if (!edge) return;
    if (feature.layer.id === "nodes")
      return (
        edge.node &&
        setInspected({
          title: `edge ${idx} · end_node`,
          object: edge.node,
          at: edge.coords.at(-1)!,
        })
      );
    const { end_node: _, ...attributes } = edge.edge;
    setInspected({
      title: `edge ${idx}`,
      object: attributes,
      at: [e.lngLat.lng, e.lngLat.lat],
    });
  }

  const shownError = error ?? traces.error;
  const shownStatus = status();

  return (
    <div className="flex h-screen">
      <aside className="caption flex w-[420px] flex-none flex-col border-r border-line bg-surface">
        <ServerPicker
          servers={servers}
          onError={setError}
          onSelect={() => traced && trace()}
        />

        <TextArea
          mono
          aria-label="Response"
          className="mx-3 mt-3 h-[150px] w-auto flex-none resize-y px-3 py-2"
          spellCheck={false}
          placeholder="Paste a /route response, in Valhalla's or OSRM's format…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) trace();
          }}
        />
        <TextArea
          mono
          aria-label="Request"
          className="mx-3 mt-2 h-[72px] w-auto flex-none resize-y px-3 py-2"
          spellCheck={false}
          placeholder='{ "costing": "auto" }'
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) trace();
          }}
        />
        <div className="mx-3 mt-3 flex flex-none items-center gap-2">
          <Button variant="primary" title="Ctrl+Enter" onClick={trace}>
            Trace
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            title="Which attributes the trace_attributes requests ask for"
            onClick={() => setFiltersOpen(true)}
          >
            {filters
              ? `Attribute filter: ${filters.action} ${filters.attributes.length}…`
              : "Attribute filter…"}
          </Button>
        </div>
        <p className="mx-3 mt-2 mb-0 text-ink-muted">
          Each leg of the route is traced with trace_attributes, edge walking
          its shape. The costing, costing_options and date_time of the request
          go along: paste the /route request the response is for, or just its
          costing.
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
          {routes.length > 1 && (
            <Select
              aria-label="Route"
              className="mx-3 mt-3 block w-[calc(100%-24px)]"
              value={routeIdx}
              onChange={(e) => {
                setRouteIdx(Number(e.target.value));
                setHighlighted(null);
                setInspected(null);
              }}
            >
              {routes.map((r, i) => (
                <option key={i} value={i}>
                  Route {i} · {r.costName} {fmt(r.cost)}
                </option>
              ))}
            </Select>
          )}
          {edges && (
            <>
              <Stats className="mx-3 mt-3">
                <EdgeStats legs={edges.legs} />
              </Stats>
              <div className="m-3 flex flex-wrap items-center gap-2 text-ink-muted">
                Copy
                <CopyButton
                  size="sm"
                  title="A trace_attributes request that edge-walks the shape of this route"
                  text={traceRequestText}
                >
                  trace_attributes
                </CopyButton>
                <CopyButton
                  size="sm"
                  title="The trace_attributes response shown; one per leg when the route has several"
                  text={traceResponse}
                >
                  trace_attributes response
                </CopyButton>
              </div>
              <div className="label mx-3 mb-3 flex items-center gap-4">
                {(
                  [
                    ["edges", "Edges", "The edges with their attributes"],
                    [
                      "histograms",
                      "Histograms",
                      "How much of the distance has which value of a numeric attribute",
                    ],
                  ] as const
                ).map(([value, label, title]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-1"
                    title={title}
                  >
                    <input
                      type="radio"
                      name="view"
                      className="m-0 accent-green"
                      checked={view === value}
                      onChange={() => {
                        setView(value);
                        setHighlighted(null);
                        setBinEdges(null);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {view === "histograms" ? (
                <Histograms
                  edges={edges.themed.edges}
                  keys={plotted}
                  onKeys={setPlotted}
                  unit={unitOf(edges.legs).trim() || "km"}
                  onHover={setBinEdges}
                />
              ) : (
                <>
                  <ThemeControls
                    settings={themes}
                    onChange={setThemes}
                    {...edges.themed}
                  />
                  <EdgeList
                    edges={edges.themed.edges}
                    legs={edges.legs}
                    edgeTheme={edges.themed.edgeTheme}
                    nodeTheme={edges.themed.nodeTheme}
                    unit={unitOf(edges.legs)}
                    highlighted={highlighted}
                    onHover={setHighlighted}
                    onFocus={(c) =>
                      map && fitTo(map, c, { padding: 120, maxZoom: 17 })
                    }
                  />
                </>
              )}
            </>
          )}
        </div>
      </aside>

      <MapView
        className="flex-1"
        options={{ center: [10, 50], zoom: 3, dragRotate: false }}
      >
        <Controls />
        <MapEvents onClick={onMapClick} />
        <HoverCursor />
        {route && <RouteLayer coords={route.coords} colors={colors} />}
        {edges && (
          <EdgesLayers
            edges={edges.themed.edges}
            settings={themes}
            highlighted={highlighted}
            colors={colors}
            onHover={setHighlighted}
          />
        )}
        {edges && binEdges && <BinLayer edges={binEdges} colors={colors} />}
        {inspected && (
          <InspectPopup
            title={inspected.title}
            object={inspected.object}
            position={inspected.at}
            onClose={() => setInspected(null)}
          />
        )}
      </MapView>

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
