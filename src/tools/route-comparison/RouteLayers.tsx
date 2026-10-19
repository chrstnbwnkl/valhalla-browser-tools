import type { Position } from "geojson";
import { useMemo } from "react";
import { cn } from "../../shared/cn";
import { fmt } from "../../shared/format";
import { fc, line, point } from "../../shared/map/geo";
import {
  useGeoJSONSource,
  useLayer,
  useLayerEvent,
  type Filter,
} from "../../shared/map/hooks";
import { TAG } from "../../shared/map/labels";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import type { Json } from "../../shared/valhalla/request";
import type { Response } from "./response";

const ROUND = { "line-cap": "round", "line-join": "round" } as const;

type Props = {
  response: Response;
  routeIdx: number;
  highlighted: number | null;
  colors: ThemeColors;
  onHover: (idx: number | null) => void;
  onInspect: (title: string, object: Json, at: Position) => void;
};

/** A route by its steps or maneuvers, labelled with their costs. */
export function RouteLayers({
  response,
  routeIdx,
  highlighted,
  colors,
  onHover,
  onInspect,
}: Props) {
  const route = response.routes[routeIdx]!;
  const { segments } = route;
  const labelled = useMemo(
    () => segments.filter((s) => s.coords.length && !s.arrival),
    [segments],
  );
  const unit = response.format === "osrm" ? "step" : "maneuver";

  useGeoJSONSource(
    "alternatives",
    useMemo(
      () =>
        fc(
          response.routes
            .filter((_, i) => i !== routeIdx)
            .map((r) => line(r.coords)),
        ),
      [response, routeIdx],
    ),
  );
  useGeoJSONSource(
    "segments",
    useMemo(
      () =>
        fc(
          segments
            .filter((s) => s.coords.length > 1)
            .map((s) => line(s.coords, { idx: s.idx })),
        ),
      [segments],
    ),
  );
  useGeoJSONSource(
    "segment-ends",
    useMemo(() => fc(labelled.map((s) => point(s.coords.at(-1)!))), [labelled]),
  );
  useGeoJSONSource(
    "intersections",
    useMemo(
      () =>
        fc(
          segments.flatMap((s) =>
            s.intersections.map((intersection, i) =>
              point(intersection.at, {
                idx: s.idx,
                i,
                turnCost: intersection.turnCost,
              }),
            ),
          ),
        ),
      [segments],
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
    id: "segments-casing",
    type: "line",
    source: "segments",
    layout: ROUND,
    paint: { "line-color": colors.surface, "line-width": 9 },
  });
  useLayer({
    id: "segments",
    type: "line",
    source: "segments",
    layout: ROUND,
    paint: { "line-color": colors.green, "line-width": 5 },
  });
  useLayer({
    id: "segments-active",
    type: "line",
    source: "segments",
    layout: ROUND,
    filter: active,
    paint: {
      "line-color": colors.magenta,
      "line-width": 9,
      "line-opacity": 0.8,
    },
  });
  useLayer({
    id: "segment-ends",
    type: "circle",
    source: "segment-ends",
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
        [">", ["get", "turnCost"], 0],
        colors.amber,
        colors["ink-subtle"],
      ],
    },
  });

  useLayerEvent("mousemove", "segments", (e) =>
    onHover((e.features?.[0]?.properties.idx as number | undefined) ?? null),
  );
  useLayerEvent("mouseleave", "segments", () => onHover(null));

  return (
    <>
      {labelled.map((s) => (
        <Marker
          key={`cost:${s.idx}`}
          lngLat={s.coords.at(-1) as [number, number]}
          anchor="left"
          offset={[10, 0]}
          className={s.idx === highlighted ? "z-[1]" : undefined}
        >
          <button
            type="button"
            className={cn(
              TAG,
              "cursor-pointer border-2 border-green",
              s.idx === highlighted && "bg-magenta-soft",
            )}
            title={`${unit} ${s.idx}: ${s.title}`}
            onMouseEnter={() => onHover(s.idx)}
            onMouseLeave={() => onHover(null)}
            onClick={() =>
              onInspect(`${unit} ${s.idx}`, s.raw, s.coords.at(-1)!)
            }
          >
            {fmt(s.cost)}
          </button>
        </Marker>
      ))}
      {/* turn weights, on the other side of the intersection from the step weights */}
      {segments.flatMap((s) =>
        s.intersections.map((intersection, i) =>
          intersection.turnCost ? (
            <Marker
              key={`turn:${s.idx}:${i}`}
              lngLat={intersection.at as [number, number]}
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
                    intersection.raw,
                    intersection.at,
                  )
                }
              >
                t {fmt(intersection.turnCost)}
              </button>
            </Marker>
          ) : null,
        ),
      )}
      {response.waypoints.map(({ at, raw }, i) => (
        <Marker
          key={`waypoint:${i}`}
          lngLat={at as [number, number]}
          className="z-[2]"
        >
          <button
            type="button"
            className={cn(
              "grid size-6 cursor-pointer place-items-center rounded-full border-3 border-green bg-surface font-mono text-[11px]/none font-bold text-ink",
              i === 0 && "bg-green text-on-green",
              i > 0 &&
                i === response.waypoints.length - 1 &&
                "rounded-sm border-magenta bg-magenta text-on-magenta",
            )}
            title={`waypoint ${i}`}
            onClick={() => onInspect(`waypoint ${i}`, raw, at)}
          >
            {i + 1}
          </button>
        </Marker>
      ))}
    </>
  );
}
