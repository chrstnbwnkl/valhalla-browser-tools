import { expect, it } from "vitest";
import fixture from "../tools/route-playground/fixtures/route.json";
import { CoursePointType, Sport } from "./fit";
import { createDraft, parseDraft, stripRoute } from "./fitDraft";
import type { RouteResponse } from "./valhalla/osrm";

const route = (fixture as RouteResponse).routes[0]!;
const source = {
  server: "https://valhalla.example",
  costing: "bicycle",
  sent: { costing: "bicycle" },
  route,
};

it("strips the intersections off the route", () => {
  const stripped = stripRoute(route);
  expect(
    stripped.legs!.flatMap((l) => l.steps!).some((s) => "intersections" in s),
  ).toBe(false);
  expect(stripped.legs![0]!.steps![1]!.geometry).toBe(
    route.legs![0]!.steps![1]!.geometry,
  );
});

it("makes a draft with the maneuvers as course points", () => {
  const draft = createDraft(source);
  expect(draft.sport).toBe(Sport.Cycling);
  expect(draft.name).toMatch(/^bicycle \d+\.\d km$/);
  expect(draft.points).toHaveLength(12);
  expect(draft.points[0]!.type).toBe(CoursePointType.SegmentStart);
  expect(new Set(draft.points.map((p) => p.id)).size).toBe(12);
});

it("takes back what it stored and nothing else", () => {
  const draft = createDraft(source);
  expect(parseDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  expect(parseDraft(null)).toBeNull();
  expect(parseDraft({ version: 2 })).toBeNull();
  expect(parseDraft({ ...draft, points: "x" })).toBeNull();
});
