import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";

export type Properties = Record<string, unknown>;

export const fc = <G extends Geometry>(
  features: Feature<G, Properties>[],
): FeatureCollection<G, Properties> => ({
  type: "FeatureCollection",
  features,
});

export const line = (
  coordinates: Position[],
  properties: Properties = {},
): Feature<LineString, Properties> => ({
  type: "Feature",
  properties,
  geometry: { type: "LineString", coordinates },
});

export const point = (
  coordinates: Position,
  properties: Properties = {},
): Feature<Point, Properties> => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates },
});

/** A polygon approximating a circle of `radius` meters. */
export function circle(
  [lon, lat]: Position,
  radius: number,
  properties: Properties = {},
): Feature<Polygon, Properties> {
  const dLat = radius / 111320;
  const dLon = dLat / Math.cos(((lat ?? 0) * Math.PI) / 180);
  const ring: Position[] = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    ring.push([
      (lon ?? 0) + dLon * Math.cos(angle),
      (lat ?? 0) + dLat * Math.sin(angle),
    ]);
  }
  return {
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/** Decodes a polyline into [lon, lat] positions; Valhalla uses precision 6. */
export function decodePolyline(str: string, precision = 6): Position[] {
  const factor = 10 ** precision;
  const coords: Position[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < str.length) {
    for (const isLon of [false, true]) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (isLon) lon += delta;
      else lat += delta;
    }
    coords.push([lon / factor, lat / factor]);
  }
  return coords;
}
