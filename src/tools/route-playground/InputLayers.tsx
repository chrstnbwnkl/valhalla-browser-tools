import type { Position } from "geojson";
import type { LngLat } from "maplibre-gl";
import { useMemo } from "react";
import { cn } from "../../shared/cn";
import { fc, line, midpoint } from "../../shared/map/geo";
import { useGeoJSONSource, useLayer } from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import { positionOf, type Location } from "../../shared/valhalla/request";
import { TAG } from "../../shared/map/labels";
import { costLines, exclusionRings, factorEffect } from "./request";

const EFFECT_COLOR = {
  avoid: "danger",
  prefer: "blue",
  neutral: "ink-muted",
} as const;

type Props = {
  locations: Location[];
  rings: ReturnType<typeof exclusionRings>;
  lines: ReturnType<typeof costLines>;
  colors: ThemeColors;
  onMoveLocation: (index: number, lngLat: LngLat) => void;
  onLocationMenu: (index: number, e: MouseEvent) => void;
  onEditLocation: (index: number) => void;
  onFactor: (i: number, at: Position) => void;
};

export function InputLayers({
  locations,
  rings,
  lines,
  colors,
  onMoveLocation,
  onLocationMenu,
  onEditLocation,
  onFactor,
}: Props) {
  const lineColor = (factor: number | null) =>
    colors[EFFECT_COLOR[factorEffect(factor)]];

  useGeoJSONSource(
    "exclusions",
    useMemo(
      () =>
        fc(
          rings.map(({ i, ring }) => ({
            type: "Feature" as const,
            properties: { i },
            geometry: { type: "Polygon" as const, coordinates: [ring] },
          })),
        ),
      [rings],
    ),
  );
  useGeoJSONSource(
    "cost-lines",
    useMemo(
      () =>
        fc(
          lines.map(({ i, coords, factor }) =>
            line(coords, {
              i,
              color: colors[EFFECT_COLOR[factorEffect(factor)]],
            }),
          ),
        ),
      [lines, colors],
    ),
  );
  useLayer({
    id: "exclusions-fill",
    type: "fill",
    source: "exclusions",
    paint: { "fill-color": colors.danger, "fill-opacity": 0.15 },
  });
  useLayer({
    id: "exclusions",
    type: "line",
    source: "exclusions",
    paint: {
      "line-color": colors.danger,
      "line-width": 2,
      "line-dasharray": [3, 2],
    },
  });
  useLayer({
    id: "cost-lines",
    type: "line",
    source: "cost-lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 12,
      "line-opacity": 0.4,
    },
  });

  return (
    <>
      {lines.map(({ i, coords, factor }) => (
        <Marker
          key={`factor:${i}`}
          lngLat={midpoint(coords) as [number, number]}
        >
          <button
            type="button"
            className={cn(TAG, "cursor-pointer border-2")}
            style={{ borderColor: lineColor(factor) }}
            title="Click to change the factor or delete the line"
            onClick={() => onFactor(i, midpoint(coords))}
          >
            × {factor ?? "?"}
          </button>
        </Marker>
      ))}
      {locations.map((location, i) => {
        const at = positionOf(location);
        if (!at) return null;
        const role =
          i === 0
            ? "start"
            : i === locations.length - 1
              ? "destination"
              : "stop";
        return (
          <Marker
            key={`waypoint:${i}`}
            lngLat={at}
            draggable
            // above the labels of the route, so it can always be dragged
            className="z-[2]"
            onDragEnd={(lngLat) => onMoveLocation(i, lngLat)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation(); // or the map opens its own menu
              onLocationMenu(i, e);
            }}
            onLongPress={() => onEditLocation(i)}
          >
            <div
              className={cn(
                "input-marker grid size-6 cursor-grab place-items-center rounded-full border-3 border-green bg-surface font-mono text-[11px]/none font-bold text-ink",
                role === "start" && "bg-green text-on-green",
                role === "destination" &&
                  "rounded-sm border-magenta bg-magenta text-on-magenta",
              )}
              title="Drag to move, hold for its options, right-click to delete or reorder"
            >
              {i + 1}
            </div>
          </Marker>
        );
      })}
    </>
  );
}
