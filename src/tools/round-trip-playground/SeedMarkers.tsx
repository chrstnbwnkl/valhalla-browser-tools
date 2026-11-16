import { useMemo } from "react";
import { fc, point } from "../../shared/map/geo";
import { useGeoJSONSource, useLayer } from "../../shared/map/hooks";
import { Marker } from "../../shared/map/Marker";
import type { ThemeColors } from "../../shared/theme/colors";
import type { Seed } from "./request";

const lonLat = (seed: Seed) => seed.location.map((c) => c.toFixed(6)).join(",");

/**
 * The turning points of the round trip on show: the unused ones as grey rings,
 * the two it uses numbered in the order it passes them.
 */
export function SeedLayers({
  seeds,
  colors,
}: {
  seeds: Seed[];
  colors: ThemeColors;
}) {
  useGeoJSONSource(
    "seeds-unused",
    useMemo(
      () => fc(seeds.filter((s) => !s.used).map((s) => point(s.location))),
      [seeds],
    ),
  );
  useLayer({
    id: "seeds-unused",
    type: "circle",
    source: "seeds-unused",
    paint: {
      "circle-radius": 5,
      "circle-color": colors.surface,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors["ink-muted"],
    },
  });

  return seeds
    .filter((s) => s.used)
    .map((seed, i) => (
      <Marker
        key={`seed:${i}:${lonLat(seed)}`}
        lngLat={seed.location as [number, number]}
        className="z-[1]"
      >
        <div
          className="seed-marker size-[20px] rounded-sm border-3 bg-surface text-center font-mono text-[11px]/[14px] font-bold text-ink"
          style={{ borderColor: colors.blue }}
          title={`turning point ${i + 1} · ${lonLat(seed)}`}
        >
          {i + 1}
        </div>
      </Marker>
    ));
}
