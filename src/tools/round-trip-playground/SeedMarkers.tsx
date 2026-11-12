import { useMemo } from "react";
import type { ThemeColors } from "../../shared/theme/colors";
import { fc, line, point } from "../../shared/map/geo";
import { useGeoJSONSource, useLayer } from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { Seed, SeedCandidate } from "./request";

const GROUP_COLORS = ["blue", "amber", "ink"] as const;

/** The colour of seed group `group`, counted from 1 as the server does. */
export const groupColor = (colors: ThemeColors, group: number) =>
  colors[GROUP_COLORS[(Math.max(1, group) - 1) % GROUP_COLORS.length]!];

/** The seeds the round trip on show passes through, numbered in that order. */
export function SeedMarkers({
  seeds,
  colors,
}: {
  seeds: Seed[];
  colors: ThemeColors;
}) {
  return seeds.map((seed, i) => (
    <Marker
      key={`seed:${i}:${seed.location.join(",")}`}
      lngLat={seed.location as [number, number]}
      className="z-[1]"
    >
      <div
        className="seed-marker size-[20px] rounded-sm border-3 bg-surface text-center font-mono text-[11px]/[14px] font-bold text-ink"
        style={{ borderColor: groupColor(colors, seed.group) }}
        title={`seed ${i + 1} · group ${seed.group} · ${seed.location.map((c) => c.toFixed(6)).join(",")}`}
      >
        {i + 1}
      </div>
    </Marker>
  ));
}

/**
 * Every sampled seed and every candidate of a debug response: dropped samples
 * as small grey dots, candidates as rings in their group's colour with a dashed
 * line to where they snapped.
 */
export function SeedCandidateLayers({
  dropped,
  candidates,
  colors,
}: {
  dropped: Seed[];
  candidates: SeedCandidate[];
  colors: ThemeColors;
}) {
  useGeoJSONSource(
    "seed-dropped",
    useMemo(() => fc(dropped.map((s) => point(s.location))), [dropped]),
  );
  useGeoJSONSource(
    "seed-snaps",
    useMemo(
      () =>
        fc(
          candidates.flatMap((c) =>
            c.snapped
              ? [
                  line([c.location, c.snapped], {
                    color: groupColor(colors, c.group),
                  }),
                ]
              : [],
          ),
        ),
      [candidates, colors],
    ),
  );
  useGeoJSONSource(
    "seed-snapped",
    useMemo(
      () =>
        fc(
          candidates.flatMap((c) =>
            c.snapped
              ? [point(c.snapped, { color: groupColor(colors, c.group) })]
              : [],
          ),
        ),
      [candidates, colors],
    ),
  );
  useGeoJSONSource(
    "seed-candidates",
    useMemo(
      () =>
        fc(
          candidates.map((c) =>
            point(c.location, { color: groupColor(colors, c.group) }),
          ),
        ),
      [candidates, colors],
    ),
  );

  useLayer({
    id: "seed-dropped",
    type: "circle",
    source: "seed-dropped",
    paint: {
      "circle-radius": 3,
      "circle-color": colors["ink-subtle"],
      "circle-opacity": 0.7,
    },
  });
  useLayer({
    id: "seed-snaps",
    type: "line",
    source: "seed-snaps",
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1.5,
      "line-dasharray": [2, 2],
    },
  });
  useLayer({
    id: "seed-snapped",
    type: "circle",
    source: "seed-snapped",
    paint: { "circle-radius": 3, "circle-color": ["get", "color"] },
  });
  useLayer({
    id: "seed-candidates",
    type: "circle",
    source: "seed-candidates",
    paint: {
      "circle-radius": 6,
      "circle-color": colors.surface,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": ["get", "color"],
    },
  });
  return null;
}
