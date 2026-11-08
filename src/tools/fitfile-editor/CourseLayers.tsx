import type { LngLat } from "maplibre-gl";
import { useMemo } from "react";
import { cn } from "../../shared/cn";
import type { FitRecord } from "../../shared/fit";
import type { EditorPoint } from "../../shared/fitDraft";
import { fc, line, point } from "../../shared/map/geo";
import { useGeoJSONSource, useLayer } from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import type { Suggestion } from "./suggestions";
import { glyphOf, typeLabel } from "./types";

type Props = {
  records: FitRecord[];
  points: EditorPoint[];
  suggestions: Suggestion[];
  selected: string | null;
  /** The suggestion under the pointer in the list. */
  hoveredSuggestion: string | null;
  /** Where the pointer is on the profile, in meters. */
  cursor: { lon: number; lat: number } | null;
  colors: ThemeColors;
  onSelect: (id: string) => void;
  onMove: (id: string, at: LngLat) => void;
  onPointMenu: (id: string, e: MouseEvent) => void;
};

export function CourseLayers({
  records,
  points,
  suggestions,
  selected,
  hoveredSuggestion,
  cursor,
  colors,
  onSelect,
  onMove,
  onPointMenu,
}: Props) {
  useGeoJSONSource(
    "track",
    useMemo(
      () =>
        fc(records.length ? [line(records.map((r) => [r.lon, r.lat]))] : []),
      [records],
    ),
  );
  useLayer({
    id: "track-casing",
    type: "line",
    source: "track",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.surface, "line-width": 7 },
  });
  useLayer({
    id: "track",
    type: "line",
    source: "track",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.green, "line-width": 4 },
  });

  useGeoJSONSource(
    "suggestions",
    useMemo(
      () =>
        fc(
          suggestions.map((s) =>
            point([s.point.lon, s.point.lat], {
              id: s.id,
              hovered: s.id === hoveredSuggestion,
            }),
          ),
        ),
      [suggestions, hoveredSuggestion],
    ),
  );
  useLayer({
    id: "suggestions",
    type: "circle",
    source: "suggestions",
    paint: {
      "circle-radius": ["case", ["get", "hovered"], 9, 5],
      "circle-color": colors.surface,
      "circle-stroke-color": colors.amber,
      "circle-stroke-width": ["case", ["get", "hovered"], 3, 2],
    },
  });

  return (
    <>
      {points.map((p) => (
        <Marker
          key={p.id}
          lngLat={[p.lon, p.lat]}
          draggable
          className={p.id === selected ? "z-2" : "z-1"}
          onDragEnd={(at) => onMove(p.id, at)}
          onClick={() => onSelect(p.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPointMenu(p.id, e);
          }}
        >
          <div
            title={`${typeLabel(p.type)} ${p.name}`.trim()}
            aria-label={`Course point ${typeLabel(p.type)} ${p.name}`.trim()}
            className={cn(
              "grid size-6 cursor-grab place-items-center rounded-full border-2 border-surface font-sans text-[12px] font-bold shadow-float",
              p.id === selected
                ? "bg-ink text-surface"
                : "bg-surface-raised text-ink",
            )}
          >
            {glyphOf(p.type)}
          </div>
        </Marker>
      ))}
      {cursor && (
        <Marker lngLat={[cursor.lon, cursor.lat]} className="z-3">
          <div className="pointer-events-none size-3.5 rounded-full border-2 border-surface bg-ink" />
        </Marker>
      )}
    </>
  );
}
