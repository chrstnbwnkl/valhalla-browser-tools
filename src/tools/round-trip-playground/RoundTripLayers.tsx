import type { LngLat } from "maplibre-gl";
import { useMemo } from "react";
import { fc, line } from "../../shared/map/geo";
import { useGeoJSONSource, useLayer } from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import { Popup } from "../../shared/map/Popup";
import type { ThemeColors } from "../../shared/theme/colors";
import { OptionFields } from "../../shared/valhalla/OptionFields";
import {
  optionState,
  type Location,
  type Option,
} from "../../shared/valhalla/request";
import {
  START_OPTIONS,
  destination,
  sectorRing,
  seedArea,
  type effectiveOptions,
} from "./request";
import { groupColor } from "./SeedMarkers";

export const START_MARKER = "start-marker";

type Props = {
  start: Location | null;
  at: [number, number] | null;
  options: ReturnType<typeof effectiveOptions>;
  showSeedArea: boolean;
  colors: ThemeColors;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onMove: (lngLat: LngLat) => void;
  onOption: (option: Option, raw: string) => void;
};

/** The start, the heading and where the server seeds intermediate points. */
export function RoundTripLayers({
  start,
  at,
  options,
  showSeedArea,
  colors,
  editing,
  onEdit,
  onMove,
  onOption,
}: Props) {
  const area = useMemo(() => {
    if (!at || !options) return null;
    const { distance, heading, headingTolerance } = options;
    const seeds = seedArea(distance, headingTolerance);
    const from = heading - headingTolerance;
    const step = (2 * headingTolerance) / seeds.groups;
    return {
      sectors: Array.from({ length: seeds.groups }, (_, i) => ({
        type: "Feature" as const,
        properties: { color: groupColor(colors, i + 1) },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            sectorRing(
              at,
              seeds.inner,
              seeds.outer,
              from + i * step,
              from + (i + 1) * step,
            ),
          ],
        },
      })),
      heading: line([at, destination(at, heading, seeds.outer)]),
    };
  }, [at, options, colors]);

  const visible = showSeedArea && area;
  useGeoJSONSource(
    "seed-area",
    useMemo(() => fc(visible ? area.sectors : []), [visible, area]),
  );
  useGeoJSONSource(
    "heading",
    useMemo(() => fc(area ? [area.heading] : []), [area]),
  );
  useLayer({
    id: "seed-area-fill",
    type: "fill",
    source: "seed-area",
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.08 },
  });
  useLayer({
    id: "seed-area",
    type: "line",
    source: "seed-area",
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1.5,
      "line-dasharray": [3, 2],
    },
  });
  useLayer({
    id: "heading",
    type: "line",
    source: "heading",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": colors.blue,
      "line-width": 2,
      "line-dasharray": [1, 2],
    },
  });

  if (!start || !at) return null;
  return (
    <>
      <Marker
        lngLat={at}
        draggable
        className="z-[2]"
        onDragEnd={onMove}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={() => onEdit(true)}
      >
        <div
          className={`${START_MARKER} size-[24px] cursor-grab rounded-full border-3 bg-surface text-center font-mono text-[12px]/[18px] font-bold text-ink`}
          style={{ borderColor: colors.green }}
          title="Drag to move the start, click for its options"
        >
          S
        </div>
      </Marker>
      {editing && (
        <Popup lngLat={at} onClose={() => onEdit(false)}>
          <div
            role="dialog"
            aria-label="Start options"
            className="caption max-h-[60vh] w-[360px] overflow-y-auto"
          >
            <div className="label px-3 pt-2 pr-8">Start</div>
            <OptionFields
              options={START_OPTIONS}
              valueOf={(option) => optionState([start], option.path)}
              onChange={onOption}
            />
          </div>
        </Popup>
      )}
    </>
  );
}
