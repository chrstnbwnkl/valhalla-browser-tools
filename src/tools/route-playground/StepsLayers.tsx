import type { Position } from "geojson";
import { useMemo } from "react";
import { cn } from "../../shared/cn";
import { fc, line, point } from "../../shared/map/geo";
import {
  useGeoJSONSource,
  useLayer,
  useLayerEvent,
  type Filter,
} from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import { fmt } from "../../shared/format";
import { TAG } from "../../shared/map/labels";
import type {
  FlatStep,
  Intersection,
  RouteResponse,
} from "../../shared/valhalla/osrm";

const ROUND = { "line-cap": "round", "line-join": "round" } as const;

type Props = {
  alternatives: Position[][];
  steps: FlatStep[];
  /** The whole route, for a response without steps. */
  coords: Position[];
  waypoints: RouteResponse["waypoints"];
  highlighted: number | null;
  colors: ThemeColors;
  onHover: (idx: number | null) => void;
  onInspect: (title: string, object: Intersection, at: Position) => void;
};

export function StepsLayers({
  alternatives,
  steps,
  coords,
  waypoints,
  highlighted,
  colors,
  onHover,
  onInspect,
}: Props) {
  // the arrival has no line to label
  const labelled = useMemo(
    () =>
      steps.filter(
        (s) => s.coords.length && s.step.maneuver?.type !== "arrive",
      ),
    [steps],
  );

  useGeoJSONSource(
    "alternatives",
    useMemo(() => fc(alternatives.map((c) => line(c))), [alternatives]),
  );
  useGeoJSONSource(
    "steps",
    useMemo(
      () =>
        fc(
          steps.length
            ? steps
                .filter((s) => s.coords.length > 1)
                .map((s) => line(s.coords, { idx: s.idx }))
            : [line(coords, { idx: -2 })],
        ),
      [steps, coords],
    ),
  );
  useGeoJSONSource(
    "step-ends",
    useMemo(() => fc(labelled.map((s) => point(s.coords.at(-1)!))), [labelled]),
  );
  useGeoJSONSource(
    "intersections",
    useMemo(
      () =>
        fc(
          steps.flatMap((s) =>
            (s.step.intersections ?? []).flatMap((intersection, i) =>
              intersection.location
                ? [
                    point(intersection.location, {
                      idx: s.idx,
                      i,
                      turnWeight: intersection.turn_weight ?? 0,
                    }),
                  ]
                : [],
            ),
          ),
        ),
      [steps],
    ),
  );
  useGeoJSONSource(
    "waypoints",
    useMemo(
      () =>
        fc(
          (waypoints ?? []).flatMap((w, i) =>
            w?.location ? [point(w.location, { i })] : [],
          ),
        ),
      [waypoints],
    ),
  );

  const active: Filter = ["==", ["get", "idx"], highlighted ?? -1];
  useLayer({
    id: "alternatives",
    type: "line",
    source: "alternatives",
    layout: ROUND,
    paint: { "line-color": colors.ink, "line-width": 5, "line-opacity": 0.4 },
  });
  useLayer({
    id: "steps-casing",
    type: "line",
    source: "steps",
    layout: ROUND,
    paint: { "line-color": colors.surface, "line-width": 9 },
  });
  useLayer({
    id: "steps",
    type: "line",
    source: "steps",
    layout: ROUND,
    paint: { "line-color": colors.green, "line-width": 5 },
  });
  useLayer({
    id: "steps-active",
    type: "line",
    source: "steps",
    layout: ROUND,
    filter: active,
    paint: {
      "line-color": colors.magenta,
      "line-width": 9,
      "line-opacity": 0.8,
    },
  });
  useLayer({
    id: "step-ends",
    type: "circle",
    source: "step-ends",
    paint: {
      "circle-color": colors.surface,
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.green,
    },
  });
  // amber where the intersection carries a turn weight
  useLayer({
    id: "intersections",
    type: "circle",
    source: "intersections",
    paint: {
      "circle-radius": 3,
      "circle-color": [
        "case",
        [">", ["get", "turnWeight"], 0],
        colors.amber,
        colors["ink-subtle"],
      ],
    },
  });
  // where the server snapped the waypoints to
  useLayer({
    id: "waypoints",
    type: "circle",
    source: "waypoints",
    paint: {
      "circle-color": colors.ink,
      "circle-radius": 5,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.surface,
    },
  });

  useLayerEvent("mousemove", "steps", (e) =>
    onHover((e.features?.[0]?.properties.idx as number | undefined) ?? null),
  );
  useLayerEvent("mouseleave", "steps", () => onHover(null));

  return (
    <>
      {labelled.map((s) => (
        <Marker
          key={`step:${s.idx}`}
          lngLat={s.coords.at(-1) as [number, number]}
          anchor="left"
          offset={[10, 0]}
          className={s.idx === highlighted ? "z-[1]" : undefined}
        >
          <div
            className={cn(
              TAG,
              "cursor-pointer border-2 border-green",
              s.idx === highlighted && "bg-magenta-soft",
            )}
            title={`step ${s.idx} weight`}
            onMouseEnter={() => onHover(s.idx)}
            onMouseLeave={() => onHover(null)}
          >
            {fmt(s.step.weight)}
          </div>
        </Marker>
      ))}
      {/* turn weights, on the other side of the intersection from the step weights */}
      {steps.flatMap((s) =>
        (s.step.intersections ?? []).map((intersection, i) =>
          intersection.turn_weight && intersection.location ? (
            <Marker
              key={`turn:${s.idx}:${i}`}
              lngLat={intersection.location as [number, number]}
              anchor="right"
              offset={[-10, 0]}
            >
              <button
                type="button"
                className={cn(
                  TAG,
                  "cursor-pointer border-amber bg-amber-soft text-amber-ink",
                )}
                title={`step ${s.idx} · intersection ${i} turn_weight`}
                onClick={() =>
                  onInspect(
                    `step ${s.idx} · intersection ${i}`,
                    intersection,
                    intersection.location!,
                  )
                }
              >
                t {fmt(intersection.turn_weight)}
              </button>
            </Marker>
          ) : null,
        ),
      )}
    </>
  );
}
