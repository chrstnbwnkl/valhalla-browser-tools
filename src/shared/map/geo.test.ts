import type { Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import {
  circle,
  decodePolyline,
  encodePolyline,
  fc,
  line,
  midpoint,
  point,
} from "./geo";

describe("decodePolyline", () => {
  it("decodes the reference example at precision 5", () => {
    // from Google's polyline algorithm documentation
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("defaults to precision 6, as Valhalla encodes", () => {
    expect(decodePolyline("_izlhA~rlgdF", 6)).toEqual([[-120.2, 38.5]]);
  });

  it("decodes nothing to nothing", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("circle", () => {
  it("rings the center at the radius", () => {
    const { geometry, properties } = circle([13.4, 52.5], 1000, { idx: 1 });
    const ring = geometry.coordinates[0]!;
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    // 1000 m north is ~0.009° of latitude
    expect(ring[16]![1]! - 52.5).toBeCloseTo(1000 / 111320, 6);
    expect(properties).toEqual({ idx: 1 });
  });
});

describe("features", () => {
  it("builds GeoJSON", () => {
    expect(
      fc<Geometry>([
        point([1, 2]),
        line(
          [
            [1, 2],
            [3, 4],
          ],
          { a: 1 },
        ),
      ]),
    ).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [1, 2] },
        },
        {
          type: "Feature",
          properties: { a: 1 },
          geometry: {
            type: "LineString",
            coordinates: [
              [1, 2],
              [3, 4],
            ],
          },
        },
      ],
    });
  });
});

describe("encodePolyline", () => {
  it("is the inverse of decoding", () => {
    const coords = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(encodePolyline(coords, 5)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline(encodePolyline(coords))).toEqual(coords);
  });
});

describe("midpoint", () => {
  it("is halfway along the line, not between its vertices", () => {
    expect(
      midpoint([
        [0, 0],
        [1, 0],
        [1, 3],
      ]),
    ).toEqual([1, 1]);
    expect(midpoint([[5, 5]])).toEqual([5, 5]);
  });
});
