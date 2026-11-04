import { describe, expect, it } from "vitest";
import type { RouteEdge } from "../route-playground/edges";
import { edgeLength, histogram, numericKeys } from "./histogram";

const edge = (idx: number, attributes: Record<string, unknown>): RouteEdge => ({
  idx,
  leg: 0,
  edge: attributes,
  node: undefined,
  coords: [
    [13.4, 52.5],
    [13.41, 52.5],
  ],
});

describe("numericKeys", () => {
  it("lists the attributes that are numbers on every edge, but not identifiers", () => {
    const edges = [
      edge(0, {
        density: 3,
        speed: 50,
        way_id: 1,
        names: ["A"],
        begin_shape_index: 0,
      }),
      edge(1, { density: 4, speed: "fast", lane_count: 2 }),
    ];
    expect(numericKeys(edges)).toEqual(["density", "lane_count"]);
  });
});

describe("edgeLength", () => {
  it("is the length attribute, or the length of the shape without one", () => {
    expect(edgeLength(edge(0, { length: 0.5 }))).toBe(0.5);
    // 0.01° of longitude at 52.5° N
    expect(edgeLength(edge(0, {}))).toBeCloseTo(0.677, 2);
    expect(edgeLength(edge(0, {}), "miles")).toBeCloseTo(0.421, 2);
  });
});

describe("histogram", () => {
  it("bins integer values one each and weights the mean by distance", () => {
    const h = histogram(
      [
        edge(0, { density: 2, length: 3 }),
        edge(1, { density: 4, length: 1 }),
        edge(2, { density: 4, length: 1 }),
        edge(3, { length: 5 }),
      ],
      "density",
    )!;
    expect(h.discrete).toBe(true);
    expect(h.bins.map((b) => [b.from, b.distance, b.edges])).toEqual([
      [2, 3, [0]],
      [3, 0, []],
      [4, 2, [1, 2]],
    ]);
    // (2·3 + 4·1 + 4·1) / 5, not the plain mean of 3.33
    expect(h.mean).toBeCloseTo(2.8);
    expect(h.distance).toBe(5);
    expect(h.missing).toBe(5);
  });

  it("bins continuous values in round steps, the maximum in the last bin", () => {
    const h = histogram(
      [
        edge(0, { grade: 0.3, length: 1 }),
        edge(1, { grade: 7.9, length: 1 }),
        edge(2, { grade: 10, length: 2 }),
      ],
      "grade",
    )!;
    expect(h.discrete).toBe(false);
    expect(h.bins[0]!.from).toBe(0);
    expect(h.bins[1]!.from - h.bins[0]!.from).toBe(0.5);
    expect(h.bins.at(-1)!.edges).toEqual([2]);
    expect(h.bins.reduce((sum, b) => sum + b.edges.length, 0)).toBe(3);
  });

  it("is null without values", () => {
    expect(histogram([edge(0, { length: 1 })], "density")).toBeNull();
  });
});
