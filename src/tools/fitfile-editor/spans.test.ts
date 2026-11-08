import { expect, it } from "vitest";
import { routeTrack } from "../../shared/course";
import type { FitRecord } from "../../shared/fit";
import type { RouteResponse } from "../../shared/valhalla/osrm";
import { routeEdges } from "../route-playground/edges";
import route from "../route-playground/fixtures/route.json";
import leg0 from "../route-playground/fixtures/trace-leg0.json";
import leg1 from "../route-playground/fixtures/trace-leg1.json";
import { flattenStructures, runs, spansOf } from "./spans";

it("places every edge on the track, in order", () => {
  const { records } = routeTrack((route as RouteResponse).routes[0]!);
  const edges = routeEdges(
    [leg0, leg1].map((path) => ({ path: path, snapped: false })),
  );
  const spans = spansOf(edges, records);
  expect(spans).toHaveLength(edges.length);
  for (let i = 1; i < spans.length; i++)
    expect(spans[i]!.from).toBeGreaterThanOrEqual(spans[i - 1]!.from - 1);
  const total = records.at(-1)!.distance;
  expect(spans.at(-1)!.to).toBeGreaterThan(total - 5);
});

it("runs together consecutive spans", () => {
  const spans = [0, 1, 2, 3, 4].map((i) => ({
    from: i * 10,
    to: i * 10 + 10,
    edge: { bridge: i === 1 || i === 2 || i === 4 },
    node: undefined,
  }));
  expect(
    runs(spans, (s) => !!s.edge.bridge).map(({ from, to }) => [from, to]),
  ).toEqual([
    [10, 30],
    [40, 50],
  ]);
});

it("takes bridges straight across the valley under them", () => {
  const records: FitRecord[] = Array.from({ length: 11 }, (_, i) => ({
    lon: 0,
    lat: 0,
    distance: i * 10,
    time: i,
  }));
  const alt = [50, 50, 50, 20, 10, 20, 50, 60, 60, 60, 60];
  const spans = [{ from: 20, to: 70, edge: { bridge: true }, node: undefined }];
  expect(flattenStructures(records, alt, spans)).toEqual([
    50, 50, 50, 52, 54, 56, 58, 60, 60, 60, 60,
  ]);
});
