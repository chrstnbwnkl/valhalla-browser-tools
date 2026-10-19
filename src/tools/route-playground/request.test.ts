import { describe, expect, it } from "vitest";
import { encodePolyline } from "../../shared/map/geo";
import {
  costLines,
  costingOptionsOf,
  exclusionRings,
  factorEffect,
  inserted,
  moved,
  withCostLine,
  withCostingOption,
  withExclusion,
  withFactor,
  withoutCostLine,
  withoutExclusion,
} from "./request";

const a = { lat: 1, lon: 1 };
const b = { lat: 2, lon: 2 };
const c = { lat: 3, lon: 3 };
const ring = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
];
const feature = (r: number[][]) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [r] },
});

describe("locations", () => {
  it("inserts and moves", () => {
    expect(inserted([a, c], b, 1)).toEqual([a, b, c]);
    expect(inserted([a], b, 1)).toEqual([a, b]);
    expect(moved([a, b, c], 0, 2)).toEqual([b, c, a]);
    expect(moved([a, b, c], 2, 0)).toEqual([c, a, b]);
  });
});

describe("exclude polygons", () => {
  it("reads rings from a list or a FeatureCollection, skipping what isn't one", () => {
    expect(exclusionRings({ exclude_polygons: [ring, [[0, 0]], "x"] })).toEqual(
      [{ i: 0, ring }],
    );
    expect(
      exclusionRings({
        exclude_polygons: {
          type: "FeatureCollection",
          features: [{}, feature(ring)],
        },
      }),
    ).toEqual([{ i: 1, ring }]);
    expect(exclusionRings(null)).toEqual([]);
  });

  it("adds a ring in the form the request uses", () => {
    expect(withExclusion({}, ring)).toEqual({ exclude_polygons: [ring] });
    expect(
      withExclusion(
        { exclude_polygons: { type: "FeatureCollection", features: [] } },
        ring,
      ),
    ).toEqual({
      exclude_polygons: {
        type: "FeatureCollection",
        features: [feature(ring)],
      },
    });
  });

  it("removes one ring, or all, dropping the key when none are left", () => {
    expect(
      withoutExclusion({ exclude_polygons: [ring, ring], costing: "auto" }, 0),
    ).toEqual({
      exclude_polygons: [ring],
      costing: "auto",
    });
    expect(withoutExclusion({ exclude_polygons: [ring] }, 0)).toEqual({});
    expect(withoutExclusion({ exclude_polygons: [ring, ring] })).toEqual({});
  });
});

describe("cost lines", () => {
  const coords = [
    [13.1, 52.1],
    [13.2, 52.2],
  ];

  it("reads encoded and GeoJSON lines with their factors", () => {
    const request = {
      linear_cost_factors: [
        { shape: encodePolyline(coords), factor: 2 },
        {
          type: "Feature",
          geometry: { coordinates: coords },
          properties: { factor: 0.5 },
        },
        { shape: "?" },
      ],
    };
    expect(costLines(request)).toEqual([
      { i: 0, coords, factor: 2 },
      { i: 1, coords, factor: 0.5 },
    ]);
  });

  it("tells what a factor does", () => {
    expect([2, 0.5, 1, null].map(factorEffect)).toEqual([
      "avoid",
      "prefer",
      "neutral",
      "neutral",
    ]);
  });

  it("adds, changes and removes lines", () => {
    const one = withCostLine({}, "abc");
    expect(one).toEqual({ linear_cost_factors: [{ shape: "abc", factor: 1 }] });
    expect(withFactor(one, 0, 3)).toEqual({
      linear_cost_factors: [{ shape: "abc", factor: 3 }],
    });
    expect(
      withFactor(
        { linear_cost_factors: [{ geometry: {}, properties: { factor: 1 } }] },
        0,
        3,
      ),
    ).toEqual({
      linear_cost_factors: [{ geometry: {}, properties: { factor: 3 } }],
    });
    expect(withoutCostLine(one, 0)).toEqual({});
  });
});

describe("costing options", () => {
  it("sets and removes an option, and the objects it empties", () => {
    const set = withCostingOption(
      { costing: "auto" },
      "auto",
      "use_tolls",
      0.2,
    );
    expect(set).toEqual({
      costing: "auto",
      costing_options: { auto: { use_tolls: 0.2 } },
    });
    expect(costingOptionsOf(set, "auto")).toEqual({ use_tolls: 0.2 });
    expect(costingOptionsOf(set, "bicycle")).toEqual({});
    expect(withCostingOption(set, "auto", "use_tolls", undefined)).toEqual({
      costing: "auto",
    });
  });
});
