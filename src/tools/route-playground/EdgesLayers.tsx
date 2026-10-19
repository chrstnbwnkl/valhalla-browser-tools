import { useMemo } from "react";
import { cn } from "../../shared/cn";
import { fc, line, midpoint, point } from "../../shared/map/geo";
import {
  useGeoJSONSource,
  useLayer,
  useLayerEvent,
  type Filter,
} from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import { TAG } from "./labels";
import type { ThemeSettings, ThemedEdge } from "./themes";

const ROUND = { "line-cap": "round", "line-join": "round" } as const;
// labels let clicks through to the features underneath
const LABEL = cn(TAG, "pointer-events-none max-w-[160px] truncate border-2");

type Props = {
  edges: ThemedEdge[];
  settings: ThemeSettings;
  highlighted: number | null;
  colors: ThemeColors;
  onHover: (idx: number | null) => void;
};

export function EdgesLayers({
  edges,
  settings,
  highlighted,
  colors,
  onHover,
}: Props) {
  useGeoJSONSource(
    "edges",
    useMemo(
      () =>
        fc(
          edges
            .filter((e) => e.coords.length > 1)
            .map((e) => line(e.coords, { idx: e.idx, color: e.color })),
        ),
      [edges],
    ),
  );
  useGeoJSONSource(
    "nodes",
    useMemo(
      () =>
        fc(
          edges
            .filter((e) => e.node && e.coords.length)
            .map((e) =>
              point(e.coords.at(-1)!, { idx: e.idx, color: e.nodeColor }),
            ),
        ),
      [edges],
    ),
  );

  const edgeVisibility = settings.showEdges ? "visible" : "none";
  const active: Filter = ["==", ["get", "idx"], highlighted ?? -1];
  // a dark casing, so the soft end of a ramp still reads on the basemap
  useLayer({
    id: "edges-casing",
    type: "line",
    source: "edges",
    layout: { ...ROUND, visibility: edgeVisibility },
    paint: { "line-color": colors["ink-muted"], "line-width": 8 },
  });
  useLayer({
    id: "edges",
    type: "line",
    source: "edges",
    layout: { ...ROUND, visibility: edgeVisibility },
    paint: { "line-color": ["get", "color"], "line-width": 5 },
  });
  useLayer({
    id: "edges-active",
    type: "line",
    source: "edges",
    layout: { ...ROUND, visibility: edgeVisibility },
    filter: active,
    paint: {
      "line-color": colors.magenta,
      "line-width": 11,
      "line-opacity": 0.8,
    },
  });
  useLayer({
    id: "nodes",
    type: "circle",
    source: "nodes",
    layout: { visibility: settings.showNodes ? "visible" : "none" },
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.ink,
    },
  });

  useLayerEvent("mousemove", "edges", (e) =>
    onHover((e.features?.[0]?.properties.idx as number | undefined) ?? null),
  );
  useLayerEvent("mouseleave", "edges", () => onHover(null));

  return edges.flatMap((e) => [
    settings.showEdges &&
      settings.labelEdges &&
      e.label &&
      e.coords.length > 1 && (
        <Marker
          key={`edge:${e.idx}`}
          lngLat={midpoint(e.coords) as [number, number]}
        >
          <div className={LABEL} style={{ borderColor: e.color }}>
            {e.label}
          </div>
        </Marker>
      ),
    settings.showNodes &&
      settings.labelNodes &&
      e.node &&
      e.nodeLabel &&
      e.coords.length > 0 && (
        <Marker
          key={`node:${e.idx}`}
          lngLat={e.coords.at(-1) as [number, number]}
          anchor="left"
          offset={[10, 0]}
        >
          <div className={LABEL} style={{ borderColor: e.nodeColor }}>
            {e.nodeLabel}
          </div>
        </Marker>
      ),
  ]);
}
