import { describe, expect, it } from "vitest";
import type { ThemeColors } from "../../shared/theme/colors";
import {
  buildResults,
  counts,
  edgeRow,
  nodeRow,
  type LocateResult,
} from "./results";

const colors = new Proxy(
  {},
  { get: (_, name) => `<${String(name)}>` },
) as ThemeColors;

const VERBOSE_EDGE = {
  way_id: 123,
  correlated_lat: 52.5001,
  correlated_lon: 13.4001,
  side_of_street: "left",
  percent_along: 0.25,
  distance: 12.34,
  outbound_reach: 50,
  inbound_reach: 40,
  edge_info: {
    way_id: 123,
    names: ["Unter den Linden", "B2"],
    shape: "_izlhA~rlgdF_c`|@_c`|@",
  },
  edge: { forward: false, classification: { classification: "primary" } },
  bounding_circle: { lat: 52.5, lon: 13.4, radius: 30 },
};

describe("rows", () => {
  it("describes a verbose edge", () => {
    expect(edgeRow(VERBOSE_EDGE)).toEqual({
      title: "Unter den Linden / B2",
      detail:
        "way 123 · left · 25 % along · reverse · primary · 12.3 m away · reach 50 out / 40 in",
    });
  });

  it("describes a plain edge by its way", () => {
    expect(
      edgeRow({
        way_id: 7,
        correlated_lat: 0,
        correlated_lon: 0,
        side_of_street: "neither",
        percent_along: 1,
      }),
    ).toEqual({
      title: "way 7",
      detail: "neither · 100 % along",
    });
  });

  it("describes a node, or where it is when nothing else is known", () => {
    expect(
      nodeRow({ lat: 1, lon: 2, type: "street_intersection", edge_count: 4 })
        .detail,
    ).toBe("street_intersection · 4 edges");
    expect(nodeRow({ lat: 1, lon: 2 })).toEqual({
      title: "node",
      detail: "1, 2",
    });
  });
});

describe("buildResults", () => {
  const data: LocateResult[] = [
    {
      input_lat: 52.5,
      input_lon: 13.4,
      edges: [VERBOSE_EDGE],
      nodes: [{ lat: 52.6, lon: 13.5 }],
    },
    { input_lat: 1, input_lon: 1, edges: null, nodes: null },
  ];

  it("numbers rows across locations and ties features to them", () => {
    const results = buildResults(data, colors);
    expect(
      results.sections.map((s) => [
        s.location,
        s.color,
        s.summary,
        s.rows.map((r) => r.idx),
      ]),
    ).toEqual([
      [0, "<green>", "1 edges, 1 nodes", [0, 1]],
      [1, "<ink>", "nothing found", []],
    ]);
    expect(results.edges).toHaveLength(1);
    expect(results.edges[0]!.properties).toEqual({
      idx: 0,
      color: "<green>",
      reverse: true,
    });
    expect(results.circles[0]!.properties).toEqual({ idx: 0 });
    // the edge's point is hollow, the node's filled
    expect(results.points.map((p) => p.properties)).toEqual([
      { idx: 0, fill: "<surface>", stroke: "<green>" },
      { idx: 1, fill: "<green>", stroke: "<surface>" },
    ]);
    expect(results.snaps.map((s) => s.geometry.coordinates)).toEqual([
      [
        [13.4, 52.5],
        [13.4001, 52.5001],
      ],
      [
        [13.4, 52.5],
        [13.5, 52.6],
      ],
    ]);
  });

  it("counts what was found", () => {
    expect(counts(data)).toEqual({ edges: 1, nodes: 1 });
  });
});
