import type { LngLat, MapLayerMouseEvent } from "maplibre-gl";
import { NavigationControl, ScaleControl } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { arrowImage } from "../../shared/map/arrow";
import { useLoadedMap } from "../../shared/map/context";
import { circle, fc } from "../../shared/map/geo";
import {
  useControl,
  useGeoJSONSource,
  useLayer,
  useLayerEvent,
  useMapEvent,
  useMapImage,
  type Filter,
} from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import { positionOf } from "./request";
import { seriesColor, type Results } from "./results";

const EMPTY = fc([]);
const ROUND = { "line-cap": "round", "line-join": "round" } as const;
const COLOR: ["get", string] = ["get", "color"];
const MARKER_CLASS = "input-marker";

type Props = {
  /** The request's locations, as they are. */
  locations: unknown[];
  results: Results | null;
  highlighted: number | null;
  showCircles: boolean;
  colors: ThemeColors;
  onClick: (lngLat: LngLat) => void;
  onContextMenu: (lngLat: LngLat) => void;
  onMoveLocation: (index: number, lngLat: LngLat) => void;
  onRemoveLocation: (index: number) => void;
  onHover: (idx: number | null) => void;
};

/** What the locate playground draws on the map, and what it does with clicks on it. */
export function LocateMap({
  locations,
  results,
  highlighted,
  showCircles,
  colors,
  onClick,
  onContextMenu,
  onMoveLocation,
  onRemoveLocation,
  onHover,
}: Props) {
  const map = useLoadedMap();
  useControl(() => new NavigationControl({ showCompass: false }), "top-right");
  useControl(() => new ScaleControl());
  useEffect(() => {
    map.getCanvas().style.cursor = "crosshair";
  }, [map]);

  // the search radii of the input points, straight from the request
  const radii = useMemo(
    () =>
      fc(
        locations.flatMap((location, i) => {
          const at = positionOf(location);
          const radius = (location as { radius?: unknown }).radius;
          return at && typeof radius === "number" && radius > 0
            ? [circle(at, radius, { color: seriesColor(colors, i) })]
            : [];
        }),
      ),
    [locations, colors],
  );
  const edges = useMemo(() => (results ? fc(results.edges) : EMPTY), [results]);
  const circles = useMemo(
    () => (results ? fc(results.circles) : EMPTY),
    [results],
  );
  const snaps = useMemo(() => (results ? fc(results.snaps) : EMPTY), [results]);
  const points = useMemo(
    () => (results ? fc(results.points) : EMPTY),
    [results],
  );

  useGeoJSONSource("radius", radii);
  useGeoJSONSource("circles", circles);
  useGeoJSONSource("snaps", snaps);
  useGeoJSONSource("edges", edges);
  useGeoJSONSource("points", points);
  useMapImage(
    "arrow",
    useMemo(() => arrowImage(40, colors.ink, colors.surface), [colors]),
  );

  const active: Filter = ["==", ["get", "idx"], highlighted ?? -1];
  const circlesVisibility = showCircles ? "visible" : "none";
  useLayer({
    id: "radius-fill",
    type: "fill",
    source: "radius",
    paint: { "fill-color": COLOR, "fill-opacity": 0.08 },
  });
  useLayer({
    id: "radius",
    type: "line",
    source: "radius",
    paint: { "line-color": COLOR, "line-width": 1.5, "line-dasharray": [3, 2] },
  });
  // only ever the bounding circle of the highlighted edge
  useLayer({
    id: "circles-fill",
    type: "fill",
    source: "circles",
    filter: active,
    layout: { visibility: circlesVisibility },
    paint: { "fill-color": colors.magenta, "fill-opacity": 0.12 },
  });
  useLayer({
    id: "circles",
    type: "line",
    source: "circles",
    filter: active,
    layout: { visibility: circlesVisibility },
    paint: { "line-color": colors.magenta, "line-width": 1.5 },
  });
  useLayer({
    id: "edges-casing",
    type: "line",
    source: "edges",
    layout: ROUND,
    paint: { "line-color": colors.surface, "line-width": 9 },
  });
  useLayer({
    id: "edges",
    type: "line",
    source: "edges",
    layout: ROUND,
    paint: { "line-color": COLOR, "line-width": 5 },
  });
  useLayer({
    id: "edges-active",
    type: "line",
    source: "edges",
    layout: ROUND,
    filter: active,
    paint: {
      "line-color": colors.magenta,
      "line-width": 9,
      "line-opacity": 0.8,
    },
  });
  // the travel direction of the highlighted edge: a reverse edge runs against its shape
  useLayer({
    id: "edges-arrows",
    type: "symbol",
    source: "edges",
    filter: active,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 40,
      "icon-image": "arrow",
      "icon-rotate": ["case", ["get", "reverse"], 180, 0],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  useLayer({
    id: "snaps",
    type: "line",
    source: "snaps",
    paint: { "line-color": COLOR, "line-width": 1.5, "line-dasharray": [2, 2] },
  });
  useLayer({
    id: "points-active",
    type: "circle",
    source: "points",
    filter: active,
    paint: {
      "circle-color": colors.magenta,
      "circle-radius": 11,
      "circle-opacity": 0.8,
    },
  });
  // correlated points on edges are hollow, nodes are filled
  useLayer({
    id: "points",
    type: "circle",
    source: "points",
    paint: {
      "circle-radius": 5,
      "circle-color": ["get", "fill"],
      "circle-stroke-width": 2,
      "circle-stroke-color": ["get", "stroke"],
    },
  });

  const hover = (e: MapLayerMouseEvent) =>
    onHover((e.features?.[0]?.properties.idx as number | undefined) ?? null);
  useLayerEvent("mousemove", "edges", hover);
  useLayerEvent("mousemove", "points", hover);
  useLayerEvent("mouseleave", "edges", () => onHover(null));
  useLayerEvent("mouseleave", "points", () => onHover(null));

  useMapEvent("click", (e) => {
    // a click on a marker reaches the map too
    if (
      (e.originalEvent.target as Element | null)?.closest?.(`.${MARKER_CLASS}`)
    )
      return;
    onClick(e.lngLat);
  });
  useMapEvent("contextmenu", (e) => {
    e.originalEvent.preventDefault();
    onContextMenu(e.lngLat);
  });

  return locations.map((location, i) => {
    const at = positionOf(location);
    if (!at) return null;
    return (
      <Marker
        key={i}
        lngLat={at}
        draggable
        onDragEnd={(lngLat) => onMoveLocation(i, lngLat)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation(); // or the map adds a point here
          onRemoveLocation(i);
        }}
      >
        <div
          className={`${MARKER_CLASS} size-[22px] cursor-grab rounded-full border-3 bg-surface text-center font-mono text-[11px]/4 font-bold text-ink`}
          style={{ borderColor: seriesColor(colors, i) }}
          title="Drag to move, right-click to remove"
        >
          {i + 1}
        </div>
      </Marker>
    );
  });
}
