import type { Position } from "geojson";
import {
  LngLatBounds,
  type FitBoundsOptions,
  type Map as MapLibreMap,
} from "maplibre-gl";

export function fitTo(
  map: MapLibreMap,
  coords: Position[],
  options: FitBoundsOptions,
) {
  if (!coords.length) return;
  const bounds = coords.reduce(
    (b, [lon = 0, lat = 0]) => b.extend([lon, lat]),
    new LngLatBounds(),
  );
  map.fitBounds(bounds, options);
}
