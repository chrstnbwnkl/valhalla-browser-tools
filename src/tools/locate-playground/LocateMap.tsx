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
import { Popup } from "../../shared/map/Popup";
import type { ThemeColors } from "../../shared/theme/colors";
import { OptionFields } from "./OptionFields";
import { positionOf, type Location, type Option } from "./request";
import { seriesColor, type Results } from "./results";

const EMPTY = fc([]);
const ROUND = { "line-cap": "round", "line-join": "round" } as const;
const COLOR: ["get", string] = ["get", "color"];
const MARKER_CLASS = "input-marker";

type Props = {
  locations: Location[];
  results: Results | null;
  highlighted: number | null;
  showCircles: boolean;
  colors: ThemeColors;
  onClick: (lngLat: LngLat) => void;
  onContextMenu: (lngLat: LngLat) => void;
  onMoveLocation: (index: number, lngLat: LngLat) => void;
  onRemoveLocation: (index: number) => void;
  /** The location whose options popup is open. */
  editing: number | null;
  onEdit: (index: number | null) => void;
  onLocationOption: (index: number, option: Option, raw: string) => void;
  onHover: (idx: number | null) => void;
};

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
  editing,
  onEdit,
  onLocationOption,
  onHover,
}: Props) {
  const map = useLoadedMap();
  useControl(() => new NavigationControl({ showCompass: false }), "top-right");
  useControl(() => new ScaleControl());
  useEffect(() => {
    map.getCanvas().style.cursor = "crosshair";
  }, [map]);

  const radii = useMemo(
    () =>
      fc(
        locations.flatMap((location, i) => {
          const at = positionOf(location);
          const { radius } = location;
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
    // clicks on markers reach the map too
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

  const edited = editing === null ? null : locations[editing];
  const editedAt = edited && positionOf(edited);

  const markers = locations.map((location, i) => {
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
        onLongPress={() => onEdit(i)}
      >
        <div
          className={`${MARKER_CLASS} size-[22px] cursor-grab rounded-full border-3 bg-surface text-center font-mono text-[11px]/4 font-bold text-ink`}
          style={{ borderColor: seriesColor(colors, i) }}
          title="Drag to move, hold for its options, right-click to remove"
        >
          {i + 1}
        </div>
      </Marker>
    );
  });

  return (
    <>
      {markers}
      {editing !== null && edited && editedAt && (
        <Popup lngLat={editedAt} onClose={() => onEdit(null)}>
          <div
            role="dialog"
            aria-label={`Location ${editing + 1} options`}
            className="caption max-h-[60vh] w-[360px] overflow-y-auto"
          >
            <div className="label px-3 pt-2 pr-8">Location {editing + 1}</div>
            <OptionFields
              locations={[edited]}
              onChange={(option, raw) => onLocationOption(editing, option, raw)}
            />
          </div>
        </Popup>
      )}
    </>
  );
}
